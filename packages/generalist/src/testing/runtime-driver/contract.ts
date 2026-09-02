import type { Effect, Layer } from "effect"
import type { Address } from "../../runtime/address.js"
import type {
  ExecutionClaim,
  RunStore,
  Service as RunStoreService,
  SessionWriteClaim,
} from "../../runtime/run/store.js"
import type { Runtime, Service as RuntimeService } from "../../runtime/service.js"
import type { Service as RunExecutorService } from "../../runtime/execution/run-executor.js"
import type { RunClaims } from "../../runtime/sql/run/claims.js"

/** A multi-worker claim without the driver's decoded persisted Run representation. */
export interface WorkerClaim {
  readonly runId: string
  readonly workerId: string
  readonly attemptFence: number
  readonly session: SessionWriteClaim
}

/** Runtime services passed to driver-specific conformance operations. */
export interface Services {
  readonly runtime: RuntimeService
  readonly store: RunStoreService
  readonly executor?: RunExecutorService
  readonly claims?: RunClaims["Service"]
}

/** Driver-specific activation or worker claim needed before a fenced mutation. */
export type ClaimExecution = (
  services: Services,
  input: { readonly runId: string; readonly workerId: string },
) => Effect.Effect<ExecutionClaim>

/** Runtime control and durable-event conformance capability. */
export interface RuntimeCapability {
  readonly claim: ClaimExecution
}

/** Product-facing Session persistence and replay capability. */
export interface HostSessionsCapability {
  readonly claim: ClaimExecution
}

/** Typed Agent start capability exercised with one storage-issued execution claim. */
export interface StartByAgentCapability {
  readonly claim: ClaimExecution
}

/** Typed Agent idempotent-start capability exercised with one storage-issued execution claim. */
export interface IdempotentStartCapability {
  readonly claim: ClaimExecution
}

/** Missing-registration recovery capability exercised with one storage-issued execution claim. */
export interface UnknownAgentOnRecoveryCapability {
  readonly claim: ClaimExecution
}

/** RunTree finite replay conformance capability. */
export interface RunTreeCapability {
  readonly claim: ClaimExecution
}

/** SQL transaction conformance capability. */
export interface SqlTransactionCapability {
  readonly claim: ClaimExecution
  readonly forceRollback: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
}

/** Durable notification recovery conformance capability. */
export interface NotificationRecoveryCapability {
  readonly claim: ClaimExecution
}

/** Durable approval suspension and recovery capability. */
export interface ApprovalSuspendCapability {
  readonly claim: ClaimExecution
  /** Persistent drivers rebuild their Runtime; process-memory drivers reclaim through a fresh owner. */
  readonly recovery: "rebuild" | "reclaim"
}

/** Multi-worker claim and fencing conformance capability. */
export interface MultiWorkerClaimCapability<E = never> {
  readonly layer: Layer.Layer<Runtime | RunStore | RunClaims, E, never>
  readonly expire: (claim: WorkerClaim) => Effect.Effect<void>
}

/** Independently selectable Runtime driver conformance capabilities. */
export interface Capabilities<ClaimsLayerError = never> {
  readonly admission?: true
  readonly runtime?: RuntimeCapability
  readonly "host-sessions"?: HostSessionsCapability
  readonly "start-by-agent"?: StartByAgentCapability
  readonly "idempotent-start"?: IdempotentStartCapability
  readonly "unknown-agent-on-recovery"?: UnknownAgentOnRecoveryCapability
  readonly runTree?: RunTreeCapability
  readonly sqlTransactions?: SqlTransactionCapability
  readonly multiWorkerClaims?: MultiWorkerClaimCapability<ClaimsLayerError>
  readonly notificationRecovery?: NotificationRecoveryCapability
  readonly "approval-suspend"?: ApprovalSuspendCapability
}

/** Configuration for the authoritative Runtime driver conformance suites. */
export interface Options<LayerError = never, ClaimsLayerError = never> {
  readonly name: string
  readonly address: Address
  readonly layer: Layer.Layer<Runtime | RunStore, LayerError, never>
  readonly capabilities: Capabilities<ClaimsLayerError>
  readonly setup?: Effect.Effect<void>
  readonly skip?: boolean
}
