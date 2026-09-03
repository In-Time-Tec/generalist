/* eslint-disable max-lines -- the Runtime service keeps one public contract */
import { Context, Effect, Schema, Stream, type Duration } from "effect"
import type { Entry as SessionEntry } from "../core/context/session.js"
import { Prompt, type Tool } from "effect/unstable/ai"
import type { Agent, ClosedServices } from "../core/agent/lifecycle/definition.js"
import type { AgentError, InvalidOutput } from "../core/agent/event.js"
import type { TreePolicy } from "./tree/policy.js"
import type { Address } from "./address.js"
import type { PinnedExecutable } from "./executable/manifest.js"
import type { Cursor } from "./cursor.js"
import type {
  AddressNotFound,
  AgentNameConflict,
  CursorExpired,
  IdempotencyConflict,
  RunIdConflict,
  SteeringConflict,
  ResponseConflict,
  ApprovalStale,
  ApprovalMismatch,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  SubscriberLagged,
  WaitNotOpen,
  FanOutConflict,
  FanOutInvalid,
  FanOutNotFound,
  FanOutRemainderUnsupported,
  TreeCursorInvalid,
  TreeCursorRootMismatch,
  ChildDepthExceeded,
  ChildLimitExceeded,
  TreePolicyInvalid,
  TreeCursorExpired,
  TreeCursorFuture,
  TreeReplayLimitInvalid,
  ChildSelectionMissing,
  OperationResolutionConflict,
  ExecutableIdentityMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationConflict,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
  StartInvalid,
  SessionEntryNotFound,
  SessionEntryCorrupt,
  AckInvalid,
  AckBeyondCommitted,
  DuplicateAgent,
  UnknownAgent,
  IllegalOperatorAction,
  ForkSequenceInvalid,
  NoSnapshot,
  SubstitutionInvalid,
  RunBusy,
  NotInFamily,
} from "./errors.js"
import type { Metadata } from "./messaging/message.js"
import type { AgentName, AddressInvalid, DirectoryEntry } from "./execution/agent/directory.js"
import type { MailboxEntry, MessageReceipt } from "./messaging/mailbox.js"
import type { MessagingPolicy } from "./messaging/service.js"
import type { RawUsageFact, RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { Result as GateResult } from "../core/agent/gates/definition.js"
import type { CompletedModelResponse, RunCancelled, RunCompleted, RunEvent, RunFailed } from "./run/event.js"
import type { AgentExecutionResult, ProgramExecutionResult } from "./execution/state.js"
import type { WaitResolution } from "./run/wait.js"
import type { FanOutInspection, FanOutReceipt } from "./child/fan-out.js"
import type { FanOutInput, FanOutMemberOrigin, InitialFanOutInput } from "./child/fan-out-internal.js"
import type { ChildInspection } from "./child/admission.js"
import type { ResolveOperationInput } from "./operation/resolution.js"
import type { AdmissionPolicy, MessageSource, SteeringReceipt } from "./run/steering.js"
import type {
  RespondInput as RespondApprovalInput,
  ResolveError as ResolveDurableApprovalError,
} from "./operation/approval.js"
import type { ExecutableRegistration } from "./executable/registration.js"
import type { ForkOptions, RewindOptions } from "./fork.js"
import type { Notification as ChildSettlementNotification } from "./child/settlement.js"
import type { Event as ModelPreviewEvent } from "./execution/model-response/preview.js"
import type { RunActivationProjection } from "./run/activation.js"
import type { Point as AcknowledgementPoint } from "./run/acknowledgement.js"
import type { RuntimeHostSessions } from "./session/host.js"
import type {
  RunBudget,
  Remaining as RemainingBudget,
  Input as BudgetDelta,
  Invalid as BudgetInvalid,
} from "../core/durable/run-budget.js"
import type { RuleStore } from "../core/policy/permissions.js"
import type {
  Explanation as RecoveryExplanation,
  Obligation as RecoveryObligation,
  ResolveApprovalDecision,
  UnknownResolution,
  Verification as RecoveryVerification,
} from "./execution/recovery/operator.js"
import type { WakeEvent } from "../core/agent/tools/wake-event.js"
import type { WakeDisposition, WakeEventInvalid } from "./execution/trigger/wake.js"
import type { ScheduleInvalid, ScheduleReceipt } from "./execution/trigger/schedule.js"
import type { InspectionEvent } from "./execution/agent/event.js"

export type { FanOutInput, FanOutMemberInput, InitialFanOutInput } from "./child/fan-out-internal.js"

export interface AddressBinding {
  readonly address: Address
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export interface LayerOptions {
  readonly addresses: ReadonlyArray<AddressBinding>
  readonly subscriberQueueCapacity?: number
  /** Host policy for addressing beyond Generalist's derived relationships. Absent means relationships only. */
  readonly messagingPolicy?: MessagingPolicy.Service
  /** Final-state callback executed synchronously inside each authoritative store transaction. */
  readonly activationProjection?: RunActivationProjection
  readonly scheduler?: {
    readonly concurrency?: number
    readonly pollInterval?: Duration.Input
  }
}

export interface SendInput {
  readonly runId?: string
  readonly treePolicy?: TreePolicy
  readonly to: Address
  readonly from?: Address
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly inReplyTo?: string
  readonly metadata?: Metadata
}

/** Admission options for a message sent to one existing Run. */
export interface RunSendOptions {
  readonly policy?: AdmissionPolicy
  readonly from?: MessageSource
  readonly idempotencyKey?: string
}

/** @internal Exact root execution admission used below the typed Agent API. */
export interface StartExecutionInput {
  readonly runId?: string
  readonly treePolicy?: TreePolicy
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
  readonly budget?: RunBudget
  readonly initialChildren?: ReadonlyArray<InitialChildInput>
  readonly initialFanOuts?: ReadonlyArray<InitialFanOutInput>
}

/** One exact root admission held behind Generalist's durable execution gate. */
export type AdmitInput = Omit<StartExecutionInput, "initialChildren" | "initialFanOuts">

/** Release one admitted root's durable execution gate. */
export interface ActivateInput {
  readonly runId: string
}

export interface InitialChildInput {
  readonly invocationId: string
  readonly idempotencyKey: string
  readonly selection: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId: string
  readonly messageId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
}

export interface StartReceipt extends RunReceipt {
  readonly childRunIds: ReadonlyArray<string>
  readonly fanOuts: ReadonlyArray<FanOutReceipt>
}

/** Typed durable start identity. Budget admission is reserved for the RunBudget contract. */
export interface StartOptions {
  readonly sessionId?: string
  readonly idempotencyKey?: string
  readonly budget?: RunBudget
}

/** Durable UTC fresh-Run recurrence. */
export interface ScheduleOptions {
  readonly rrule: string
  readonly sessionId: string
  readonly budget?: RunBudget
  /** Stable identity for idempotent registration across Runtime restarts. */
  readonly scheduleId?: string
}

type StartedAgentResult<Output> = Omit<AgentExecutionResult, "output"> & { readonly output: Output }

/** Durable Runtime event with Agent completion decoded through its output Schema. */
export type StartEvent<Output> =
  | Exclude<RunEvent, RunCompleted>
  | (Omit<RunCompleted, "result"> & {
      readonly result: StartedAgentResult<Output> | ProgramExecutionResult
    })

/** One typed durable Run and its replay-then-live event stream. */
export interface RunHandle<Output> {
  readonly runId: import("../core/durable/run-id.js").RunId
  readonly await: Effect.Effect<Output, RunFailed | RunCancelled | EventsError | InvalidOutput>
  readonly events: Stream.Stream<StartEvent<Output>, EventsError | InvalidOutput>
  readonly send: (
    message: Prompt.Prompt | string,
    options?: RunSendOptions,
  ) => Effect.Effect<SteeringReceipt, RunSendError>
}

/** Durable admission for one existing Run. */
export type RunSend = (
  runId: string,
  ...input: Parameters<RunHandle<unknown>["send"]>
) => ReturnType<RunHandle<unknown>["send"]>

/** Authoritative Runtime inspection, including the process-local Inspector snapshot shape. */
export interface RuntimeInspection extends RunInspection {
  readonly turn: number
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
  readonly usageFacts: ReadonlyArray<RawUsageFact>
  readonly activeTools: ReadonlyArray<string>
  readonly lastEvent?: InspectionEvent
  readonly elapsed: number
  readonly budget: RemainingBudget
  readonly gates: ReadonlyArray<GateResult>
  readonly children: ReadonlyArray<ChildInspection>
  readonly suspension?: import("./execution/state.js").ExecutionSuspension
}

export interface SpawnInput {
  readonly parentRunId: string
  readonly invocationId: string
  readonly selection: string
  readonly label?: string
  readonly origin?: FanOutMemberOrigin
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly idempotencyKey?: string
  readonly messageId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
}

export interface EventsInput {
  readonly runId: string
  readonly cursor?: Cursor
}

export interface HistoryInput extends EventsInput {
  readonly limit: number
}

export interface SessionEntryInput {
  readonly sessionId: string
  readonly entryId: string
}
export type ModelResponseEvent = Extract<
  RunEvent,
  { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }
>

/** Select the memory-only live preview lane for one Run. */
export interface PreviewsInput {
  readonly runId: string
}

export interface ListInput {
  readonly status?: RunStatus
  readonly limit: number
}

export interface RespondInput {
  readonly runId: string
  readonly waitId: string
  readonly resolution: Exclude<WaitResolution, { readonly _tag: "Signal" }>
}

export interface SignalInput {
  readonly runId: string
  readonly name: string
  readonly payload?: unknown
}

export interface CancelInput {
  readonly runId: string
  readonly reason?: string
}

export interface CancelSessionInput {
  readonly sessionId: string
  readonly reason?: string
}

export interface AwaitSessionTerminalInput {
  readonly sessionId: string
}

/**
 * One addressed send between agents.
 *
 * `fromRunId` is the authoritative sender: Generalist reads its identity, parentage, and session from the
 * durable Run record, so callers cannot forge a sender by supplying an Address.
 */
export interface SendMessageInput {
  readonly fromRunId: string
  readonly to: Address
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly inReplyTo?: string
  readonly metadata?: Metadata
  readonly policy?: AdmissionPolicy
}
export interface MessagesInput {
  readonly runId: string
  readonly limit: number
}
export interface ChildSettlementsInput {
  readonly parentRunId: string
  readonly afterSequence?: number
  readonly limit: number
}
export interface ChildSettlementChangesInput {
  readonly parentRunId: string
  readonly afterSequence?: number
}
export interface AwaitChildSettlementInput {
  readonly parentRunId: string
  readonly childRunId: string
}
export interface RegisterAgentNameInput {
  readonly runId: string
  readonly name: AgentName
}

export type SendError =
  | AddressNotFound
  | IdempotencyConflict
  | RunIdConflict
  | ExecutableIdentityMismatch
  | ExecutablePinMissing
  | ExecutableRegistrationInvalid
  | ExecutableRegistrationConflict
  | ExecutableRegistrationMissing
  | TreePolicyInvalid
  | RuntimeUnavailable
export type StartExecutionError =
  | ChildDepthExceeded
  | ChildLimitExceeded
  | IdempotencyConflict
  | RunIdConflict
  | ExecutableIdentityMismatch
  | ExecutablePinMissing
  | ExecutableRegistrationInvalid
  | ExecutableRegistrationConflict
  | ExecutableRegistrationMissing
  | ChildSelectionMissing
  | StartInvalid
  | FanOutConflict
  | FanOutInvalid
  | FanOutRemainderUnsupported
  | TreePolicyInvalid
  | RuntimeUnavailable
  | import("../core/durable/run-budget.js").Exhausted
/** Typed Agent start failures before a Run handle exists. */
export type StartError = StartExecutionError | UnknownAgent | AgentError
export type ScheduleError = UnknownAgent | AgentError | ScheduleInvalid | RuntimeUnavailable
export type WakeError = RunNotFound | RunTerminal | RuntimeUnavailable | WakeEventInvalid
/** Exact-root staged admission failures. */
export type AdmitError = StartExecutionError
/** Staged root activation failures. */
export type ActivateError = RunNotFound | RuntimeUnavailable
export type SpawnError =
  | RunNotFound
  | RunTerminal
  | ChildSelectionMissing
  | IdempotencyConflict
  | RuntimeUnavailable
  | ChildDepthExceeded
  | ChildLimitExceeded
  | import("../core/durable/run-budget.js").Exhausted
export type SendMessageError =
  | AddressNotFound
  | AddressInvalid
  | NotInFamily
  | RunTerminal
  | RunBusy
  | RunNotFound
  | SteeringConflict
  | ForkSequenceInvalid
  | NoSnapshot
  | CursorExpired
  | import("../core/turn/steering.js").InboxFull
  | RuntimeUnavailable
export type DirectoryError = RunNotFound | RuntimeUnavailable
export type ChildSettlementError = RunNotFound | RuntimeUnavailable
export type RegisterAgentNameError = RunNotFound | AgentNameConflict | RuntimeUnavailable
export type EventsError = RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable
/** Durable host acknowledgement failures. */
export type AckError = RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable
export type TreeReplayError =
  | RunNotFound
  | TreeCursorInvalid
  | TreeCursorRootMismatch
  | TreeCursorExpired
  | TreeCursorFuture
  | TreeReplayLimitInvalid
  | RuntimeUnavailable
export type TreeEventsError = TreeReplayError
export type RespondError = RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable
export type RespondApprovalError = RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable
export type SignalError = RunNotFound | RunTerminal | RuntimeUnavailable
export type CancelError = RunNotFound | RuntimeUnavailable
export type RunSendError =
  | RunNotFound
  | RunTerminal
  | RunBusy
  | NotInFamily
  | SteeringConflict
  | ForkSequenceInvalid
  | NoSnapshot
  | CursorExpired
  | import("../core/turn/steering.js").InboxFull
  | RuntimeUnavailable

export interface SendFunction {
  (
    runId: string,
    prompt: Prompt.Prompt | string,
    options?: RunSendOptions,
  ): Effect.Effect<SteeringReceipt, RunSendError>
  (input: SendInput): Effect.Effect<RunReceipt, SendError>
}
export type ResolveOperationError = RunNotFound | OperationResolutionConflict | RuntimeUnavailable
export type InspectError = RunNotFound | RuntimeUnavailable
export type ForkError = RunNotFound | ForkSequenceInvalid | NoSnapshot | SubstitutionInvalid | RuntimeUnavailable
export type RewindError = RunNotFound | ForkSequenceInvalid | NoSnapshot | RuntimeUnavailable
export type ExtendBudgetError = InspectError | BudgetInvalid
export type OperatorActionError = InspectError | IllegalOperatorAction
export type OperatorApprovalError = ResolveDurableApprovalError | IllegalOperatorAction
export type OperatorExtendBudgetError = ExtendBudgetError | IllegalOperatorAction
export type SessionEntryError = SessionEntryNotFound | SessionEntryCorrupt | RuntimeUnavailable
export type ResolveModelResponseError = SessionEntryError
export type FanOutError =
  | ChildDepthExceeded
  | ChildLimitExceeded
  | RunNotFound
  | RunTerminal
  | FanOutConflict
  | FanOutInvalid
  | FanOutRemainderUnsupported
  | ChildSelectionMissing
  | RuntimeUnavailable
  | import("../core/durable/run-budget.js").Exhausted
export type InspectFanOutError = FanOutNotFound | RuntimeUnavailable
export type AwaitFanOutError = InspectFanOutError | EventsError

export interface OperatorService {
  readonly explain: (runId: string) => Effect.Effect<RecoveryExplanation, InspectError>
  readonly verify: (runId: string) => Effect.Effect<RecoveryVerification, InspectError>
  readonly retry: (runId: string, operator: string) => Effect.Effect<void, OperatorActionError>
  readonly wake: (runId: string, operator: string) => Effect.Effect<void, OperatorActionError>
  // oxlint-disable-next-line effecttsgo/lazy-effect -- Issue #320 specifies a method so callers explicitly begin each store-wide scan.
  readonly scanObligations: () => Stream.Stream<RecoveryObligation, InspectError>
  readonly resolveUnknown: (
    runId: string,
    operationId: string,
    resolution: UnknownResolution,
    operator: string,
  ) => Effect.Effect<void, OperatorActionError>
  readonly resolveApproval: (
    token: string,
    decision: ResolveApprovalDecision,
    operator: string,
  ) => Effect.Effect<void, OperatorApprovalError, RuleStore>
  readonly extendBudget: (
    runId: string,
    delta: BudgetDelta,
    operator: string,
  ) => Effect.Effect<void, OperatorExtendBudgetError>
}

export interface Service extends RuntimeHostSessions {
  readonly operator: OperatorService
  /** Register one Agent name and its exact environment for start and recovery. */
  readonly register: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
  ) => Effect.Effect<void, DuplicateAgent, ClosedServices<Tools, R, InputCodec, OutputCodec>>
  /** Start one registered Agent with Schema-derived input and output. */
  readonly start: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: StartOptions,
  ) => Effect.Effect<RunHandle<OutputCodec["Type"]>, StartError, never>
  /** Register recurring fresh Runs for one registered Agent. */
  readonly schedule: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: ScheduleOptions,
  ) => Effect.Effect<ScheduleReceipt, ScheduleError>
  /** @internal Begin one already-normalized pinned execution. */
  readonly startExecution: (input: StartExecutionInput) => Effect.Effect<StartReceipt, StartExecutionError>
  /** Durably admit one exact root without making it executable. */
  readonly admit: (input: AdmitInput) => Effect.Effect<RunReceipt, AdmitError>
  /** Idempotently activate an admitted root and return its authoritative current state. */
  readonly activate: (input: ActivateInput) => Effect.Effect<RunInspection, ActivateError>
  readonly send: SendFunction
  readonly spawn: (input: SpawnInput) => Effect.Effect<RunReceipt, SpawnError>
  readonly events: (input: EventsInput) => Stream.Stream<RunEvent, EventsError>
  /** Observe the memory-only live preview lane for one Run.
   * Frames contain bounded UTF-16 appends with per-attempt sequences and per-channel offsets.
   * Subscribers may lose frames without blocking execution and detect that loss from the next
   * frame. Preview events are memory-only and never durable RunEvents.
   */
  readonly previews: (input: PreviewsInput) => Stream.Stream<ModelPreviewEvent>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, InspectError>
  readonly history: (input: HistoryInput) => Effect.Effect<ReadonlyArray<RunEvent>, EventsError>
  /** Durably advance the host processed-through point to an exact committed model cycle. */
  readonly acknowledge: (input: { readonly runId: string; readonly sequence: number }) => Effect.Effect<void, AckError>
  /** Read the durable host processed-through point; -1 means no cycle is acknowledged. */
  readonly acknowledged: (runId: string) => Effect.Effect<AcknowledgementPoint, InspectError>
  readonly sessionEntry: (input: SessionEntryInput) => Effect.Effect<SessionEntry, SessionEntryError>
  readonly resolveModelResponse: (
    event: ModelResponseEvent,
  ) => Effect.Effect<CompletedModelResponse, ResolveModelResponseError>
  /** Read one bounded, ordered page strictly after an opaque root-bound cursor. */
  readonly treeReplay: (
    input: import("./tree.js").ReplayInput,
  ) => Effect.Effect<import("./tree.js").ReplayPage, TreeReplayError>
  readonly treeChanges: (rootRunId: string) => Stream.Stream<void, TreeEventsError>
  /** Atomically pair a point-in-time tree inspection with its exclusive replay cursor. */
  readonly treeCheckpoint: (rootRunId: string) => Effect.Effect<import("./tree.js").Checkpoint, InspectError>
  readonly list: (input: ListInput) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly respond: (input: RespondInput) => Effect.Effect<void, RespondError>
  readonly respondApproval: (input: RespondApprovalInput) => Effect.Effect<void, RespondApprovalError>
  readonly signal: (input: SignalInput) => Effect.Effect<void, SignalError>
  /** Journal one validated environmental event and resume one matching wait at most once. */
  readonly wake: (runId: string, event: WakeEvent) => Effect.Effect<WakeDisposition, WakeError>
  /** Durably admit cancellation and request interruption from a process-local owner.
   * Successful return does not acknowledge terminal cancellation. Observe Run state or events when
   * the caller must know whether owned work exited and external outcomes became definitive.
   */
  readonly cancel: (input: CancelInput) => Effect.Effect<void, CancelError>
  readonly cancelSession: (input: CancelSessionInput) => Effect.Effect<void, RuntimeUnavailable>
  readonly awaitSessionTerminal: (input: AwaitSessionTerminalInput) => Effect.Effect<void, RuntimeUnavailable>
  /**
   * Send one addressed message into the target's durable inbox.
   *
   * Authorization is relationship-scoped from authoritative identity plus the host policy seam.
   * Address resolution selects one exact target Run before unified inbox admission.
   */
  readonly sendMessage: (input: SendMessageInput) => Effect.Effect<MessageReceipt, SendMessageError>
  /** Pending addressed-message projections for this exact Run. */
  readonly messages: (input: MessagesInput) => Effect.Effect<ReadonlyArray<MailboxEntry>, DirectoryError>
  /** Read ordered durable child settlements for one exact parent Run. */
  readonly childSettlements: (
    input: ChildSettlementsInput,
  ) => Effect.Effect<ReadonlyArray<ChildSettlementNotification>, ChildSettlementError>
  /** Subscribe to durable child settlements, replaying entries after the requested sequence. */
  readonly childSettlementChanges: (
    input: ChildSettlementChangesInput,
  ) => Stream.Stream<ChildSettlementNotification, ChildSettlementError>
  /** Wait for one child's durable settlement without executing or scheduling the parent. */
  readonly awaitChildSettlement: (
    input: AwaitChildSettlementInput,
  ) => Effect.Effect<ChildSettlementNotification, ChildSettlementError>
  /** Addresses this Run may reach under Generalist relationships plus host policy. */
  readonly directory: (runId: string) => Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryError>
  /** Bind one host-assigned name, unique within the Run's naming scope. */
  readonly registerAgentName: (input: RegisterAgentNameInput) => Effect.Effect<DirectoryEntry, RegisterAgentNameError>
  readonly resolveOperation: (input: ResolveOperationInput) => Effect.Effect<void, ResolveOperationError>
  readonly inspect: (runId: string) => Effect.Effect<RuntimeInspection, InspectError>
  /** Start a new Run from one committed journal prefix. */
  readonly fork: (runId: string, options: ForkOptions) => Effect.Effect<RunHandle<unknown>, ForkError>
  /** Continue this Run from an earlier prefix while retaining its old suffix as a branch. */
  readonly rewind: (runId: string, options: RewindOptions) => Effect.Effect<void, RewindError>
  /** Primitive used by the operator API to journal a budget top-up and resume budget suspension. */
  readonly extendBudget: (runId: string, delta: BudgetDelta) => Effect.Effect<void, ExtendBudgetError>
  readonly fanOut: (input: FanOutInput) => Effect.Effect<FanOutReceipt, FanOutError>
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, InspectFanOutError>
  readonly awaitFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, AwaitFanOutError>
}

export class Runtime extends Context.Service<Runtime, Service>()("generalist/runtime/service/Runtime") {}
