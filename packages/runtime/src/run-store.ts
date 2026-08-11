import { Context, Effect, Schema, Stream, Option } from "effect"
import type { ProgramCapabilities, Session } from "@batonfx/core"
import type { Address } from "./address.js"
import type { Cursor } from "./cursor.js"
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
  TreeCursorInvalid,
  OperationResolutionConflict,
  ExecutableRegistrationConflict,
  StartInvalid,
  FanOutRemainderUnsupported,
  AgentNameConflict,
  MailboxFull,
  MailboxRateLimited,
  MessageConflict,
} from "./errors.js"
import type { Message, Metadata } from "./message.js"
import type { AddressInvalid, AgentName, DirectoryEntry } from "./agent-directory.js"
import type { MailboxBounds, MailboxEntry, MessageReceipt } from "./mailbox.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunWait, WaitResolution } from "./run-wait.js"
import type { DurableAgentLoopEvent, EmittableAgentLoopEvent } from "./agent-event.js"
import type { CommitModelResponseInput } from "./model-response-commit.js"
import type { CommitInterruptedModelResponseInput } from "./model-response-interrupted.js"
import { ExecutionResult } from "./execution-state.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "./execution-state.js"
import { RunFailure } from "./run-event.js"
import type { RunEvent } from "./run-event.js"
import type { ExecutableManifest, ExecutableRef } from "./executable-manifest.js"
import type { CancelInput, InitialChildInput, RespondInput, SignalInput, SpawnInput, StartReceipt } from "./runtime.js"
import type { ResolveOperationInput } from "./operation-resolution.js"
import type { RespondInput as RespondApprovalInput } from "./approval.js"
import type { OperationKind, OperationRecord, OperationStatus, ReplayPolicy } from "./sql/operations.js"
import type { ExecutionContinuation, SteeringEntry } from "./steering.js"
import type { ExecutableRegistration } from "./executable-registration.js"
import type { Prompt } from "effect/unstable/ai"
import type { AdmitFanOutInput, FanOutInspection, FanOutReceipt, InitialFanOutInput } from "./fan-out.js"
import type { Notification as ChildSettlementNotification } from "./child-settlement.js"
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
} from "./program-store.js"

export type Durability = "ephemeral" | "durable"
export type StoreBackend = "memory" | "sqlite" | "postgres" | "mysql"

export interface AdmitSendInput {
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly runId?: string
}

export interface AdmitStartInput extends AdmitSendInput {
  readonly initialChildren: ReadonlyArray<Omit<InitialChildInput, "prompt"> & { readonly prompt: Prompt.Prompt }>
  readonly initialFanOuts: ReadonlyArray<
    Omit<InitialFanOutInput, "members"> & {
      readonly members: ReadonlyArray<
        Omit<InitialFanOutInput["members"][number], "prompt"> & { readonly prompt: Prompt.Prompt }
      >
    }
  >
}

export const PendingRunOutcome = Schema.Union([
  Schema.TaggedStruct("Completed", { result: ExecutionResult }),
  Schema.TaggedStruct("Failed", { error: RunFailure }),
])
export type PendingRunOutcome = typeof PendingRunOutcome.Type

/** @experimental Exact Runtime-internal Program child admission. */
export interface AdmitProgramChildInput extends ExecutionClaim {
  readonly childRunId: string
  readonly invocationId: string
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/** @experimental Atomic Code Mode child admission and parent suspension. */
export interface AdmitProgramChildAndSuspendInput extends AdmitProgramChildInput {
  readonly wait: RunWait
  readonly suspension: ExecutionSuspension
  readonly checkpoint?: ExecutionCheckpoint
  readonly transcript?: Prompt.Prompt
  readonly continuation?: ExecutionContinuation | null
}

export interface StoreInfo {
  readonly durability: Durability
  readonly backend: StoreBackend
  readonly multiWorker: boolean
}

export interface RecordOperationInput extends ExecutionClaim {
  readonly runId: string
  readonly operationKey: string
  readonly kind: OperationKind
  readonly inputDigest: string
  readonly input: unknown
  readonly replayPolicy: ReplayPolicy
  readonly attempt: number
  readonly checkpoint?: ExecutionCheckpoint
  readonly transcript?: Prompt.Prompt
  readonly continuation?: ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
  readonly steeringEvents?: ReadonlyArray<DurableAgentLoopEvent>
}

/** @experimental Exact durable mailbox admission derived from authoritative sender identity. */
export interface AdmitMessageInput {
  readonly fromRunId: string
  readonly fromAddress: Address
  readonly to: Address
  readonly targetSessionId: string
  readonly messageId: string
  readonly idempotencyKey: string
  readonly digest: string
  readonly bytes: number
  readonly prompt: Prompt.Prompt
  readonly correlationId: string
  readonly causationId?: string
  readonly inReplyTo?: string
  readonly metadata: Metadata
  readonly bounds: MailboxBounds
}

/** @experimental */
export type AdmitMessageError = MailboxFull | MailboxRateLimited | MessageConflict | RunNotFound | RuntimeUnavailable

/** @experimental */
export type DirectoryLookupError = RunNotFound | RuntimeUnavailable

/** @experimental */
export type ResolveAddressError = AddressNotFound | AddressInvalid | RuntimeUnavailable

export interface AdmitSteeringInput {
  readonly runId: string
  readonly idempotencyKey: string
  readonly digest: string
  readonly prompt: Prompt.Prompt
}

export type CompletionOutcome =
  | { readonly _tag: "Completed" }
  | { readonly _tag: "SteeringPending"; readonly continuation: ExecutionContinuation }

export type OperationCompletionOutcome =
  | { readonly _tag: "Succeeded"; readonly value: unknown }
  | { readonly _tag: "Failed"; readonly error: unknown }
  | { readonly _tag: "Unknown" }

export interface ExecutionRecord {
  readonly runId: string
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly ownerId?: string
  readonly admittedAt: string
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly attempt: number
  readonly attemptFence: number
  readonly checkpoint?: ExecutionCheckpoint
  readonly suspension?: ExecutionSuspension
  readonly resolution?: WaitResolution
  readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
  readonly continuation?: ExecutionContinuation
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export interface ExecutionClaim {
  readonly runId: string
  readonly ownerId: string
  readonly attemptFence: number
}

export type WorkerMutationError =
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("./sql/errors.js").StaleClaim
  | import("effect/unstable/sql/SqlError").SqlError

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
    AddressNotFound | IdempotencyConflict | RunIdConflict | ExecutableRegistrationConflict | RuntimeUnavailable
  >
  readonly admitStart: (
    input: AdmitStartInput,
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
  >
  readonly admitSpawn: (
    input: SpawnInput & {
      readonly message: Message
      readonly parentRunId: string
    },
  ) => Effect.Effect<
    RunReceipt,
    RunNotFound | RunTerminal | ChildSelectionMissing | IdempotencyConflict | RuntimeUnavailable
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
    | import("./sql/errors.js").StaleClaim
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
    | import("./sql/errors.js").StaleClaim
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
  ) => Effect.Effect<void, RunNotFound | RunTerminal | SteeringConflict | RuntimeUnavailable>
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
  readonly inspectTree: (
    rootRunId: string,
  ) => Effect.Effect<import("./tree.js").Inspection, RunNotFound | RuntimeUnavailable>
  readonly sessionRoots: (sessionId: string) => Effect.Effect<ReadonlyArray<string>, RuntimeUnavailable>
  readonly history: (input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<RunEvent>, RunNotFound | CursorExpired | RuntimeUnavailable>
  readonly treeHistory: (input: {
    readonly rootRunId: string
    readonly position: number
    readonly limit: number
  }) => Effect.Effect<
    import("./tree.js").TreePage,
    RunNotFound | TreeCursorInvalid | TreeCursorExpired | RuntimeUnavailable
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
      readonly transcript?: Prompt.Prompt
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
      readonly transcript?: Prompt.Prompt
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
  readonly getOperation: (input: {
    readonly runId: string
    readonly operationId: string
  }) => Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
  readonly getOperationByKey: (input: {
    readonly runId: string
    readonly operationKey: string
  }) => Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable>
  readonly resolveOperation: (
    input: ResolveOperationInput,
  ) => Effect.Effect<void, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
  readonly claimExecution: (input: {
    readonly runId: string
    readonly ownerId: string
  }) => Effect.Effect<
    ExecutionRecord & ExecutionClaim,
    RunNotFound | RunTerminal | RuntimeUnavailable | import("./sql/errors.js").StaleClaim
  >
  readonly loadExecution: (runId: string) => Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
  readonly saveExecution: (
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionCheckpoint
      readonly suspension?: ExecutionSuspension
      readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
    },
  ) => Effect.Effect<void, RunNotFound | RuntimeUnavailable | import("./sql/errors.js").StaleClaim>
  readonly retryExecution: (input: ExecutionClaim) => Effect.Effect<ExecutionRecord, WorkerMutationError>
  readonly admitFanOut: (
    input: AdmitFanOutInput,
  ) => Effect.Effect<
    FanOutReceipt,
    RunNotFound | RunTerminal | ChildSelectionMissing | FanOutConflict | FanOutInvalid | RuntimeUnavailable
  >
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, FanOutNotFound | RuntimeUnavailable>
  readonly reserveProgramOperation: (
    input: ReserveProgramOperationInput,
  ) => Effect.Effect<ProgramOperationRecord, WorkerMutationError | ProgramStoreFailure>
  readonly admitProgramAgents: (
    input: AdmitProgramAgentsInput,
  ) => Effect.Effect<
    ProgramOperationRecord,
    WorkerMutationError | ProgramStoreFailure | FanOutInvalid | FanOutConflict | ChildSelectionMissing
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

export class RunStore extends Context.Service<RunStore, Interface>()("@batonfx/runtime/run-store/RunStore") {}
