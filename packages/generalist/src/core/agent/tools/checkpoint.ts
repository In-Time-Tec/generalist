import { Function, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { ReplayPolicy } from "../../durable/driver/contract.js"
import type { ResumeResolution } from "../lifecycle/resume.js"
import type { PendingToolResult } from "./result.js"

/** Canonical model-authored framework call persisted in one tool-batch checkpoint. */
export const CanonicalToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
export type CanonicalToolCall = typeof CanonicalToolCall.Type

/** The one current state of a model-authored framework call. */
export const ToolCallCheckpointState = Schema.Union([
  Schema.TaggedStruct("Ready", { stage: Schema.Literals(["authorization", "execution"]) }),
  Schema.TaggedStruct("Scheduled", {
    inputDigest: Schema.String,
    replayPolicy: ReplayPolicy,
  }),
  Schema.TaggedStruct("Waiting", {
    reason: Schema.Literals(["approval", "tool-wait"]),
    waitId: Schema.String,
    token: Schema.String,
  }),
  Schema.TaggedStruct("Completed", { result: Prompt.ToolResultPart }),
  Schema.TaggedStruct("Unknown", { operationId: Schema.String }),
  Schema.TaggedStruct("Cancelled", { reason: Schema.optionalKey(Schema.String) }),
])
export type ToolCallCheckpointState = typeof ToolCallCheckpointState.Type

/** One call and its exact state, retained in model-authored order. */
export const ToolCallCheckpoint = Schema.Struct({
  call: CanonicalToolCall,
  operationKey: Schema.String,
  state: ToolCallCheckpointState,
})
export type ToolCallCheckpoint = typeof ToolCallCheckpoint.Type

/** The sole reconstruction authority for one authored framework tool batch. */
export const ToolBatchCheckpoint = Schema.Struct({
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  calls: Schema.Array(ToolCallCheckpoint),
  activeTools: Schema.Array(Schema.String),
  authorizationContextDigest: Schema.String,
  activatedSkills: Schema.Array(Schema.String),
  invocationPath: Schema.Array(Schema.String),
})
export type ToolBatchCheckpoint = typeof ToolBatchCheckpoint.Type

/** One exact open wait exposed by an Agent suspension. */
export const ToolBatchWait = Schema.Struct({
  waitId: Schema.String,
  token: Schema.String,
  reason: Schema.Literals(["approval", "tool-wait"]),
  callIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  call: CanonicalToolCall,
})
export type ToolBatchWait = typeof ToolBatchWait.Type

/** One targeted resolution supplied when re-entering a suspended batch. */
export class ToolBatchResolution extends Schema.Class<ToolBatchResolution>("ToolBatchResolution")({
  waitId: Schema.String,
  resolution: Schema.Union([
    Schema.TaggedStruct("Approved", {}),
    Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
    Schema.TaggedStruct("Signal", { name: Schema.String, payload: Schema.optionalKey(Schema.Unknown) }),
  ]),
}) {
  declare readonly resolution: ResumeResolution
}

export const canonicalCall = (
  call: Pick<Response.ToolCallPart<string, unknown>, "id" | "name" | "params" | "providerExecuted"> & {
    readonly metadata?: Response.ProviderMetadata
  },
): CanonicalToolCall => ({
  type: "tool-call",
  id: call.id,
  name: call.name,
  params: call.params,
  providerExecuted: call.providerExecuted,
  metadata: call.metadata ?? {},
})

export const make = (input: {
  readonly turn: number
  readonly calls: ReadonlyArray<Response.ToolCallPart<string, unknown>>
  readonly operationKeys: ReadonlyArray<string>
  readonly activeTools: ReadonlyArray<string>
  readonly authorizationContextDigest: string
}): ToolBatchCheckpoint => ({
  turn: input.turn,
  calls: input.calls.map((call, index) => ({
    call: canonicalCall(call),
    operationKey: input.operationKeys[index]!,
    state: { _tag: "Ready", stage: "authorization" },
  })),
  activeTools: [...input.activeTools],
  authorizationContextDigest: input.authorizationContextDigest,
  activatedSkills: [],
  invocationPath: [],
})

interface UpdateCallInput {
  readonly callIndex: number
  readonly state: ToolCallCheckpointState
  readonly activatedSkills?: ReadonlyArray<string>
  readonly invocationPath?: ReadonlyArray<string>
}

export const updateCall: {
  (input: UpdateCallInput): (checkpoint: ToolBatchCheckpoint) => ToolBatchCheckpoint
  (checkpoint: ToolBatchCheckpoint, input: UpdateCallInput): ToolBatchCheckpoint
} = Function.dual(
  2,
  (checkpoint: ToolBatchCheckpoint, input: UpdateCallInput): ToolBatchCheckpoint => ({
    ...checkpoint,
    calls: checkpoint.calls.map((entry, index) =>
      index === input.callIndex ? { ...entry, state: input.state } : entry,
    ),
    activatedSkills: input.activatedSkills === undefined ? checkpoint.activatedSkills : [...input.activatedSkills],
    invocationPath: input.invocationPath === undefined ? checkpoint.invocationPath : [...input.invocationPath],
  }),
)

export const completed: {
  (callIndex: number, result: PendingToolResult): (checkpoint: ToolBatchCheckpoint) => ToolBatchCheckpoint
  (checkpoint: ToolBatchCheckpoint, callIndex: number, result: PendingToolResult): ToolBatchCheckpoint
} = Function.dual(3, (checkpoint: ToolBatchCheckpoint, callIndex: number, result: PendingToolResult) =>
  updateCall(checkpoint, {
    callIndex,
    state: {
      _tag: "Completed",
      result: Prompt.makePart("tool-result", {
        id: result.id,
        name: result.name,
        isFailure: result.isFailure,
        result: result.encodedResult,
        providerExecuted: result.providerExecuted,
        options: result.metadata,
      }),
    },
  }),
)

export const pendingResult = (result: Prompt.ToolResultPart): PendingToolResult =>
  Response.toolResultPart({
    id: result.id,
    name: result.name,
    isFailure: result.isFailure,
    result: result.result,
    encodedResult: result.result,
    providerExecuted: result.providerExecuted,
    preliminary: false,
    metadata: result.options,
  })

/** Completed results that can now extend the authored-order transcript prefix. */
export const projectableResults: {
  (
    projected: ReadonlySet<string>,
    pendingIndexes: ReadonlySet<number>,
  ): (checkpoint: ToolBatchCheckpoint) => ReadonlyArray<readonly [number, PendingToolResult]>
  (
    checkpoint: ToolBatchCheckpoint,
    projected: ReadonlySet<string>,
    pendingIndexes: ReadonlySet<number>,
  ): ReadonlyArray<readonly [number, PendingToolResult]>
} = Function.dual(
  3,
  (
    checkpoint: ToolBatchCheckpoint,
    projected: ReadonlySet<string>,
    pendingIndexes: ReadonlySet<number>,
  ): ReadonlyArray<readonly [number, PendingToolResult]> => {
    const results: Array<readonly [number, PendingToolResult]> = []
    for (const [index, entry] of checkpoint.calls.entries()) {
      const key = `${entry.call.id}\0${entry.call.name}`
      if (projected.has(key) || pendingIndexes.has(index)) continue
      if (entry.state._tag !== "Completed") break
      results.push([index, pendingResult(entry.state.result)])
    }
    return results
  },
)

export const waits = (checkpoint: ToolBatchCheckpoint): ReadonlyArray<ToolBatchWait> =>
  checkpoint.calls.flatMap((entry, callIndex) =>
    entry.state._tag === "Waiting"
      ? [
          {
            waitId: entry.state.waitId,
            token: entry.state.token,
            reason: entry.state.reason,
            callIndex,
            call: entry.call,
          },
        ]
      : [],
  )

export const resolutionFor: {
  (waitId: string): (resolutions: ReadonlyArray<ToolBatchResolution>) => ResumeResolution | undefined
  (resolutions: ReadonlyArray<ToolBatchResolution>, waitId: string): ResumeResolution | undefined
} = Function.dual(
  2,
  (resolutions: ReadonlyArray<ToolBatchResolution>, waitId: string): ResumeResolution | undefined =>
    resolutions.find((entry) => entry.waitId === waitId)?.resolution,
)
