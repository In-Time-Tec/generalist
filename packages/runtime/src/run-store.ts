import { Context, Effect, Schema, Stream } from "effect"
import type { ProgramCapabilities } from "@batonfx/core"
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
} from "./errors.js"
import type { Message } from "./message.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunWait, WaitResolution } from "./run-wait.js"
import type { AgentLoopEvent } from "./agent-event.js"
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
  readonly steeringEvents?: ReadonlyArray<AgentLoopEvent>
}

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
  readonly admitSteering: (
    input: AdmitSteeringInput,
  ) => Effect.Effect<void, RunNotFound | RunTerminal | SteeringConflict | RuntimeUnavailable>
  readonly readSteering: (input: ExecutionClaim) => Effect.Effect<ReadonlyArray<SteeringEntry>, WorkerMutationError>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, RunNotFound | RuntimeUnavailable>
  readonly inspectTree: (
    rootRunId: string,
  ) => Effect.Effect<import("./tree.js").Inspection, RunNotFound | RuntimeUnavailable>
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
      readonly event: AgentLoopEvent
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
      readonly checkpoint: ExecutionCheckpoint
      readonly transcript?: Prompt.Prompt
      readonly continuation?: ExecutionContinuation | null
      readonly steeringEntryIds?: ReadonlyArray<string>
    },
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
