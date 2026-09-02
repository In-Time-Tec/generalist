import type { TreePolicy } from "../tree/policy.js"
import type { Address } from "../address.js"
import type {
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  MailboxFull,
  MailboxRateLimited,
  MessageConflict,
} from "../errors.js"
import type { Message, Metadata } from "../messaging/message.js"
import type { AddressInvalid } from "../execution/agent/directory.js"
import type { MailboxBounds } from "../messaging/mailbox.js"
import type { RunWait } from "./wait.js"
import type { WaitResponse } from "./wait-internal.js"
import type { DurableAgentLoopEvent } from "../execution/agent/event.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "../execution/state.js"
import type { ExecutableManifest, ExecutableRef } from "../executable/manifest.js"
import type { InitialChildInput } from "../service.js"
import type { OperationKind, ReplayPolicy } from "../sql/operations.js"
import type { ExecutionContinuation } from "./steering.js"
import type { ExecutableRegistration } from "../executable/registration.js"
import type { Prompt } from "effect/unstable/ai"
import type { InitialFanOutInput } from "../child/fan-out-internal.js"
import type { SessionStore as SessionService } from "../../core/context/session.js"
import type { BudgetLimits } from "../../core/durable/run-budget.js"

export type Durability = "ephemeral" | "durable"
export type StoreBackend = "memory" | "sqlite" | "postgres" | "mysql"

export interface AdmitSendInput {
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly runId?: string
  readonly treePolicy?: TreePolicy
  readonly budget?: BudgetLimits
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

/** Exact Runtime-internal Program child admission. */
export interface AdmitProgramChildInput extends ExecutionClaim {
  readonly childRunId: string
  readonly invocationId: string
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/** Atomic Code Mode child admissions and parent suspension. */
export interface AdmitProgramChildAndSuspendInput extends ExecutionClaim {
  readonly children: readonly [
    Omit<AdmitProgramChildInput, keyof ExecutionClaim>,
    ...ReadonlyArray<Omit<AdmitProgramChildInput, keyof ExecutionClaim>>,
  ]
  readonly waits: ReadonlyArray<RunWait>
  readonly suspension: ExecutionSuspension
  readonly checkpoint?: ExecutionCheckpoint
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
  readonly continuation?: ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
  readonly steeringEvents?: ReadonlyArray<DurableAgentLoopEvent>
}

/** Exact durable mailbox admission derived from authoritative sender identity. */
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
export type AdmitMessageError = MailboxFull | MailboxRateLimited | MessageConflict | RunNotFound | RuntimeUnavailable
export type DirectoryLookupError = RunNotFound | RuntimeUnavailable
export type ResolveAddressError = import("../errors.js").AddressNotFound | AddressInvalid | RuntimeUnavailable

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
  readonly depth: number
  readonly treePolicy: TreePolicy
  readonly activeChildCount: number
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly ownerId?: string
  readonly admittedAt: string
  readonly message: Message
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly attempt: number
  readonly attemptFence: number
  readonly cancellationRequested: boolean
  readonly checkpoint?: ExecutionCheckpoint
  readonly suspension?: ExecutionSuspension
  readonly resolutions: ReadonlyArray<WaitResponse>
  readonly continuation?: ExecutionContinuation
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/** Storage-issued authority for one exact Runtime Session writer. */
export interface SessionWriteClaim {
  readonly sessionId: string
  readonly runId: string
  readonly ownerId: string
  readonly runAttemptFence: number
  readonly epoch: string
}

/** Read-only Session history capability. */
export type SessionReader = Pick<SessionService, "path" | "leaf">

export interface ExecutionClaim {
  readonly runId: string
  readonly ownerId: string
  readonly attemptFence: number
  readonly session: SessionWriteClaim
}

export type WorkerMutationError =
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("../sql/errors.js").StaleClaim
  | import("../sql/errors.js").StaleSessionClaim
  | import("effect/unstable/sql/SqlError").SqlError
