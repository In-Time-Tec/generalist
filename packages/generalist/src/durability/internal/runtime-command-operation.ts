import { Schema, type Effect } from "effect"
import { digest } from "../../core/durable/pin.js"
import { ProgramBudget } from "../../core/durable/manifest/program-manifest.js"
import { BudgetLimits } from "../../core/durable/run-budget.js"
import { ProgramOperationName } from "../../core/program/capabilities.js"
import { ProgramReplayPolicy } from "../../core/program/handlers.js"
import { Outcome as ToolOutcome } from "../../core/tools/tool-result-codec.js"
import { ExecutableManifest, ExecutableRef } from "../../runtime/executable/manifest.js"
import { ExecutableRegistration } from "../../runtime/executable/registration.js"
import type { DurableAgentLoopEvent, EmittableAgentLoopEvent } from "../../runtime/execution/agent/event.js"
import { ExecutionCheckpoint, ExecutionResult, ExecutionSuspension } from "../../runtime/execution/state.js"
import { Message } from "../../runtime/messaging/message.js"
import { OperationKind, OperationStatus, ReplayPolicy } from "../../runtime/operation/record.js"
import { OperationResolution, ResolveOperationInput } from "../../runtime/operation/resolution.js"
import { ProgramOperationKind, ProgramOperationRecord } from "../../runtime/program/store.js"
import { AgentLoopEventSchema, CompletedModelResponse, RunFailure } from "../../runtime/run/event.js"
import { ExecutionContinuation } from "../../runtime/run/steering.js"
import type { Service } from "../../runtime/run/store.js"
import type { ExecutionRecord as ExecutionRecordType } from "../../runtime/run/store-types.js"
import { RunWait, WaitResolution } from "../../runtime/run/wait.js"
import { WaitResponse } from "../../runtime/run/wait-internal.js"
import { TreePolicy } from "../../runtime/tree/policy.js"
import type { Definition } from "./runtime-command.js"
import { AdmitFanOutInput } from "./runtime-command-admission.js"
import { ExecutionClaim, Operation, OperationError } from "./runtime-state/schema.js"

export const ExecutionRecord = Schema.Struct({
  runId: Schema.String,
  rootRunId: Schema.String,
  depth: Schema.Number,
  treePolicy: TreePolicy,
  activeChildCount: Schema.Number,
  parentRunId: Schema.optionalKey(Schema.String),
  invocationId: Schema.optionalKey(Schema.String),
  operationNamespace: Schema.optionalKey(Schema.String),
  ownerId: Schema.optionalKey(Schema.String),
  admittedAt: Schema.String,
  message: Message,
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  attempt: Schema.Number,
  attemptFence: ExecutionClaim.fields.attemptFence,
  cancellationRequested: Schema.Boolean,
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  suspension: Schema.optionalKey(ExecutionSuspension),
  resolutions: Schema.Array(WaitResponse),
  continuation: Schema.optionalKey(ExecutionContinuation),
  registrations: Schema.Array(ExecutableRegistration),
} satisfies { readonly [K in keyof ExecutionRecordType]-?: Schema.Constraint }) satisfies Schema.Codec<ExecutionRecordType, unknown>

const CommandId = Schema.String.check(Schema.isNonEmpty())
const IdentifiedClaim = Schema.Struct({ ...ExecutionClaim.fields, commandId: CommandId })
const ClaimedOperation = Schema.Struct({ ...ExecutionClaim.fields, operationId: Schema.String })
const IdentifiedOperation = Schema.Struct({ ...ClaimedOperation.fields, commandId: CommandId })
const CompletionOutcome = Schema.Union([
  Schema.TaggedStruct("Completed", {}),
  Schema.TaggedStruct("SteeringPending", { continuation: ExecutionContinuation }),
])
const OperationSucceeded = Schema.TaggedStruct("Succeeded", { value: Schema.Unknown })
const OperationFailed = Schema.TaggedStruct("Failed", { error: OperationError })
const OperationUnknown = Schema.TaggedStruct("Unknown", {})
const OperationCompletionOutcome = Schema.Union([OperationSucceeded, OperationFailed, OperationUnknown])
const CompletionCheckpoint = {
  checkpoint: Schema.optionalKey(ExecutionCheckpoint),
  continuation: Schema.optionalKey(Schema.NullOr(ExecutionContinuation)),
  steeringEntryIds: Schema.optionalKey(Schema.Array(Schema.String)),
}

// The shared event codec owns the complete union; this domain metadata field has a narrower authored shape.
const ToolProgressMetadata = Schema.Struct({ dropped: Schema.Number })
type DurableAgentEventType = DurableAgentLoopEvent & typeof AgentLoopEventSchema.Type
type EmittableAgentEventType = EmittableAgentLoopEvent & DurableAgentEventType
const DurableAgentEvent = AgentLoopEventSchema.pipe(
  Schema.refine((event): event is DurableAgentEventType =>
    event._tag !== "ToolExecutionCompleted" ||
    event.metadata?.toolProgress === undefined ||
    Schema.is(ToolProgressMetadata)(event.metadata.toolProgress),
  ),
)
const EmittableAgentEvent = DurableAgentEvent.pipe(
  Schema.refine((event): event is EmittableAgentEventType =>
    event._tag !== "ModelResponseCommitted" && event._tag !== "ModelResponseInterrupted",
  ),
)
const ModelResponseCommitted = Schema.TaggedStruct("ModelResponseCommitted", {
  turn: Schema.Number,
  operationKey: Schema.String,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Number,
  response: CompletedModelResponse,
  budgetCharge: Schema.Number,
  digest: Schema.String,
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
})
const PendingModelResponseInterrupted = Schema.TaggedStruct("ModelResponseInterrupted", {
  turn: Schema.Number,
  operationKey: Schema.String,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Number,
  sessionParentId: Schema.NullOr(Schema.String),
  response: CompletedModelResponse,
  reason: Schema.Literals(["cancel", "failure"]),
  digest: Schema.String,
})
const TerminalToolOutcome = Schema.Union([ToolOutcome.members[0], ToolOutcome.members[1]])
const CancellationOutcome = Schema.Union([
  Schema.TaggedStruct("Cancelled", {}),
  Schema.TaggedStruct("AlreadyTerminal", { outcome: TerminalToolOutcome }),
])
const OperatorAction = Schema.Struct({ runId: Schema.String, operator: Schema.String, commandId: CommandId })
const ProgramReservation = Schema.Struct({
  toolCalls: Schema.optionalKey(Schema.Number),
  agentRuns: Schema.optionalKey(Schema.Number),
  logBytes: Schema.optionalKey(Schema.Number),
  activeSlots: Schema.optionalKey(Schema.Number),
})
const ReserveProgramOperationInput = Schema.Struct({
  ...ExecutionClaim.fields,
  programPin: Schema.String,
  budget: ProgramBudget,
  operation: ProgramOperationName,
  authoredOperation: ProgramOperationName,
  kind: ProgramOperationKind,
  capability: Schema.String,
  inputDigest: Schema.String,
  input: Schema.Unknown,
  replay: ProgramReplayPolicy,
  reservation: ProgramReservation,
})
const ProgramOperationOutcome = Schema.Union([
  Schema.TaggedStruct("Succeeded", { value: Schema.Unknown, tokens: Schema.optionalKey(Schema.Number) }),
  OperationFailed,
  OperationUnknown,
])

type IdentifiedMethod =
  | "complete"
  | "startOperation"
  | "expireRunningOperation"
  | "recoverRunningOperations"
  | "resume"
  | "emitAgentEvent"
  | "operationCancellations"
  | "retryRecovery"
  | "wakeRecovery"
  | "extendBudgetRecovery"
  | "resolveUnknown"
  | "claimExecution"
  | "saveExecution"
  | "retryExecution"

type Method =
  | IdentifiedMethod
  | "fail"
  | "suspend"
  | "recordOperation"
  | "completeOperation"
  | "commitModelResponse"
  | "commitInterruptedModelResponse"
  | "acknowledgeOperationCancellation"
  | "resolveOperation"
  | "releaseExecution"
  | "reserveProgramOperation"
  | "suspendProgramOperation"
  | "admitProgramAgents"
  | "settleProgramOperation"
  | "startProgramOperation"
  | "completeProgram"
  | "commitProgramLog"

type Input<K extends Method> = K extends IdentifiedMethod
  ? readonly [Parameters<Service[K]>[0] & { readonly commandId: string }]
  : Readonly<Parameters<Service[K]>>
type Commands = {
  readonly [K in Method]: Definition<Input<K>, Effect.Success<ReturnType<Service[K]>>> & { readonly tag: K }
}

export const commands = {
  complete: {
    tag: "complete" as const,
    input: Schema.Tuple([Schema.Struct({ ...IdentifiedClaim.fields, result: ExecutionResult })]),
    receipt: CompletionOutcome,
    identity: ([input]) => input.commandId,
  },
  fail: {
    tag: "fail" as const,
    input: Schema.Tuple([Schema.Struct({ ...ExecutionClaim.fields, error: RunFailure })]),
    receipt: Schema.Void,
    identity: ([input]) => digest(["fail", input.runId, input.attemptFence]),
  },
  suspend: {
    tag: "suspend" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ExecutionClaim.fields,
      waits: Schema.Array(RunWait),
      suspension: ExecutionSuspension,
      checkpoint: Schema.optionalKey(ExecutionCheckpoint),
      continuation: Schema.optionalKey(Schema.NullOr(ExecutionContinuation)),
    })]),
    receipt: Schema.Void,
    identity: ([input]) => digest(["suspend", input.runId, input.attemptFence, input.waits.map((wait) => wait.waitId)]),
  },
  resume: {
    tag: "resume" as const,
    input: Schema.Tuple([Schema.Struct({
      runId: Schema.String,
      waitId: Schema.String,
      resolution: WaitResolution,
      commandId: CommandId,
    })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  emitAgentEvent: {
    tag: "emitAgentEvent" as const,
    input: Schema.Tuple([Schema.Struct({ ...IdentifiedClaim.fields, event: EmittableAgentEvent })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  recordOperation: {
    tag: "recordOperation" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ExecutionClaim.fields,
      operationKey: Schema.String,
      kind: OperationKind,
      inputDigest: Schema.String,
      input: Schema.Unknown,
      replayPolicy: ReplayPolicy,
      attempt: Schema.Number,
      ...CompletionCheckpoint,
      steeringEvents: Schema.optionalKey(Schema.Array(DurableAgentEvent)),
    })]),
    receipt: Operation,
    identity: ([input]) => digest(["recordOperation", input.runId, input.attemptFence, input.attempt, input.operationKey]),
  },
  startOperation: {
    tag: "startOperation" as const,
    input: Schema.Tuple([IdentifiedOperation]),
    receipt: Operation,
    identity: ([input]) => input.commandId,
  },
  completeOperation: {
    tag: "completeOperation" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ClaimedOperation.fields,
      outcome: OperationCompletionOutcome,
      ...CompletionCheckpoint,
    })]),
    receipt: Operation,
    identity: ([input]) => digest(["completeOperation", input.runId, input.attemptFence, input.operationId]),
  },
  commitModelResponse: {
    tag: "commitModelResponse" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ClaimedOperation.fields,
      outcome: OperationSucceeded,
      ...CompletionCheckpoint,
      transitionDigest: Schema.optionalKey(Schema.String),
      event: ModelResponseCommitted,
    })]),
    receipt: Operation,
    identity: ([input]) => digest(["commitModelResponse", input.runId, input.attemptFence, input.operationId]),
  },
  commitInterruptedModelResponse: {
    tag: "commitInterruptedModelResponse" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ClaimedOperation.fields,
      outcome: Schema.TaggedStruct("Failed", { error: RunFailure }),
      event: PendingModelResponseInterrupted,
    })]),
    receipt: Operation,
    identity: ([input]) => digest(["commitInterruptedModelResponse", input.runId, input.attemptFence, input.operationId]),
  },
  expireRunningOperation: {
    tag: "expireRunningOperation" as const,
    input: Schema.Tuple([IdentifiedOperation]),
    receipt: Schema.Struct({ record: Operation, outcome: Schema.Union([Schema.Literal("retried"), OperationStatus]) }),
    identity: ([input]) => input.commandId,
  },
  recoverRunningOperations: {
    tag: "recoverRunningOperations" as const,
    input: Schema.Tuple([IdentifiedClaim]),
    receipt: Schema.Literals(["ready", "blocked"]),
    identity: ([input]) => input.commandId,
  },
  operationCancellations: {
    tag: "operationCancellations" as const,
    input: Schema.Tuple([IdentifiedClaim]),
    receipt: Schema.Array(Operation),
    identity: ([input]) => input.commandId,
  },
  acknowledgeOperationCancellation: {
    tag: "acknowledgeOperationCancellation" as const,
    input: Schema.Tuple([Schema.Struct({ ...ClaimedOperation.fields, outcome: CancellationOutcome })]),
    receipt: Operation,
    identity: ([input]) => digest(["acknowledgeOperationCancellation", input.runId, input.attemptFence, input.operationId]),
  },
  resolveOperation: {
    tag: "resolveOperation" as const,
    input: Schema.Tuple([ResolveOperationInput]),
    receipt: Schema.Void,
    identity: ([input]) => digest(["resolveOperation", input.runId, input.operationId, input.idempotencyKey]),
  },
  retryRecovery: {
    tag: "retryRecovery" as const,
    input: Schema.Tuple([OperatorAction]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  wakeRecovery: {
    tag: "wakeRecovery" as const,
    input: Schema.Tuple([OperatorAction]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  extendBudgetRecovery: {
    tag: "extendBudgetRecovery" as const,
    input: Schema.Tuple([Schema.Struct({ ...OperatorAction.fields, delta: BudgetLimits })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  resolveUnknown: {
    tag: "resolveUnknown" as const,
    input: Schema.Tuple([Schema.Struct({
      ...OperatorAction.fields,
      operationId: Schema.String,
      resolution: OperationResolution,
    })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  claimExecution: {
    tag: "claimExecution" as const,
    input: Schema.Tuple([Schema.Struct({ runId: Schema.String, ownerId: Schema.String, commandId: CommandId })]),
    receipt: Schema.Struct({ ...ExecutionRecord.fields, ...ExecutionClaim.fields }),
    identity: ([input]) => input.commandId,
  },
  releaseExecution: {
    tag: "releaseExecution" as const,
    input: Schema.Tuple([ExecutionClaim]),
    receipt: Schema.Void,
    identity: ([input]) => digest(["releaseExecution", input.runId, input.attemptFence]),
  },
  saveExecution: {
    tag: "saveExecution" as const,
    input: Schema.Tuple([Schema.Struct({
      ...IdentifiedClaim.fields,
      checkpoint: Schema.optionalKey(ExecutionCheckpoint),
      suspension: Schema.optionalKey(ExecutionSuspension),
    })]),
    receipt: Schema.Void,
    identity: ([input]) => input.commandId,
  },
  retryExecution: {
    tag: "retryExecution" as const,
    input: Schema.Tuple([IdentifiedClaim]),
    receipt: ExecutionRecord,
    identity: ([input]) => input.commandId,
  },
  reserveProgramOperation: {
    tag: "reserveProgramOperation" as const,
    input: Schema.Tuple([ReserveProgramOperationInput]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["reserveProgramOperation", input.runId, input.attemptFence, input.operation]),
  },
  suspendProgramOperation: {
    tag: "suspendProgramOperation" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ReserveProgramOperationInput.fields,
      suspension: ExecutionSuspension,
      wait: RunWait,
      checkpoint: Schema.optionalKey(ExecutionCheckpoint),
    })]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["suspendProgramOperation", input.runId, input.attemptFence, input.operation]),
  },
  admitProgramAgents: {
    tag: "admitProgramAgents" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ReserveProgramOperationInput.fields,
      fanOut: AdmitFanOutInput,
      suspension: ExecutionSuspension,
      wait: RunWait,
    })]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["admitProgramAgents", input.runId, input.attemptFence, input.operation]),
  },
  settleProgramOperation: {
    tag: "settleProgramOperation" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ExecutionClaim.fields,
      operation: ProgramOperationName,
      outcome: ProgramOperationOutcome,
      releaseSlots: Schema.Number,
    })]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["settleProgramOperation", input.runId, input.attemptFence, input.operation]),
  },
  startProgramOperation: {
    tag: "startProgramOperation" as const,
    input: Schema.Tuple([Schema.Struct({ ...ExecutionClaim.fields, operation: Schema.String })]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["startProgramOperation", input.runId, input.attemptFence, input.operation]),
  },
  completeProgram: {
    tag: "completeProgram" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ExecutionClaim.fields,
      output: Schema.Unknown,
      outputBytes: Schema.Number,
      outputLimit: Schema.Number,
    })]),
    receipt: CompletionOutcome,
    identity: ([input]) => digest(["completeProgram", input.runId, input.attemptFence]),
  },
  commitProgramLog: {
    tag: "commitProgramLog" as const,
    input: Schema.Tuple([Schema.Struct({
      ...ReserveProgramOperationInput.fields,
      level: Schema.Literals(["debug", "info", "warn", "error"]),
      message: Schema.String,
      data: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
    })]),
    receipt: ProgramOperationRecord,
    identity: ([input]) => digest(["commitProgramLog", input.runId, input.attemptFence, input.operation]),
  },
} satisfies Commands
