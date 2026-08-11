import type { ExecutableManifest, ExecutableRef } from "../executable-manifest.js"
import type { Message } from "../message.js"
import type { RunStatus } from "../run.js"
import type { OperationKind, OperationStatus, ReplayPolicy } from "./operations.js"

export interface RunRow {
  readonly run_id: string
  readonly status: RunStatus
  readonly address: string
  readonly session_id: string
  readonly message_id: string
  readonly message_json: string
  readonly message_digest: string
  readonly idempotency_key: string
  readonly executable_ref_json: string
  readonly executable_manifest_json: string
  readonly root_run_id: string
  readonly parent_run_id: string | null
  readonly invocation_id: string | null
  readonly active_wait_id: string | null
  readonly attempt: number
  readonly attempt_fence: number
  readonly last_sequence: number
  readonly cancellation_requested: number | boolean
  readonly cancel_reason: string | null
  readonly terminal_event_id: string | null
  readonly accepted_sequence: number
  readonly responded_wait_ids_json: string
  readonly driver_checkpoint_json: string | null
  readonly suspension_json: string | null
  readonly continuation_json: string | null
  readonly pending_outcome_json: string | null
  readonly owner_worker_id?: string | null
  readonly lease_expires_at?: string | Date | null
  readonly created_at: string | Date
  readonly updated_at: string | Date
}

export interface EventRow {
  readonly run_id: string
  readonly sequence: number
  readonly event_id: string
  readonly event_json: string
}

export interface OperationRow {
  readonly run_id: string
  readonly operation_id: string
  readonly operation_key: string
  readonly kind: OperationKind
  readonly status: OperationStatus
  readonly input_digest: string
  readonly input_json: string
  readonly result_json: string | null
  readonly error_json: string | null
  readonly replay_policy: ReplayPolicy
  readonly attempt: number
  readonly started_at: string | null
  readonly finished_at: string | null
  readonly resolution_idempotency_key: string | null
  readonly resolution_json: string | null
}

export interface LaneRow {
  readonly address: string
  readonly session_id: string
  readonly accepted_sequence: number
  readonly queue_json: string
}

export interface WaitRow {
  readonly wait_id: string
  readonly reason: string
  readonly status: "open" | "responded" | "signaled" | "cancelled"
  readonly response_json: string | null
  readonly opened_at: string | Date
  readonly closed_at: string | Date | null
}

export interface DecodedRun {
  readonly runId: string
  readonly status: RunStatus
  readonly address: string
  readonly sessionId: string
  readonly message: Message
  readonly messageDigest: string
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly activeWaitId?: string
  readonly attempt: number
  readonly attemptFence: number
  readonly lastSequence: number
  readonly cancellationRequested: boolean
  readonly cancelReason?: string
  readonly terminalEventId?: string
  readonly acceptedSequence: number
  readonly respondedWaitIds: ReadonlySet<string>
  readonly ownerWorkerId?: string
  readonly admittedAt: string
  readonly leaseExpiresAt?: string
  readonly attemptFenceEpoch?: number
  readonly driverCheckpoint?: import("../execution-state.js").ExecutionCheckpoint
  readonly suspension?: import("../execution-state.js").ExecutionSuspension
  readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
  readonly continuation?: import("../steering.js").ExecutionContinuation
  readonly pendingOutcome?: import("../run-store.js").PendingRunOutcome
}
