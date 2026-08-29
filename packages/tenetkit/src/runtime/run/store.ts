import { Context, Effect, Schema, Stream, Option } from "effect"
import type { ProgramCapabilities } from "../../core/index.js"
import { Session } from "../../core/context/public/session.js"
import { ToolExecutor } from "../../core/tools/public/tool-executor.js"
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
} from "../errors.js"
import type { Message } from "../messaging/message.js"
import type { AgentName, DirectoryEntry } from "../execution/agent/directory.js"
import type { MailboxEntry, MessageReceipt } from "../messaging/mailbox.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "../run.js"
import type { RunWait, WaitResolution } from "./wait.js"
import type { EmittableAgentLoopEvent } from "../execution/agent/event.js"
import type { CommitModelResponseInput } from "../execution/model-response/commit.js"
import type { CommitInterruptedModelResponseInput } from "../execution/model-response/interrupted.js"
import { ExecutionResult, type ExecutionCheckpoint, type ExecutionSuspension } from "../execution/state.js"
import { RunFailure, type RunEvent } from "./event.js"
import type { CancelInput, RespondInput, SignalInput, SpawnInput, StartReceipt } from "../service.js"
import type { ResolveOperationInput } from "../operation/resolution.js"
import type { RespondInput as RespondApprovalInput } from "../operation/approval.js"
import type { OperationRecord, OperationStatus } from "../sql/operations.js"
import type { ExecutionContinuation, SteeringEntry, SteeringReceipt } from "./steering.js"
import type { AdmitFanOutInput, FanOutInspection, FanOutReceipt } from "../child/fan-out.js"
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
  AdmitMessageError,
  AdmitMessageInput,
  AdmitProgramChildAndSuspendInput,
  AdmitProgramChildInput,
  AdmitSendInput,
  AdmitStartInput,
  AdmitSteeringInput,
  CompletionOutcome,
  DirectoryLookupError,
  Durability,
  ExecutionClaim,
  ExecutionRecord,
  OperationCompletionOutcome,
  RecordOperationInput,
  ResolveAddressError,
  StoreBackend,
  StoreInfo,
  WorkerMutationError,
} from "./store-types.js"
export type {
  AdmitMessageError,
  AdmitMessageInput,
  AdmitProgramChildAndSuspendInput,
  AdmitProgramChildInput,
  AdmitSendInput,
  AdmitStartInput,
  AdmitSteeringInput,
  CompletionOutcome,
  DirectoryLookupError,
  Durability,
  ExecutionClaim,
  ExecutionRecord,
  OperationCompletionOutcome,
  RecordOperationInput,
  ResolveAddressError,
  StoreBackend,
  StoreInfo,
  WorkerMutationError,
}

export const PendingRunOutcome = Schema.Union([
  Schema.TaggedStruct("Completed", { result: ExecutionResult }),
  Schema.TaggedStruct("Failed", { error: RunFailure }),
])
export type PendingRunOutcome = typeof PendingRunOutcome.Type

export interface Interface {
  readonly info: Effect.Effect<StoreInfo>
  /**
   * @experimental Durable conversation history for one session identity.
   *
   * Session is the authority for model-facing history, so the store that owns durability owns it too.
   * A store without durable Session returns undefined and its Runs fall back to process-bound history.
   */
  readonly sessionStore: (sessionId: string) => Effect.Effect<Option.Option<typeof Session.SessionStore.Service>>
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
    | TreePolicyInvalid
  >
  readonly activate: (input: {
    readonly runId: string
  }) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
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
    | ChildDepthExceeded
    | ChildLimitExceeded
  >
  readonly admitProgramChildAndSuspend: (
    input: AdmitProgramChildAndSuspendInput,
  ) => Effect.Effect<
    RunReceipt,
    | RunNotFound
    | RunTerminal
    | IdempotencyConflict
    | RunIdConflict
    | RuntimeUnavailable
    | import("../sql/errors.js").StaleClaim
    | ChildDepthExceeded
    | ChildLimitExceeded
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
  readonly cancel: (input: CancelInput) => Effect.Effect<void, RunNotFound | RuntimeUnavailable>
  readonly cancelSession: (input: {
    readonly sessionId: string
    readonly reason?: string
  }) => Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable>
  readonly admitSteering: (
    input: AdmitSteeringInput,
  ) => Effect.Effect<SteeringReceipt, RunNotFound | RunTerminal | SteeringConflict | RuntimeUnavailable>
  readonly readSteering: (input: ExecutionClaim) => Effect.Effect<ReadonlyArray<SteeringEntry>, WorkerMutationError>
  /**
   * @experimental The authoritative directory record for one Run.
   *
   * Identity, parentage, and session membership are read from the durable Run record. Nothing is
   * derived by parsing an Address or a Run id.
   */
  readonly directory: (runId: string) => Effect.Effect<DirectoryEntry, DirectoryLookupError>
  readonly resolveAddress: (address: Address) => Effect.Effect<DirectoryEntry, ResolveAddressError>
  /** @experimental Bind one host-assigned name, unique inside the naming scope that owns the Run. */
  readonly registerAgentName: (input: {
    readonly runId: string
    readonly name: AgentName
  }) => Effect.Effect<DirectoryEntry, RunNotFound | AgentNameConflict | RuntimeUnavailable>
  /** @experimental Parent, direct children, and siblings under one parent, from durable links only. */
  readonly listRelated: (runId: string) => Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryLookupError>
  /**
   * @experimental Admit one message into a target's durable inbox.
   *
   * Admission is idempotent on (target, messageId, idempotencyKey) and rejects a divergent payload
   * under the same identity. An entry admitted while the target Run is live is bound to that Run's
   * steering inbox, which the agent loop drains only at a turn boundary; otherwise it stays pending
   * for the target's next Run.
   */
  readonly admitMessage: (input: AdmitMessageInput) => Effect.Effect<MessageReceipt, AdmitMessageError>
  /** @experimental Messages admitted for one session that no Run has taken yet. */
  readonly pendingMessages: (input: {
    readonly sessionId: string
    readonly runId?: string
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<MailboxEntry>, RuntimeUnavailable>
  /** @experimental Ordered durable child settlements addressed to one exact parent Run. */
  readonly settlementNotifications: (input: {
    readonly parentRunId: string
    readonly afterSequence: number
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<ChildSettlementNotification>, RunNotFound | RuntimeUnavailable>
  /** @experimental Bind every pending message for a Run's session to that Run's steering inbox. */
  readonly deliverPendingMessages: (input: {
    readonly runId: string
  }) => Effect.Effect<ReadonlyArray<MailboxEntry>, RunNotFound | RuntimeUnavailable>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, RunNotFound | RuntimeUnavailable>
  readonly treeCheckpoint: (
    rootRunId: string,
  ) => Effect.Effect<import("../tree.js").Checkpoint, RunNotFound | RuntimeUnavailable>
  readonly sessionRoots: (sessionId: string) => Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable>
  readonly history: (input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<RunEvent>, RunNotFound | CursorExpired | RuntimeUnavailable>
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
      readonly wait: RunWait
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
  /** @experimental Reconcile operations left running by the prior owner before execution resumes. */
  readonly recoverRunningOperations: (input: ExecutionClaim) => Effect.Effect<"ready" | "blocked", WorkerMutationError>
  readonly getOperation: (input: {
    readonly runId: string
    readonly operationId: string
  }) => Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
  readonly getOperationByKey: (input: {
    readonly runId: string
    readonly operationKey: string
  }) => Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable>
  /** @experimental Cancellable tool operations awaiting a definitive concrete-executor acknowledgement. */
  readonly operationCancellations: (
    input: ExecutionClaim,
  ) => Effect.Effect<ReadonlyArray<OperationRecord>, WorkerMutationError>
  /** @experimental Persist one definitive semantic cancellation acknowledgement under the current claim. */
  readonly acknowledgeOperationCancellation: (
    input: ExecutionClaim & {
      readonly operationId: string
      readonly outcome: ToolExecutor.CancellationOutcome
    },
  ) => Effect.Effect<OperationRecord, WorkerMutationError>
  readonly resolveOperation: (
    input: ResolveOperationInput,
  ) => Effect.Effect<void, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
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
  ) => Effect.Effect<void, RunNotFound | RuntimeUnavailable | import("../sql/errors.js").StaleClaim>
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
  ) => Effect.Effect<CompletionOutcome, WorkerMutationError | ProgramCapabilities.ProgramBudgetExhausted>
  readonly commitProgramLog: (
    input: CommitProgramLogInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
}

export class RunStore extends Context.Service<RunStore, Interface>()("tenetkit/runtime/run/store/RunStore") {}
