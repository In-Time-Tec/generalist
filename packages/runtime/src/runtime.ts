import { Context, Effect, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Address } from "./address.js"
import type { PinnedExecutable } from "./executable-manifest.js"
import type { Interface as ExecutableResolverInterface } from "./executable-resolver.js"
import type { Cursor } from "./cursor.js"
import type {
  AddressNotFound,
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
  TreeCursorExpired,
  ChildSelectionMissing,
  OperationResolutionConflict,
  ExecutableIdentityMismatch,
  ExecutablePinMissing,
  ExecutableRegistrationConflict,
  ExecutableRegistrationInvalid,
  ExecutableRegistrationMissing,
  StartInvalid,
} from "./errors.js"
import type { Metadata } from "./message.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunEvent } from "./run-event.js"
import type { WaitResolution } from "./run-wait.js"
import type { FanOutInput, FanOutInspection, FanOutReceipt, InitialFanOutInput } from "./fan-out.js"
import type { ResolveOperationInput } from "./operation-resolution.js"
import type { RespondInput as RespondApprovalInput } from "./approval.js"
import type { ExecutableRegistration } from "./executable-registration.js"
import type { Duration } from "effect"

export type { InitialFanOutInput } from "./fan-out.js"

export interface AddressBinding {
  readonly address: Address
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export interface LayerOptions {
  readonly addresses: ReadonlyArray<AddressBinding>
  readonly resolver: ExecutableResolverInterface
  readonly subscriberQueueCapacity?: number
  readonly scheduler?: {
    readonly concurrency?: number
    readonly pollInterval?: Duration.Input
  }
}

export interface SendInput {
  readonly runId?: string
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

export interface StartInput {
  readonly runId?: string
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
  readonly initialChildren?: ReadonlyArray<InitialChildInput>
  readonly initialFanOuts?: ReadonlyArray<InitialFanOutInput>
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

export interface SpawnInput {
  readonly parentRunId: string
  readonly invocationId: string
  readonly selection: string
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

export interface ListInput {
  readonly status?: RunStatus
  readonly limit: number
}

export interface RespondInput {
  readonly runId: string
  readonly waitId: string
  readonly resolution: Exclude<WaitResolution, { readonly _tag: "Signal" }>
  readonly idempotencyKey?: string
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

export interface SteerInput {
  readonly runId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
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
  | RuntimeUnavailable
export type StartError =
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
  | RuntimeUnavailable
export type SpawnError = RunNotFound | RunTerminal | ChildSelectionMissing | IdempotencyConflict | RuntimeUnavailable
export type EventsError = RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable
export type TreeEventsError = RunNotFound | TreeCursorInvalid | TreeCursorExpired | RuntimeUnavailable
export type RespondError = RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable
export type RespondApprovalError = RunNotFound | ApprovalStale | ApprovalMismatch | RuntimeUnavailable
export type SignalError = RunNotFound | RunTerminal | RuntimeUnavailable
export type CancelError = RunNotFound | RuntimeUnavailable
export type SteerError = RunNotFound | RunTerminal | SteeringConflict | RuntimeUnavailable
export type ResolveOperationError = RunNotFound | OperationResolutionConflict | RuntimeUnavailable
export type InspectError = RunNotFound | RuntimeUnavailable
export type FanOutError =
  | RunNotFound
  | RunTerminal
  | FanOutConflict
  | FanOutInvalid
  | FanOutRemainderUnsupported
  | ChildSelectionMissing
  | RuntimeUnavailable
export type InspectFanOutError = FanOutNotFound | RuntimeUnavailable
export type AwaitFanOutError = InspectFanOutError | EventsError

export interface Interface {
  readonly start: (input: StartInput) => Effect.Effect<StartReceipt, StartError>
  readonly send: (input: SendInput) => Effect.Effect<RunReceipt, SendError>
  readonly spawn: (input: SpawnInput) => Effect.Effect<RunReceipt, SpawnError>
  readonly events: (input: EventsInput) => Stream.Stream<RunEvent, EventsError>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, InspectError>
  readonly history: (input: HistoryInput) => Effect.Effect<ReadonlyArray<RunEvent>, EventsError>
  readonly treeHistory: (
    input: import("./tree.js").HistoryInput,
  ) => Effect.Effect<import("./tree.js").TreePage, TreeEventsError>
  readonly treeChanges: (rootRunId: string) => Stream.Stream<void, TreeEventsError>
  readonly inspectTree: (rootRunId: string) => Effect.Effect<import("./tree.js").Inspection, InspectError>
  readonly list: (input: ListInput) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly respond: (input: RespondInput) => Effect.Effect<void, RespondError>
  readonly respondApproval: (input: RespondApprovalInput) => Effect.Effect<void, RespondApprovalError>
  readonly signal: (input: SignalInput) => Effect.Effect<void, SignalError>
  readonly cancel: (input: CancelInput) => Effect.Effect<void, CancelError>
  readonly steer: (input: SteerInput) => Effect.Effect<void, SteerError>
  readonly resolveOperation: (input: ResolveOperationInput) => Effect.Effect<void, ResolveOperationError>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, InspectError>
  readonly fanOut: (input: FanOutInput) => Effect.Effect<FanOutReceipt, FanOutError>
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, InspectFanOutError>
  readonly awaitFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, AwaitFanOutError>
}

export class Runtime extends Context.Service<Runtime, Interface>()("@batonfx/runtime/Runtime") {}
