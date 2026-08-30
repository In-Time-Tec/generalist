import type { Effect, Layer } from "effect"
import type { Address } from "../../runtime/address.js"
import type {
  ExecutionClaim,
  RunStore,
  Service as RunStoreService,
  SessionWriteClaim,
} from "../../runtime/run/store.js"
import type { Runtime, Service as RuntimeService } from "../../runtime/service.js"
import type { RunClaims, Service as RunClaimsService } from "../../runtime/sql/run/claims.js"

/** @experimental A multi-worker claim without the driver's decoded persisted Run representation. */
export interface WorkerClaim {
  readonly runId: string
  readonly workerId: string
  readonly attemptFence: number
  readonly session: SessionWriteClaim
}

/** @experimental Runtime services passed to driver-specific conformance operations. */
export interface Services {
  readonly runtime: RuntimeService
  readonly store: RunStoreService
  readonly claims?: RunClaimsService
}

/** @experimental Driver-specific activation or worker claim needed before a fenced mutation. */
export type ClaimExecution = (
  services: Services,
  input: { readonly runId: string; readonly workerId: string },
) => Effect.Effect<ExecutionClaim>

/** @experimental Runtime control and durable-event conformance capability. */
export interface RuntimeCapability {
  readonly claim: ClaimExecution
}

/** @experimental RunTree finite replay conformance capability. */
export interface RunTreeCapability {
  readonly claim: ClaimExecution
}

/** @experimental SQL transaction conformance capability. */
export interface SqlTransactionCapability {
  readonly claim: ClaimExecution
  readonly forceRollback: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
}

/** @experimental Durable notification recovery conformance capability. */
export interface NotificationRecoveryCapability {
  readonly claim: ClaimExecution
}

/** @experimental Multi-worker claim and fencing conformance capability. */
export interface MultiWorkerClaimCapability<E = never> {
  readonly layer: Layer.Layer<Runtime | RunStore | RunClaims, E, never>
  readonly expire: (claim: WorkerClaim) => Effect.Effect<void>
}

/** @experimental Independently selectable Runtime driver conformance capabilities. */
export interface Capabilities<ClaimsLayerError = never> {
  readonly admission?: true
  readonly runtime?: RuntimeCapability
  readonly runTree?: RunTreeCapability
  readonly sqlTransactions?: SqlTransactionCapability
  readonly multiWorkerClaims?: MultiWorkerClaimCapability<ClaimsLayerError>
  readonly notificationRecovery?: NotificationRecoveryCapability
}

/** @experimental Configuration for the authoritative Runtime driver conformance suites. */
export interface Options<LayerError = never, ClaimsLayerError = never> {
  readonly name: string
  readonly address: Address
  readonly layer: Layer.Layer<Runtime | RunStore, LayerError, never>
  readonly capabilities: Capabilities<ClaimsLayerError>
  readonly setup?: Effect.Effect<void>
  readonly skip?: boolean
}
