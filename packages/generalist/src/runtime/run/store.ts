/* eslint-disable max-lines -- RunStore keeps one storage service contract. */
import { Context, Effect, Schema, Stream, Option } from "effect"
import type { BudgetLimits, Exhausted as RunBudgetExhausted } from "../../core/durable/run-budget.js"
import type { ProgramBudgetExhausted } from "../../core/program/capabilities.js"
import type { InboxFull } from "../../core/turn/steering.js"
import type { SessionStore as SessionService } from "../../core/context/session.js"
import type { CancellationOutcome } from "../../core/tools/tool-executor.js"
import type { Address } from "../address.js"
import type { Cursor } from "../cursor.js"
import type {
  AddressNotFound,
  CursorExpired,
  IdempotencyConflict,
  RunIdConflict,
  ResponseConflict,
  ApprovalStale,
  ApprovalMismatch,
  RunNotFound,
  RunBusy,
  RunTerminal,
  RuntimeUnavailable,
  SubscriberLagged,
  SteeringConflict,
  WaitNotOpen,
  FanOutConflict,
  FanOutInvalid,
  FanOutNotFound,
  ChildSelectionMissing,
  TreeCursorExpired,
  TreeCursorFuture,
  TreeReplayLimitInvalid,
  OperationResolutionConflict,
  ExecutableRegistrationConflict,
  StartInvalid,
  FanOutRemainderUnsupported,
  AgentNameConflict,
  ChildDepthExceeded,
  ChildLimitExceeded,
  TreePolicyInvalid,
  AckInvalid,
  AckBeyondCommitted,
  IllegalOperatorAction,
  ForkSequenceInvalid,
  NoSnapshot,
  SubstitutionInvalid,
} from "../errors.js"
import type { Message } from "../messaging/message.js"
import type { AgentName, DirectoryEntry } from "../execution/agent/directory.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "../run.js"
import type { RunWait, WaitResolution } from "./wait.js"
import type { EmittableAgentLoopEvent } from "../execution/agent/event.js"
import type { CommitModelResponseInput } from "../execution/model-response/commit.js"
import type { CommitInterruptedModelResponseInput } from "../execution/model-response/interrupted.js"
import { ExecutionResult, type ExecutionCheckpoint, type ExecutionSuspension } from "../execution/state.js"
import { RunFailure, type RewardInput, type RunEvent } from "./event.js"
import type { CancelInput, RespondInput, SignalInput, SpawnInput, StartReceipt } from "../service.js"
import type { ResolveOperationInput } from "../operation/resolution.js"
import type { RespondInput as RespondApprovalInput } from "../operation/approval.js"
import type { OperationRecord, OperationStatus } from "../sql/operations.js"
import type { ExecutionContinuation, SteeringEntry } from "./steering.js"
import type { FanOutInspection, FanOutReceipt } from "../child/fan-out.js"
import type { AdmitFanOutInput } from "../child/fan-out-internal.js"
import type { Notification as ChildSettlementNotification } from "../child/settlement.js"
import type {
  CompleteProgramInput,
  AdmitProgramAgentsInput,
  ProgramOperationRecord,
  ProgramRunState,
  ProgramStoreFailure,
  ReserveProgramOperationInput,
  SettleProgramOperationInput,
  SuspendProgramOperationInput,
  CommitProgramLogInput,
} from "../program/store.js"
import type {
  AdmitProgramChildAndSuspendInput,
  AdmitProgramChildInput,
  AdmitSendInput,
  AdmitStartInput,
  AdmitRollbackInput,
  AdmitSteeringInput,
  CompletionOutcome,
  DirectoryLookupError,
  Durability,
  ExecutionClaim,
  ExecutionRecord,
  ForkRunInput,
  OperationCompletionOutcome,
  RewindRunInput,
  RecordOperationInput,
  ResolveAddressError,
  SessionReader,
  SessionWriteClaim,
  StoreBackend,
  StoreInfo,
  SteeringAdmission,
  WorkerMutationError,
} from "./store-types.js"
import type { Point as AcknowledgementPoint } from "./acknowledgement.js"
import type {
  HostSession,
  HostSessionEvent,
  SessionConflict,
  SessionCursorExpired,
  SessionNotFound,
  SessionSubscriberLagged,
} from "../session/host.js"
import type {
  Journal as RecoveryJournal,
  ResolveUnknownInput,
  RetryInput,
  WakeInput,
} from "../execution/recovery/operator.js"
import type { WakeEvent } from "../../core/agent/tools/wake-event.js"
import type { DueAwaitEvent, WakeDisposition } from "../execution/trigger/wake.js"
import type { ClaimedSchedule, ScheduleReceipt, ScheduleRecord } from "../execution/trigger/schedule.js"
import type {
  ArtifactAppend,
  ArtifactCrdtMismatch,
  ArtifactFork,
  ArtifactHead,
  ArtifactNotFound,
  ArtifactSubscriberLagged,
  ArtifactUpdate,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
} from "../../core/artifact.js"
export type {
  AdmitProgramChildAndSuspendInput,
  AdmitProgramChildInput,
  AdmitSendInput,
  AdmitStartInput,
  AdmitRollbackInput,
  AdmitSteeringInput,
  CompletionOutcome,
  DirectoryLookupError,
  Durability,
  ExecutionClaim,
  ExecutionRecord,
  ForkRunInput,
  OperationCompletionOutcome,
  RewindRunInput,
  RecordOperationInput,
  ResolveAddressError,
  SessionReader,
  SessionWriteClaim,
  StoreBackend,
  StoreInfo,
  SteeringAdmission,
  WorkerMutationError,
}

export const PendingRunOutcome = Schema.Union([
  Schema.TaggedStruct("Completed", { result: ExecutionResult }),
  Schema.TaggedStruct("Failed", { error: RunFailure }),
])
export type PendingRunOutcome = typeof PendingRunOutcome.Type

export interface Service {
  readonly info: Effect.Effect<StoreInfo>
  /** Read-only durable conversation history for one Session identity. */
  readonly sessionReader: (sessionId: string) => Effect.Effect<Option.Option<SessionReader>>
  /** Session writer bound to one storage-issued execution claim. */
  readonly claimedSessionStore: (claim: ExecutionClaim) => Effect.Effect<Option.Option<SessionService>>
  readonly hasAdmission: (input: {
    readonly address: Address
    readonly sessionId: string
    readonly idempotencyKey: string
  }) => Effect.Effect<boolean, RuntimeUnavailable>
  readonly admitSend: (
    input: AdmitSendInput,
  ) => Effect.Effect<
    RunReceipt,
    | AddressNotFound
    | IdempotencyConflict
    | RunIdConflict
    | ExecutableRegistrationConflict
    | RuntimeUnavailable
    | TreePolicyInvalid
  >
  readonly admitStart: (
    input: AdmitStartInput,
    options?: { readonly activate?: boolean },
  ) => Effect.Effect<
    StartReceipt,
    | IdempotencyConflict
    | RunIdConflict
    | ChildSelectionMissing
    | ExecutableRegistrationConflict
    | StartInvalid
    | FanOutConflict
    | FanOutInvalid
    | FanOutRemainderUnsupported
    | RuntimeUnavailable
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
    | TreePolicyInvalid
  >
  readonly activate: (input: {
    readonly runId: string
  }) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
  readonly extendBudget: (runId: string, delta: BudgetLimits) => Effect.Effect<void, RunNotFound | RuntimeUnavailable>
  readonly admitSpawn: (
    input: SpawnInput & {
      readonly message: Message
      readonly parentRunId: string
    },
  ) => Effect.Effect<
    RunReceipt,
    | RunNotFound
    | RunTerminal
    | ChildSelectionMissing
    | IdempotencyConflict
    | RuntimeUnavailable
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
  >
  readonly admitProgramChild: (
    input: AdmitProgramChildInput,
  ) => Effect.Effect<
    RunReceipt,
    | RunNotFound
    | RunTerminal
    | IdempotencyConflict
    | RunIdConflict
    | RuntimeUnavailable
    | import("../sql/errors.js").StaleClaim
    | import("../sql/errors.js").StaleSessionClaim
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
  >
  readonly admitProgramChildAndSuspend: (
    input: AdmitProgramChildAndSuspendInput,
  ) => Effect.Effect<
    ReadonlyArray<RunReceipt>,
    | RunNotFound
    | RunTerminal
    | IdempotencyConflict
    | RunIdConflict
    | RuntimeUnavailable
    | import("../sql/errors.js").StaleClaim
    | import("../sql/errors.js").StaleSessionClaim
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
  >
  readonly events: (input: {
    readonly runId: string
    readonly cursor: Cursor
  }) => Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
  readonly respond: (
    input: RespondInput,
  ) => Effect.Effect<void, RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable>
  readonly respondApproval: (
    input: RespondApprovalInput,
  ) => Effect.Effect<void, RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable>
  readonly signal: (input: SignalInput) => Effect.Effect<void, RunNotFound | RunTerminal | RuntimeUnavailable>
  readonly wake: (input: {
    readonly runId: string
    readonly event: WakeEvent
    readonly now: number
  }) => Effect.Effect<WakeDisposition, RunNotFound | RunTerminal | RuntimeUnavailable>
  readonly dueAwaitEvents: (input: {
    readonly now: number
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<DueAwaitEvent>, RuntimeUnavailable>
  readonly timeoutAwaitEvent: (input: {
    readonly runId: string
    readonly waitId: string
    readonly deadline: string
    readonly now: number
  }) => Effect.Effect<boolean, RunNotFound | RunTerminal | RuntimeUnavailable>
  readonly registerSchedule: (record: ScheduleRecord) => Effect.Effect<ScheduleReceipt, RuntimeUnavailable>
  readonly claimSchedules: (input: {
    readonly ownerId: string
    readonly now: number
    readonly leaseMillis: number
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<ClaimedSchedule>, RuntimeUnavailable>
  readonly advanceSchedule: (input: {
    readonly scheduleId: string
    readonly ownerId: string
    readonly occurrence: number
    readonly nextAt: string
    readonly now: number
  }) => Effect.Effect<void, RuntimeUnavailable>
  readonly cancel: (input: CancelInput) => Effect.Effect<void, RunNotFound | RuntimeUnavailable>
  readonly cancelSession: (input: {
    readonly sessionId: string
    readonly reason?: string
  }) => Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable>
  readonly admitSteering: (
    input: AdmitSteeringInput,
  ) => Effect.Effect<
    SteeringAdmission,
    RunNotFound | RunTerminal | RunBusy | SteeringConflict | InboxFull | RuntimeUnavailable
  >
  readonly admitRollback: (
    input: AdmitRollbackInput,
  ) => Effect.Effect<
    SteeringAdmission,
    | RunNotFound
    | RunTerminal
    | RunBusy
    | SteeringConflict
    | InboxFull
    | ForkSequenceInvalid
    | NoSnapshot
    | RuntimeUnavailable
  >
  readonly readSteering: (input: ExecutionClaim) => Effect.Effect<ReadonlyArray<SteeringEntry>, WorkerMutationError>
  /** Read pending inbox entries without claiming execution ownership. */
  readonly pendingSteering: (input: {
    readonly runId: string
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<SteeringEntry>, RunNotFound | RuntimeUnavailable>
  /**
   * The authoritative directory record for one Run.
   *
   * Identity, parentage, and session membership are read from the durable Run record. Nothing is
   * derived by parsing an Address or a Run id.
   */
  readonly directory: (runId: string) => Effect.Effect<DirectoryEntry, DirectoryLookupError>
  readonly resolveAddress: (address: Address) => Effect.Effect<DirectoryEntry, ResolveAddressError>
  /** Bind one host-assigned name, unique inside the naming scope that owns the Run. */
  readonly registerAgentName: (input: {
    readonly runId: string
    readonly name: AgentName
  }) => Effect.Effect<DirectoryEntry, RunNotFound | AgentNameConflict | RuntimeUnavailable>
  /** Parent, direct children, and siblings under one parent, from durable links only. */
  readonly listRelated: (runId: string) => Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryLookupError>
  /** Ordered durable child settlements addressed to one exact parent Run. */
  readonly settlementNotifications: (input: {
    readonly parentRunId: string
    readonly afterSequence: number
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<ChildSettlementNotification>, RunNotFound | RuntimeUnavailable>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
  readonly fork: (
    input: ForkRunInput,
  ) => Effect.Effect<
    RunReceipt,
    RunNotFound | ForkSequenceInvalid | NoSnapshot | SubstitutionInvalid | RuntimeUnavailable
  >
  readonly rewind: (
    input: RewindRunInput,
  ) => Effect.Effect<void, RunNotFound | ForkSequenceInvalid | NoSnapshot | RuntimeUnavailable>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, RunNotFound | RuntimeUnavailable>
  /** Durably advance the host processed-through point to an exact committed model cycle. */
  readonly acknowledge: (input: {
    readonly runId: string
    readonly sequence: number
  }) => Effect.Effect<void, RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable>
  /** Read the durable host processed-through point; -1 means no cycle is acknowledged. */
  readonly acknowledged: (runId: string) => Effect.Effect<AcknowledgementPoint, RunNotFound | RuntimeUnavailable>
  /** Persist one product-facing Session identity and metadata. */
  readonly createHostSession: (input: {
    readonly id: string
    readonly title?: string
  }) => Effect.Effect<HostSession, SessionConflict | RuntimeUnavailable>
  /** Read one product-facing Session by identity. */
  readonly hostSession: (sessionId: string) => Effect.Effect<HostSession, SessionNotFound | RuntimeUnavailable>
  /** List product-facing Sessions in creation order. */
  readonly listHostSessions: Effect.Effect<ReadonlyArray<HostSession>, RuntimeUnavailable>
  /** List root Runs admitted through one product-facing Session. */
  readonly hostSessionRuns: (
    sessionId: string,
  ) => Effect.Effect<ReadonlyArray<RunInspection>, SessionNotFound | RuntimeUnavailable>
  /** Replay then follow one product-facing Session's authoritative event cursor. */
  readonly hostSessionEvents: (input: {
    readonly sessionId: string
    readonly cursor: Cursor
  }) => Stream.Stream<
    HostSessionEvent,
    SessionNotFound | SessionCursorExpired | SessionSubscriberLagged | RuntimeUnavailable
  >
  /** Create or load the main head for one shared artifact. */
  readonly ensureArtifact: (input: {
    readonly artifact: string
    readonly crdt: string
    readonly snapshot: import("../../media/ref.js").Ref
  }) => Effect.Effect<ArtifactHead, ArtifactCrdtMismatch | RuntimeUnavailable>
  /** Load the current head of one artifact branch. */
  readonly artifactHead: (input: {
    readonly artifact: string
    readonly branch?: string
  }) => Effect.Effect<ArtifactHead, ArtifactNotFound | RuntimeUnavailable>
  /** Load one exact historical snapshot from the artifact operation log. */
  readonly artifactSnapshot: (input: {
    readonly artifact: string
    readonly version: number
    readonly branch?: string
  }) => Effect.Effect<ArtifactHead, ArtifactNotFound | ArtifactVersionNotFound | RuntimeUnavailable>
  /** Lazily create a forked Run's private artifact branch from its copied checkpoint. */
  readonly forkArtifact: (
    input: ArtifactFork,
  ) => Effect.Effect<
    ArtifactHead,
    ArtifactNotFound | ArtifactVersionNotFound | ArtifactVersionConflict | ArtifactCrdtMismatch | RuntimeUnavailable
  >
  /** Append one CRDT operation if the expected branch head still matches. */
  readonly appendArtifact: (
    input: ArtifactAppend,
  ) => Effect.Effect<
    ArtifactUpdate,
    ArtifactNotFound | ArtifactVersionNotFound | ArtifactCrdtMismatch | ArtifactVersionConflict | RuntimeUnavailable
  >
  /** Replay then follow committed artifact operations after an exclusive version. */
  readonly artifactUpdates: (input: {
    readonly artifact: string
    readonly version: number
    readonly branch?: string
  }) => Stream.Stream<
    ArtifactUpdate,
    ArtifactNotFound | ArtifactVersionNotFound | ArtifactSubscriberLagged | RuntimeUnavailable
  >
  /** Whether this Run was created by Runtime fork or rewind branch retention. */
  readonly artifactRunIsFork: (runId: string) => Effect.Effect<boolean, RunNotFound | RuntimeUnavailable>
  readonly treeCheckpoint: (
    rootRunId: string,
  ) => Effect.Effect<import("../tree.js").Checkpoint, RunNotFound | RuntimeUnavailable>
  readonly sessionRoots: (sessionId: string) => Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable>
  readonly history: (input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<RunEvent>, RunNotFound | CursorExpired | RuntimeUnavailable>
  readonly recordReward: (input: RewardInput) => Effect.Effect<void, RunNotFound | RuntimeUnavailable>
  readonly treeReplay: (input: {
    readonly rootRunId: string
    readonly position: number
    readonly limit: number
  }) => Effect.Effect<
    import("../tree.js").ReplayPage,
    RunNotFound | TreeCursorExpired | TreeCursorFuture | TreeReplayLimitInvalid | RuntimeUnavailable
  >
  readonly treeChanges: (rootRunId: string) => Stream.Stream<void, RunNotFound | RuntimeUnavailable>
  readonly list: (input: {
    readonly status?: RunStatus
    readonly limit: number
    /** Order of the returned Runs. Defaults to "newest". */
    readonly order?: "newest" | "oldest"
    /** Return only Runs strictly after this Run in the ordering direction. */
    readonly afterRunId?: string
  }) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly complete: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly result: ExecutionResult
    },
  ) => Effect.Effect<CompletionOutcome, WorkerMutationError>
  readonly fail: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly error: RunFailure
    },
  ) => Effect.Effect<void, WorkerMutationError>
  readonly suspend: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly waits: ReadonlyArray<RunWait>
      readonly suspension: ExecutionSuspension
      readonly checkpoint?: ExecutionCheckpoint
      readonly continuation?: ExecutionContinuation | null
    },
  ) => Effect.Effect<void, WorkerMutationError>
  readonly resume: (input: {
    readonly runId: string
    readonly waitId: string
    readonly resolution: WaitResolution
  }) => Effect.Effect<void, RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable>
  readonly emitAgentEvent: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly event: EmittableAgentLoopEvent
    },
  ) => Effect.Effect<void, WorkerMutationError>
  readonly recordOperation: (input: RecordOperationInput) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly startOperation: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly operationId: string
    },
  ) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly completeOperation: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly operationId: string
      readonly outcome: OperationCompletionOutcome
      readonly checkpoint?: ExecutionCheckpoint
      readonly continuation?: ExecutionContinuation | null
      readonly steeringEntryIds?: ReadonlyArray<string>
    },
  ) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly commitModelResponse: (input: CommitModelResponseInput) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly commitInterruptedModelResponse: (
    input: CommitInterruptedModelResponseInput,
  ) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly expireRunningOperation: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly operationId: string
    },
  ) => Effect.Effect<
    { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
    WorkerMutationError
  >
  /** Reconcile operations left running by the prior owner before execution resumes. */
  readonly recoverRunningOperations: (input: ExecutionClaim) => Effect.Effect<"ready" | "blocked", WorkerMutationError>
  readonly getOperation: (input: {
    readonly runId: string
    readonly operationId: string
  }) => Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
  readonly getOperationByKey: (input: {
    readonly runId: string
    readonly operationKey: string
  }) => Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable>
  /** Cancellable tool operations awaiting a definitive concrete-executor acknowledgement. */
  readonly operationCancellations: (
    input: ExecutionClaim,
  ) => Effect.Effect<ReadonlyArray<OperationRecord>, WorkerMutationError>
  /** Persist one definitive semantic cancellation acknowledgement under the current claim. */
  readonly acknowledgeOperationCancellation: (
    input: ExecutionClaim & {
      readonly operationId: string
      readonly outcome: CancellationOutcome
    },
  ) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly resolveOperation: (
    input: ResolveOperationInput,
  ) => Effect.Effect<void, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
  /** Read the normalized durable facts from which operator recovery is derived. */
  readonly recoveryJournal: (runId: string) => Effect.Effect<RecoveryJournal, RunNotFound | RuntimeUnavailable>
  readonly retryRecovery: (
    input: RetryInput,
  ) => Effect.Effect<void, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
  readonly wakeRecovery: (
    input: WakeInput,
  ) => Effect.Effect<void, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
  readonly extendBudgetRecovery: (input: {
    readonly runId: string
    readonly delta: BudgetLimits
    readonly operator: string
  }) => Effect.Effect<void, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
  readonly resolveUnknown: (
    input: ResolveUnknownInput,
  ) => Effect.Effect<void, RunNotFound | IllegalOperatorAction | RuntimeUnavailable>
  readonly claimExecution: (input: {
    readonly runId: string
    readonly ownerId: string
  }) => Effect.Effect<
    ExecutionRecord & ExecutionClaim,
    RunNotFound | RunTerminal | RuntimeUnavailable | import("../sql/errors.js").StaleClaim
  >
  readonly loadExecution: (runId: string) => Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
  readonly releaseExecution: (input: ExecutionClaim) => Effect.Effect<void, RuntimeUnavailable>
  readonly saveExecution: (
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionCheckpoint
      readonly suspension?: ExecutionSuspension
    },
  ) => Effect.Effect<
    void,
    | RunNotFound
    | RuntimeUnavailable
    | import("../sql/errors.js").StaleClaim
    | import("../sql/errors.js").StaleSessionClaim
  >
  readonly retryExecution: (input: ExecutionClaim) => Effect.Effect<ExecutionRecord, WorkerMutationError>
  readonly admitFanOut: (
    input: AdmitFanOutInput,
  ) => Effect.Effect<
    FanOutReceipt,
    | RunNotFound
    | RunTerminal
    | ChildSelectionMissing
    | FanOutConflict
    | FanOutInvalid
    | RuntimeUnavailable
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
  >
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, FanOutNotFound | RuntimeUnavailable>
  readonly reserveProgramOperation: (
    input: ReserveProgramOperationInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
  readonly admitProgramAgents: (
    input: AdmitProgramAgentsInput,
  ) => Effect.Effect<
    ProgramOperationRecord,
    | WorkerMutationError
    | ProgramStoreFailure
    | FanOutInvalid
    | FanOutConflict
    | ChildSelectionMissing
    | ChildDepthExceeded
    | ChildLimitExceeded
  >
  readonly suspendProgramOperation: (
    input: SuspendProgramOperationInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
  readonly settleProgramOperation: (
    input: SettleProgramOperationInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
  readonly startProgramOperation: (
    input: ExecutionClaim & { readonly operation: string },
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError>
  readonly loadProgramState: (
    runId: string,
  ) => Effect.Effect<ProgramRunState | undefined, RunNotFound | RuntimeUnavailable>
  readonly getProgramOperation: (input: {
    readonly runId: string
    readonly operation: string
  }) => Effect.Effect<ProgramOperationRecord | undefined, RunNotFound | RuntimeUnavailable>
  readonly completeProgram: (
    input: CompleteProgramInput,
  ) => Effect.Effect<CompletionOutcome, WorkerMutationError | ProgramBudgetExhausted>
  readonly commitProgramLog: (
    input: CommitProgramLogInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
}

export class RunStore extends Context.Service<RunStore, Service>()("generalist/runtime/run/store/RunStore") {}
