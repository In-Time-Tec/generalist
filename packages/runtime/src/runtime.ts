import { Context, Effect, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { TreePolicy } from "./tree-policy.js"
import type { Address } from "./address.js"
import type { PinnedExecutable } from "./executable-manifest.js"
import type { Interface as ExecutableResolverInterface } from "./executable-resolver.js"
import type { Cursor } from "./cursor.js"
import type {
  AddressNotFound,
  AgentNameConflict,
  MailboxFull,
  MailboxRateLimited,
  MessageConflict,
  MessagingUnauthorized,
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
  ChildDepthExceeded,
  ChildLimitExceeded,
  TreePolicyInvalid,
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
import type { AgentName, AddressInvalid, DirectoryEntry } from "./agent-directory.js"
import type { MailboxBounds, MailboxEntry, MessageReceipt } from "./mailbox.js"
import type { Interface as MessagingPolicyInterface } from "./messaging.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunEvent } from "./run-event.js"
import type { WaitResolution } from "./run-wait.js"
import type { FanOutInput, FanOutInspection, FanOutMemberOrigin, FanOutReceipt, InitialFanOutInput } from "./fan-out.js"
import type { ResolveOperationInput } from "./operation-resolution.js"
import type { SteeringReceipt } from "./steering.js"
import type { RespondInput as RespondApprovalInput } from "./approval.js"
import type { ExecutableRegistration } from "./executable-registration.js"
import type { Duration } from "effect"
import type { Notification as ChildSettlementNotification } from "./child-settlement.js"
import type { ModelPreviewEvent } from "./model-preview.js"

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
  /** Host policy for addressing beyond Baton's derived relationships. Absent means relationships only. */
  readonly messagingPolicy?: MessagingPolicyInterface
  readonly mailboxBounds?: Partial<MailboxBounds>
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

export interface StartInput {
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

/** @experimental Select the memory-only live preview lane for one Run. */
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

export interface CancelSessionInput {
  readonly sessionId: string
  readonly reason?: string
}

export interface AwaitSessionTerminalInput {
  readonly sessionId: string
}

export interface SteerInput {
  readonly runId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
}

/**
 * @experimental One addressed send between agents.
 *
 * `fromRunId` is the authoritative sender: Baton reads its identity, parentage, and session from the
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
}

/** @experimental */
export interface MessagesInput {
  readonly runId: string
  readonly limit: number
}

/** @experimental */
export interface ChildSettlementsInput {
  readonly parentRunId: string
  readonly afterSequence?: number
  readonly limit: number
}

/** @experimental */
export interface ChildSettlementChangesInput {
  readonly parentRunId: string
  readonly afterSequence?: number
}

/** @experimental */
export interface AwaitChildSettlementInput {
  readonly parentRunId: string
  readonly childRunId: string
}

/** @experimental */
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
export type StartError =
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
export type SpawnError =
  | RunNotFound
  | RunTerminal
  | ChildSelectionMissing
  | IdempotencyConflict
  | RuntimeUnavailable
  | ChildDepthExceeded
  | ChildLimitExceeded
export type SendMessageError =
  | AddressNotFound
  | AddressInvalid
  | MessagingUnauthorized
  | MailboxFull
  | MailboxRateLimited
  | MessageConflict
  | RunTerminal
  | RunNotFound
  | RuntimeUnavailable
export type DirectoryError = RunNotFound | RuntimeUnavailable
export type ChildSettlementError = RunNotFound | RuntimeUnavailable
export type RegisterAgentNameError = RunNotFound | AgentNameConflict | RuntimeUnavailable
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
  | ChildDepthExceeded
  | ChildLimitExceeded
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
  /**
   * @experimental Observe the memory-only live preview lane for one Run.
   *
   * Frames contain bounded UTF-16 appends with per-attempt sequences and per-channel offsets.
   * Subscribers may lose frames without blocking execution and detect that loss from the next
   * frame. Preview events are memory-only and never durable RunEvents.
   */
  readonly previews: (input: PreviewsInput) => Stream.Stream<ModelPreviewEvent>
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
  readonly cancelSession: (input: CancelSessionInput) => Effect.Effect<void, RuntimeUnavailable>
  readonly awaitSessionTerminal: (input: AwaitSessionTerminalInput) => Effect.Effect<void, RuntimeUnavailable>
  readonly steer: (input: SteerInput) => Effect.Effect<SteeringReceipt, SteerError>
  /**
   * @experimental Send one addressed message into the target's durable inbox.
   *
   * Authorization is relationship-scoped from authoritative identity plus the host policy seam.
   * Delivery to a live target lands at its next turn boundary; otherwise it waits for its next Run.
   */
  readonly sendMessage: (input: SendMessageInput) => Effect.Effect<MessageReceipt, SendMessageError>
  /** @experimental Messages admitted for a Run's session that no Run has taken yet. */
  readonly messages: (input: MessagesInput) => Effect.Effect<ReadonlyArray<MailboxEntry>, DirectoryError>
  /** @experimental Read ordered durable child settlements for one exact parent Run. */
  readonly childSettlements: (
    input: ChildSettlementsInput,
  ) => Effect.Effect<ReadonlyArray<ChildSettlementNotification>, ChildSettlementError>
  /** @experimental Subscribe to durable child settlements, replaying entries after the requested sequence. */
  readonly childSettlementChanges: (
    input: ChildSettlementChangesInput,
  ) => Stream.Stream<ChildSettlementNotification, ChildSettlementError>
  /** @experimental Wait for one child's durable settlement without executing or scheduling the parent. */
  readonly awaitChildSettlement: (
    input: AwaitChildSettlementInput,
  ) => Effect.Effect<ChildSettlementNotification, ChildSettlementError>
  /** @experimental Addresses this Run may reach under Baton relationships plus host policy. */
  readonly directory: (runId: string) => Effect.Effect<ReadonlyArray<DirectoryEntry>, DirectoryError>
  /** @experimental Bind one host-assigned name, unique within the Run's naming scope. */
  readonly registerAgentName: (input: RegisterAgentNameInput) => Effect.Effect<DirectoryEntry, RegisterAgentNameError>
  readonly resolveOperation: (input: ResolveOperationInput) => Effect.Effect<void, ResolveOperationError>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, InspectError>
  readonly fanOut: (input: FanOutInput) => Effect.Effect<FanOutReceipt, FanOutError>
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, InspectFanOutError>
  readonly awaitFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, AwaitFanOutError>
}

export class Runtime extends Context.Service<Runtime, Interface>()("@batonfx/runtime/runtime") {}
