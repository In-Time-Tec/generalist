import type { DurabilityFailure } from "../../durability/errors.js"
import type { Inheritance } from "../../core/agent/lifecycle/fan-out.js"
import type { StaleClaim, StaleSessionClaim } from "./ownership-errors.js"
import type { TreePolicy } from "../tree/policy.js"
import type { RunNotFound, RunTerminal, RuntimeUnavailable, PayloadTooLarge } from "../errors.js"
import type { Message } from "../messaging/message.js"
import type { AddressInvalid } from "../execution/agent/directory.js"
import type { RunWait } from "./wait.js"
import type { WaitResponse } from "./wait-internal.js"
import type { DurableAgentLoopEvent } from "../execution/agent/event.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "../execution/state.js"
import type { ExecutableManifest, ExecutableRef } from "../executable/manifest.js"
import type { InitialChildInput } from "../engine.js"
import type { OperationKind, ReplayPolicy } from "../operation/record.js"
import type { AdmissionPolicy, ExecutionContinuation, MessageSource, SteeringReceipt } from "./steering.js"
import type { ExecutableRegistration } from "../executable/registration.js"
import type { Prompt } from "effect/unstable/ai"
import type { InitialFanOutInput } from "../child/fan-out-internal.js"
import type { SessionStore as SessionService } from "../../core/context/session.js"
import type { BudgetLimits } from "../../core/durable/run-budget.js"
import type { ForkOptions, RewindOptions } from "../fork.js"

export type Durability = "durable"

/** Caller-retained identity for a repeatable mutation; reuse only with the exact original input. */
export interface CommandIdentity {
  readonly commandId: string
}

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
        Omit<InitialFanOutInput["members"][number], "prompt" | "inherit"> & {
          readonly prompt: Prompt.Prompt
          readonly inherit?: Inheritance
        }
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
  readonly backend: "object"
  readonly multiWorker: true
}

export interface ForkRunInput extends ForkOptions {
  readonly runId: string
  readonly newRunId: string
}

export interface RewindRunInput extends RewindOptions {
  readonly runId: string
  readonly branchRunId: string
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

export type DirectoryLookupError = RunNotFound | RuntimeUnavailable
export type ResolveAddressError = import("../errors.js").AddressNotFound | AddressInvalid | RuntimeUnavailable

export interface AdmitSteeringInput {
  readonly sessionCommandId?: string
  readonly runId: string
  readonly idempotencyKey: string
  readonly digest: string
  readonly prompt: Prompt.Prompt
  readonly policy: AdmissionPolicy
  readonly from: MessageSource
  readonly addressed?: Message
}

/** Runtime-internal result distinguishing a new admission from an exact retry. */
export interface SteeringAdmission {
  readonly receipt: SteeringReceipt
  readonly duplicate: boolean
}

export interface AdmitRollbackInput extends AdmitSteeringInput {
  readonly branchRunId: string
}

export type CompletionOutcome =
  | { readonly _tag: "Completed" }
  | { readonly _tag: "SteeringPending"; readonly continuation: ExecutionContinuation }

export type OperationCompletionOutcome =
  | { readonly _tag: "Succeeded"; readonly value: unknown }
  | { readonly _tag: "Failed"; readonly error: unknown }
  | { readonly _tag: "Unknown" }

export interface ExecutionRecord {
  readonly sessionComponents?: ReadonlyArray<import("../../core/durable/component/state.js").Checkpoint>
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
  readonly operationNamespace?: string
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
export type SessionReader = Pick<
  SessionService,
  "entry" | "pathPage" | "effectivePath" | "latestCompaction" | "path" | "leaf"
>

export interface ExecutionClaim {
  readonly runId: string
  readonly ownerId: string
  readonly attemptFence: number
  readonly session?: SessionWriteClaim
}

export type WorkerMutationError =
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | PayloadTooLarge
  | StaleClaim
  | StaleSessionClaim
  | DurabilityFailure
