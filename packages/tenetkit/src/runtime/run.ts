import { Effect, Function, Predicate, Schema } from "effect"
import { ModelTelemetry, ProgramRunner, RunId as CoreRunId, type RunId as CoreRunIdType } from "../core/index.js"
import { decodePinned, ExecutableManifest, ExecutableRef } from "./executable/manifest.js"
import { RunWait } from "./run/wait.js"
import { Cursor } from "./cursor.js"
import type { ParseOptions } from "effect/SchemaAST"
import {
  AgentExecutionFailure,
  ExecutableIdentityMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
} from "./errors.js"
import {
  ExecutionResult as ExecutionResultSchema,
  type ExecutionResult as ExecutionResultType,
} from "./execution/state.js"
import { TreePolicy } from "./tree/policy.js"
import { ChildReadiness } from "./child/readiness.js"

export const ExecutionResult = ExecutionResultSchema
export type ExecutionResult = ExecutionResultType

export const RunStatus = Schema.Literals([
  "queued",
  "running",
  "waiting",
  "needs-resolution",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
])
export type RunStatus = typeof RunStatus.Type

/** @experimental Runtime uses Core's canonical Agent execution identity. */
export const RunId = CoreRunId
export type RunId = CoreRunIdType

export interface RunReceipt {
  readonly runId: RunId
  readonly messageId: string
  readonly acceptedSequence: number
  readonly duplicate: boolean
}

/** @experimental Encoded durable Run receipt. */
export interface RunReceiptEncoded extends Omit<RunReceipt, "runId"> {
  readonly runId: typeof RunId.Encoded
}

export const RunReceipt: Schema.Codec<RunReceipt, RunReceiptEncoded> = Schema.Struct({
  runId: RunId,
  messageId: Schema.String,
  acceptedSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  duplicate: Schema.Boolean,
})

export interface RunInspection {
  readonly runId: RunId
  readonly status: RunStatus
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly parentRunId?: RunId
  readonly childReadiness?: ChildReadiness
  readonly depth: number
  readonly treePolicy: TreePolicy
  readonly waits: ReadonlyArray<RunWait>
  readonly lastSequence: number
  readonly durability: "ephemeral" | "durable"
}

/** @experimental Encoded durable Run inspection. */
export interface RunInspectionEncoded
  extends Omit<RunInspection, "runId" | "executableRef" | "executableManifest" | "waits"> {
  readonly runId: typeof RunId.Encoded
  readonly executableRef: typeof ExecutableRef.Encoded
  readonly executableManifest: typeof ExecutableManifest.Encoded
  readonly waits: ReadonlyArray<typeof RunWait.Encoded>
}

const hasValidExecutable = (value: {
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
}): boolean => {
  try {
    const pinned = { ref: value.executableRef, manifest: value.executableManifest }
    decodePinned(pinned)
    return true
  } catch {
    return false
  }
}

export const RunInspection: Schema.Codec<RunInspection, RunInspectionEncoded> = Schema.Struct({
  runId: RunId,
  status: RunStatus,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  parentRunId: Schema.optionalKey(RunId),
  childReadiness: Schema.optionalKey(ChildReadiness),
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  treePolicy: TreePolicy,
  waits: Schema.Array(RunWait),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  durability: Schema.Literals(["ephemeral", "durable"]),
}).pipe(
  Schema.refine((value): value is typeof value => hasValidExecutable(value), {
    message: "executableRef must match executableManifest",
  }),
)

export type RunFailure =
  | AgentExecutionFailure
  | ExecutablePinMissing
  | ExecutableIdentityMismatch
  | ExecutableRegistrationInvalid
  | ExecutableRegistrationMissing
  | ProgramRunner.ExecutionFailure

export const RunFailure: Schema.Codec<RunFailure, unknown> = Schema.Union([
  AgentExecutionFailure,
  ExecutablePinMissing,
  ExecutableIdentityMismatch,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
  ProgramRunner.ExecutionFailure,
])

export type RunOutcome =
  | {
      readonly _tag: "Succeeded"
      readonly result: ExecutionResultType
      readonly eventId: string
      readonly occurredAt: string
    }
  | { readonly _tag: "Failed"; readonly error: RunFailure; readonly eventId: string; readonly occurredAt: string }
  | { readonly _tag: "Cancelled"; readonly reason?: string; readonly eventId: string; readonly occurredAt: string }

type RunOutcomeEncoded =
  | {
      readonly _tag: "Succeeded"
      readonly result: typeof ExecutionResultSchema.Encoded
      readonly eventId: string
      readonly occurredAt: string
    }
  | {
      readonly _tag: "Failed"
      readonly error: typeof RunFailure.Encoded
      readonly eventId: string
      readonly occurredAt: string
    }
  | { readonly _tag: "Cancelled"; readonly reason?: string; readonly eventId: string; readonly occurredAt: string }

export const RunOutcome: Schema.Codec<RunOutcome, RunOutcomeEncoded> = Schema.Union([
  Schema.TaggedStruct("Succeeded", {
    result: ExecutionResultSchema,
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
  Schema.TaggedStruct("Failed", {
    error: RunFailure,
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
  Schema.TaggedStruct("Cancelled", {
    reason: Schema.optionalKey(Schema.String),
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
])

interface RawUsageCommon {
  readonly runId: RunId
  readonly turn: number
  readonly purpose: "conversation" | "structured-output" | "compaction-summary"
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly provider?: string
  readonly model?: string
}

export type RawUsageFact =
  | (RawUsageCommon & {
      readonly _tag: "Completed"
      readonly usageAt: number
      readonly usage: ModelTelemetry.ModelAttemptCompleted["usage"]
      readonly requestId?: string
      readonly responseModel?: string
      readonly serviceTier?: string
    })
  | (RawUsageCommon & {
      readonly _tag: "Failed"
      readonly category: ModelTelemetry.ModelFailureCategory
      readonly usageAt: number
      readonly providerUsage: ModelTelemetry.ModelProviderUsage
    })

type RawUsageFactEncoded = RawUsageFact

export const RawUsageFact: Schema.Codec<RawUsageFact, RawUsageFactEncoded> = Schema.Union([
  Schema.TaggedStruct("Completed", {
    runId: RunId,
    turn: Schema.Finite,
    purpose: Schema.Literals(["conversation", "structured-output", "compaction-summary"]),
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int,
    usageAt: Schema.Finite,
    usage: ModelTelemetry.ModelAttemptCompleted.fields.usage,
    provider: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
    requestId: Schema.optionalKey(Schema.String),
    responseModel: Schema.optionalKey(Schema.String),
    serviceTier: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("Failed", {
    runId: RunId,
    turn: Schema.Finite,
    purpose: Schema.Literals(["conversation", "structured-output", "compaction-summary"]),
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int,
    category: ModelTelemetry.ModelFailureCategory,
    usageAt: Schema.Finite,
    providerUsage: ModelTelemetry.ModelProviderUsage,
    provider: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
  }),
])

const CompactionBase = {
  runId: RunId,
  turn: Schema.Finite,
  compactionId: Schema.String,
  startedAt: Schema.Finite,
  trigger: ModelTelemetry.CompactionTrigger,
  contextTokensBefore: Schema.optionalKey(Schema.Finite),
  entriesBefore: Schema.optionalKey(Schema.Finite),
}
interface CompactionInspectionBase {
  readonly runId: RunId
  readonly turn: number
  readonly compactionId: string
  readonly startedAt: number
  readonly trigger: ModelTelemetry.CompactionTrigger
  readonly contextTokensBefore?: number
  readonly entriesBefore?: number
}

export type CompactionInspection =
  | (CompactionInspectionBase & { readonly _tag: "Running" })
  | (CompactionInspectionBase & {
      readonly _tag: "Applied"
      readonly checkpointId: string
      readonly appliedAt: number
      readonly kind: "microcompact" | "summarize"
      readonly commit: ModelTelemetry.CompactionCommit
    })
  | (CompactionInspectionBase & { readonly _tag: "Failed"; readonly failedAt: number })

type CompactionInspectionEncoded = CompactionInspection

export const CompactionInspection: Schema.Codec<CompactionInspection, CompactionInspectionEncoded> = Schema.Union([
  Schema.TaggedStruct("Running", CompactionBase),
  Schema.TaggedStruct("Applied", {
    ...CompactionBase,
    checkpointId: Schema.String,
    appliedAt: Schema.Finite,
    kind: Schema.Literals(["microcompact", "summarize"]),
    commit: ModelTelemetry.CompactionCommit,
  }),
  Schema.TaggedStruct("Failed", { ...CompactionBase, failedAt: Schema.Finite }),
])

export interface RunSnapshot {
  readonly run: RunInspection
  readonly cursor: Cursor
  readonly outcome?: RunOutcome
  readonly usage: ReadonlyArray<RawUsageFact>
  readonly compactions: ReadonlyArray<CompactionInspection>
}

/** @experimental Encoded durable Run snapshot. */
export interface RunSnapshotEncoded extends Omit<RunSnapshot, "run" | "cursor" | "outcome" | "usage" | "compactions"> {
  readonly run: RunInspectionEncoded
  readonly cursor: typeof Cursor.Encoded
  readonly outcome?: RunOutcomeEncoded
  readonly usage: ReadonlyArray<RawUsageFactEncoded>
  readonly compactions: ReadonlyArray<CompactionInspectionEncoded>
}

export const RunSnapshot: Schema.Codec<RunSnapshot, RunSnapshotEncoded> = Schema.Struct({
  run: RunInspection,
  cursor: Cursor,
  outcome: Schema.optionalKey(RunOutcome),
  usage: Schema.Array(RawUsageFact),
  compactions: Schema.Array(CompactionInspection),
})

export interface Run {
  readonly runId: RunId
  readonly status: RunStatus
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly messageId: string
  readonly sessionId: string
  readonly rootRunId: RunId
  readonly parentRunId?: RunId
  readonly depth: number
  readonly treePolicy: TreePolicy
  readonly waits: ReadonlyArray<RunWait>
  readonly lastSequence: number
  readonly attempt: number
}

/** @experimental Encoded durable Run state. */
export interface RunEncoded
  extends Omit<Run, "runId" | "executableRef" | "executableManifest" | "rootRunId" | "waits"> {
  readonly runId: typeof RunId.Encoded
  readonly executableRef: typeof ExecutableRef.Encoded
  readonly executableManifest: typeof ExecutableManifest.Encoded
  readonly rootRunId: typeof RunId.Encoded
  readonly waits: ReadonlyArray<typeof RunWait.Encoded>
}

export const Run: Schema.Codec<Run, RunEncoded> = Schema.Struct({
  runId: RunId,
  status: RunStatus,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  messageId: Schema.String,
  sessionId: Schema.String,
  rootRunId: RunId,
  parentRunId: Schema.optionalKey(RunId),
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  treePolicy: TreePolicy,
  waits: Schema.Array(RunWait),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}).pipe(
  Schema.refine((value): value is typeof value => hasValidExecutable(value), {
    message: "executableRef must match executableManifest",
  }),
)

export const isTerminal = (status: RunStatus): status is "succeeded" | "failed" | "cancelled" =>
  status === "succeeded" || status === "failed" || status === "cancelled"

const isParseOptions = <T>(value: ParseOptions | T): value is ParseOptions =>
  Predicate.isObject(value) &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

export const encodeReceipt: {
  (input: RunReceipt, options?: ParseOptions): Effect.Effect<typeof RunReceipt.Encoded, Schema.SchemaError, never>
  (options?: ParseOptions): (input: RunReceipt) => Effect.Effect<typeof RunReceipt.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: RunReceipt, options?: ParseOptions) => Schema.encodeEffect(RunReceipt)(input, options),
)

export const decodeReceipt: {
  (input: typeof RunReceipt.Encoded, options?: ParseOptions): Effect.Effect<RunReceipt, Schema.SchemaError, never>
  (options?: ParseOptions): (input: typeof RunReceipt.Encoded) => Effect.Effect<RunReceipt, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: typeof RunReceipt.Encoded, options?: ParseOptions) => Schema.decodeEffect(RunReceipt)(input, options),
)

export const encodeInspection: {
  (input: RunInspection, options?: ParseOptions): Effect.Effect<typeof RunInspection.Encoded, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: RunInspection) => Effect.Effect<typeof RunInspection.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: RunInspection, options?: ParseOptions) => Schema.encodeEffect(RunInspection)(input, options),
)

export const decodeInspection: {
  (input: typeof RunInspection.Encoded, options?: ParseOptions): Effect.Effect<RunInspection, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: typeof RunInspection.Encoded) => Effect.Effect<RunInspection, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: typeof RunInspection.Encoded, options?: ParseOptions) => Schema.decodeEffect(RunInspection)(input, options),
)

export const encodeSnapshot: {
  (input: RunSnapshot, options?: ParseOptions): Effect.Effect<typeof RunSnapshot.Encoded, Schema.SchemaError, never>
  (options?: ParseOptions): (input: RunSnapshot) => Effect.Effect<typeof RunSnapshot.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: RunSnapshot, options?: ParseOptions) => Schema.encodeEffect(RunSnapshot)(input, options),
)

export const decodeSnapshot: {
  (input: typeof RunSnapshot.Encoded, options?: ParseOptions): Effect.Effect<RunSnapshot, Schema.SchemaError, never>
  (options?: ParseOptions): (input: typeof RunSnapshot.Encoded) => Effect.Effect<RunSnapshot, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: typeof RunSnapshot.Encoded, options?: ParseOptions) => Schema.decodeEffect(RunSnapshot)(input, options),
)
