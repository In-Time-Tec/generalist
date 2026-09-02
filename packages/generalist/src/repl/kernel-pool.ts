import { Context, Effect, Scope, Stream } from "effect"
import type { CellEvent, CellFailure, CellId, CellResult, Epoch, RestartReason, SessionId } from "./cell.js"
import type { CheckpointKind, KernelProfile } from "./kernel-profile.js"

/** One cell submitted to the kernel owning a Session. */
export interface ExecuteRequest {
  readonly sessionId: SessionId
  readonly cellId: CellId
  readonly code: string
}

/** A cell's streamed lifecycle plus its terminal outcome. */
export interface Execution {
  readonly events: Stream.Stream<CellEvent, CellFailure>
  readonly result: Effect.Effect<CellResult, CellFailure>
}

/** A read-only namespace question that never evaluates model-authored source. */
export interface InspectRequest {
  readonly sessionId: SessionId
  readonly name?: string
}

/** One live binding in the kernel namespace. */
export interface Binding {
  readonly name: string
  readonly type: string
  readonly snapshotable: boolean
}

/** Current kernel namespace and epoch. */
export interface Inspection {
  readonly sessionId: SessionId
  readonly epoch: Epoch
  readonly profile: KernelProfile
  /** What actually continued when this epoch was most recently recovered. */
  readonly recovery: CheckpointKind
  readonly bindings: ReadonlyArray<Binding>
}

/** Result of asking a running cell to stop. */
export interface Interruption {
  readonly sessionId: SessionId
  readonly cellId: CellId
  readonly _tag: "Interrupted" | "NotRunning" | "Unresponsive"
}

/** Result of starting a new kernel epoch for a Session. */
export interface Restart {
  readonly sessionId: SessionId
  readonly epoch: Epoch
  readonly reason: RestartReason
  /** The checkpoint used for the replacement epoch, never a generic persistence claim. */
  readonly recovery: CheckpointKind
  readonly restoredNames: ReadonlyArray<string>
  readonly droppedNames: ReadonlyArray<string>
}

/**
 * The kernel lifecycle port. One live kernel per Session identity, exclusive per
 * Session and authored-order; the pool owns process lifetime, generation, and lease.
 */
export interface Service {
  readonly execute: (request: ExecuteRequest) => Effect.Effect<Execution, CellFailure, Scope.Scope>
  readonly inspect: (request: InspectRequest) => Effect.Effect<Inspection, CellFailure>
  readonly interrupt: (sessionId: SessionId, cellId: CellId) => Effect.Effect<Interruption, CellFailure>
  readonly restart: (sessionId: SessionId, reason: RestartReason) => Effect.Effect<Restart, CellFailure>
  readonly close: (sessionId: SessionId) => Effect.Effect<void, CellFailure>
}
export class KernelPool extends Context.Service<KernelPool, Service>()("generalist/repl/kernel-pool/KernelPool") {}
