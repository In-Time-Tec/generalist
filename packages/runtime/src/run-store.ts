import { Context, Effect, Stream } from "effect"
import type { Cursor } from "./cursor.js"
import type {
  AddressNotFound,
  CursorExpired,
  IdempotencyConflict,
  RunIdConflict,
  ResponseConflict,
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
} from "./errors.js"
import type { Message } from "./message.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunWait, WaitResolution } from "./run-wait.js"
import type { AgentLoopEvent, AgentResult } from "./agent-event.js"
import type { RunEvent, RunFailure } from "./run-event.js"
import type { ExecutableManifest, ExecutableRef } from "./executable-manifest.js"
import type { CancelInput, RespondInput, SignalInput, SpawnInput } from "./runtime.js"
import type { ResolveOperationInput } from "./operation-resolution.js"
import type { OperationKind, OperationRecord, OperationStatus, ReplayPolicy } from "./sql/operations.js"
import type { AgentEvent, DurableDriver } from "@batonfx/core"
import type { ExecutionContinuation, SteeringEntry } from "./steering.js"
import type { Prompt } from "effect/unstable/ai"
import type { AdmitFanOutInput, FanOutInspection, FanOutReceipt } from "./fan-out.js"

export type Durability = "ephemeral" | "durable"
export type StoreBackend = "memory" | "sqlite" | "postgres" | "mysql"

export interface AdmitSendInput {
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly runId?: string
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
  readonly checkpoint?: DurableDriver.DriverCheckpoint
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
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly attempt: number
  readonly attemptFence: number
  readonly checkpoint?: DurableDriver.DriverCheckpoint
  readonly suspension?: AgentEvent.AgentSuspended
  readonly resolution?: WaitResolution
  readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
  readonly continuation?: ExecutionContinuation
}

export interface ExecutionClaim {
  readonly runId: string
  readonly ownerId: string
  readonly attemptFence: number
}

type WorkerMutationError = RunNotFound | RunTerminal | RuntimeUnavailable | import("./sql/errors.js").StaleClaim

export interface Interface {
  readonly info: Effect.Effect<StoreInfo>
  readonly admitSend: (
    input: AdmitSendInput,
  ) => Effect.Effect<RunReceipt, AddressNotFound | IdempotencyConflict | RunIdConflict | RuntimeUnavailable>
  readonly admitSpawn: (
    input: SpawnInput & {
      readonly message: Message
      readonly parentRunId: string
    },
  ) => Effect.Effect<
    RunReceipt,
    RunNotFound | RunTerminal | ChildSelectionMissing | IdempotencyConflict | RuntimeUnavailable
  >
  readonly events: (input: {
    readonly runId: string
    readonly cursor: Cursor
  }) => Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
  readonly respond: (
    input: RespondInput,
  ) => Effect.Effect<void, RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable>
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
  readonly list: (input: {
    readonly status?: RunStatus
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly complete: (
    input: ExecutionClaim & {
      readonly runId: string
      readonly result: AgentResult
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
      readonly suspension: AgentEvent.AgentSuspended
      readonly checkpoint?: DurableDriver.DriverCheckpoint
      readonly transcript?: Prompt.Prompt
      readonly continuation?: ExecutionContinuation | null
    },
  ) => Effect.Effect<void, WorkerMutationError>
  readonly resume: (input: {
    readonly runId: string
    readonly waitId: string
    readonly resolution: WaitResolution
  }) => Effect.Effect<void, RunNotFound | WaitNotOpen | RunTerminal | RuntimeUnavailable>
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
      readonly checkpoint: DurableDriver.DriverCheckpoint
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
      readonly checkpoint?: DurableDriver.DriverCheckpoint
      readonly suspension?: AgentEvent.AgentSuspended
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
}

export class RunStore extends Context.Service<RunStore, Interface>()("@batonfx/runtime/RunStore") {}
