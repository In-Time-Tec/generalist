import type { Effect, Layer } from "effect"
import type { Address } from "../../runtime/address.js"
import type {
  ExecutionClaim,
  RunStore,
  Service as RunStoreService,
} from "../../runtime/run/store.js"
import type { Runtime, Service as RuntimeService } from "../../runtime/service.js"
import type { Service as RunExecutorService } from "../../runtime/execution/run-executor.js"
import type { ScheduleDefinition } from "../../runtime/execution/trigger/schedule.js"


/** Runtime services passed to driver-specific conformance operations. */
export interface Services {
  readonly runtime: RuntimeService
  readonly store: RunStoreService
  readonly executor?: RunExecutorService
}

/** Claim through the fixture's activated host using a stable logical action identity, not a fabricated worker. */
export type ClaimExecution = (
  services: Services,
  input: { readonly runId: string; readonly commandId: string },
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

/** Journal-prefix fork and retained rewind branch capability. */
export interface ForkRewindCapability {
  readonly claim: ClaimExecution
}

/** Shared Artifact head, operation-log, subscription, and branch capability. */
export type ArtifactsCapability = true

/** Inbox persistence and exactly-once delivery capability. */
export interface SteeringCapability {
  readonly claim: ClaimExecution
}

/** Atomic journal publication conformance capability. */
export interface AtomicCommitCapability {
  readonly claim: ClaimExecution
  readonly failNextCommit: (services: Services) => Effect.Effect<void>
  readonly pauseNextCommit: (services: Services) => Effect.Effect<{
    readonly entered: Effect.Effect<void>
    readonly release: Effect.Effect<void>
  }>
}

/** Durable notification recovery conformance capability. */
export interface NotificationRecoveryCapability {
  readonly claim: ClaimExecution
}

/** Durable approval suspension and recovery capability. */
export interface ApprovalSuspendCapability {
  readonly claim: ClaimExecution
}

/** Durable environmental wait conformance, including reopen where the driver persists. */
export interface AwaitEventCapability {
  readonly claim: ClaimExecution
}

/** Durable recurring admission and per-occurrence claim conformance. */
export interface SchedulesCapability {
  readonly definition: ScheduleDefinition
}

/** Durable Agent fan-out recovery and journal-budget conformance capability. */
export interface ChildRunsCapability {
  readonly claim: ClaimExecution
}

/** Read-only recovery projection conformance capability. */
export type OperatorExplainCapability = true

/** Safe-operation operator retry conformance capability. */
export interface OperatorRetryCapability {
  readonly claim: ClaimExecution
}

/** Unknown-outcome operator resolution conformance capability. */
export interface OperatorResolveUnknownCapability {
  readonly claim: ClaimExecution
}

/** Store-wide operator obligation scan conformance capability. */
export interface OperatorScanCapability {
  readonly claim: ClaimExecution
}

/** Multi-worker claim and fencing conformance capability. */
export interface MultiWorkerClaimCapability<E = never> {
  readonly layer: Layer.Layer<Runtime | RunStore, E, never>
  readonly claim: ClaimExecution
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
  readonly "fork-rewind"?: ForkRewindCapability
  readonly artifacts?: ArtifactsCapability
  readonly steering?: SteeringCapability
  readonly atomicCommits?: AtomicCommitCapability
  readonly multiWorkerClaims?: MultiWorkerClaimCapability<ClaimsLayerError>
  readonly notificationRecovery?: NotificationRecoveryCapability
  readonly "approval-suspend"?: ApprovalSuspendCapability
  readonly "await-event"?: AwaitEventCapability
  readonly schedules?: SchedulesCapability
  readonly "child-runs"?: ChildRunsCapability
  readonly "operator-explain"?: OperatorExplainCapability
  readonly "operator-retry"?: OperatorRetryCapability
  readonly "operator-resolve-unknown"?: OperatorResolveUnknownCapability
  readonly "operator-scan"?: OperatorScanCapability
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
