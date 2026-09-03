import { Equal, Schema } from "effect"
import type { DriverCheckpoint, OperationOutcome } from "../../durable/driver/contract.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { domainFailureResult, successResult, type AnyToolCall } from "./result.js"
import { completed, effectiveCall, updateCall } from "./checkpoint.js"
import { AwaitEvent } from "./wake-event.js"
import { Items as TaskItems, writeToolName } from "../../../tasks/item.js"
import {
  Source as CapabilitySource,
  accumulate,
  type Checkpoint as CapabilityCheckpoint,
} from "../../capability/state.js"

const PersistedToolOutcome = Schema.Union([
  Schema.TaggedStruct("Success", {
    result: Schema.Unknown,
    encodedResult: Schema.Unknown,
    taint: Schema.optionalKey(Schema.Array(CapabilitySource)),
  }),
  Schema.TaggedStruct("DomainFailure", {
    failure: Schema.Unknown,
    encodedFailure: Schema.Unknown,
    taint: Schema.optionalKey(Schema.Array(CapabilitySource)),
  }),
  Schema.TaggedStruct("Suspend", { token: Schema.String, awaitEvent: Schema.optionalKey(AwaitEvent) }),
])

const capabilityCheckpoint = (
  current: CapabilityCheckpoint | undefined,
  outcome: typeof PersistedToolOutcome.Type | undefined,
) => {
  if (outcome === undefined || outcome._tag === "Suspend" || outcome.taint === undefined) return current
  return accumulate(current, outcome.taint)
}

/** Apply one durable operation outcome to its exact authored call checkpoint. */
export const applyToolOutcome =
  (input: {
    readonly callIndex: number
    readonly call: AnyToolCall
    readonly operationKey: string
    readonly activatedSkills: ReadonlyArray<string>
    readonly invocationPath: ReadonlyArray<string>
    readonly collapseSuspension: boolean
  }) =>
  (checkpoint: DriverCheckpoint, outcome: OperationOutcome): DriverCheckpoint => {
    const state = Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state)
    const batch = state.toolBatch
    const entry = batch?.calls[input.callIndex]
    const expectedCall = entry === undefined ? undefined : effectiveCall(entry)
    if (
      batch === undefined ||
      entry === undefined ||
      expectedCall === undefined ||
      entry.operationKey !== input.operationKey ||
      expectedCall.id !== input.call.id ||
      expectedCall.name !== input.call.name ||
      !Equal.equals(expectedCall.params, input.call.params)
    ) {
      throw new TypeError(`Tool operation ${input.operationKey} does not match its batch checkpoint`)
    }
    const decoded =
      outcome._tag === "Succeeded" ? Schema.decodeUnknownSync(PersistedToolOutcome)(outcome.value) : undefined
    const nextBatch = (() => {
      if (outcome._tag === "Unknown") {
        return updateCall(batch, {
          callIndex: input.callIndex,
          state: { _tag: "Unknown", operationId: outcome.operationId },
        })
      }
      if (outcome._tag === "Failed") {
        return updateCall(batch, {
          callIndex: input.callIndex,
          state: { _tag: "Cancelled", reason: "execution-failed" },
        })
      }
      if (decoded === undefined) throw new TypeError(`Tool operation ${input.operationKey} has no persisted outcome`)
      if (decoded._tag === "Success") return completed(batch, input.callIndex, successResult(input.call, decoded))
      if (decoded._tag === "DomainFailure") {
        return completed(batch, input.callIndex, domainFailureResult(input.call, decoded))
      }
      if (input.collapseSuspension) {
        const failure = {
          reason: "suspended" as const,
          message: `Tool ${input.call.name} suspended (${decoded.token})`,
        }
        return completed(
          batch,
          input.callIndex,
          domainFailureResult(input.call, { _tag: "DomainFailure", failure, encodedFailure: failure }),
        )
      }
      return updateCall(batch, {
        callIndex: input.callIndex,
        state: {
          _tag: "Waiting",
          reason: "tool-wait",
          waitId: input.operationKey,
          token: decoded.token,
          ...(decoded.awaitEvent === undefined ? undefined : { awaitEvent: decoded.awaitEvent }),
        },
        activatedSkills: input.activatedSkills,
        invocationPath: input.invocationPath,
      })
    })()
    const tasks = (() => {
      if (input.call.name !== writeToolName || decoded === undefined) return state.tasks
      return decoded._tag === "Success" ? Schema.decodeUnknownSync(TaskItems)(decoded.result) : state.tasks
    })()
    const capabilities = capabilityCheckpoint(state.capabilities, decoded)
    return {
      ...checkpoint,
      state: {
        ...state,
        toolBatch: nextBatch,
        ...Object.assign({}, tasks === undefined ? undefined : { tasks }),
        ...Object.assign({}, capabilities === undefined ? undefined : { capabilities }),
      },
    }
  }
