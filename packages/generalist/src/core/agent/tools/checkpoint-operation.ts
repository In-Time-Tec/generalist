import { Equal, Schema } from "effect"
import type { DriverCheckpoint, OperationOutcome } from "../../durable/driver/contract.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { domainFailureResult, successResult, type AnyToolCall } from "./result.js"
import { completed, updateCall } from "./checkpoint.js"

const PersistedToolOutcome = Schema.Union([
  Schema.TaggedStruct("Success", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  Schema.TaggedStruct("DomainFailure", { failure: Schema.Unknown, encodedFailure: Schema.Unknown }),
  Schema.TaggedStruct("Suspend", { token: Schema.String }),
])

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
    if (
      batch === undefined ||
      entry === undefined ||
      entry.operationKey !== input.operationKey ||
      entry.call.id !== input.call.id ||
      entry.call.name !== input.call.name ||
      !Equal.equals(entry.call.params, input.call.params)
    ) {
      throw new TypeError(`Tool operation ${input.operationKey} does not match its batch checkpoint`)
    }
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
      const decoded = Schema.decodeUnknownSync(PersistedToolOutcome)(outcome.value)
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
        },
        activatedSkills: input.activatedSkills,
        invocationPath: input.invocationPath,
      })
    })()
    return { ...checkpoint, state: { ...state, toolBatch: nextBatch } }
  }
