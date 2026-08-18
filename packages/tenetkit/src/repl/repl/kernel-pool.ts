import { Context, Effect, Stream } from "effect"
import {
  type CellEvent,
  type CellFailure,
  type CellId,
  type CellResult,
  type Epoch,
  type RestartReason,
  type SessionId,
} from "./cell.js"
import type { KernelProfile } from "./kernel-profile.js"

/** @experimental One cell submitted to the kernel owning a Session. */
export interface ExecuteRequest {
  readonly sessionId: SessionId
  readonly cellId: CellId
  readonly code: string
  readonly signal: AbortSignal
}

/** @experimental A cell's streamed lifecycle plus its terminal outcome. */
export interface Execution {
  readonly events: Stream.Stream<CellEvent, CellFailure>
  readonly result: Effect.Effect<CellResult, CellFailure>
}

/** @experimental A read-only namespace question that never evaluates model-authored source. */
export interface InspectRequest {
  readonly sessionId: SessionId
  readonly name?: string
}

/** @experimental One live binding in the kernel namespace. */
export interface Binding {
  readonly name: string
  readonly type: string
  readonly snapshotable: boolean
}

/** @experimental Current kernel namespace and epoch. */
export interface Inspection {
  readonly sessionId: SessionId
  readonly epoch: Epoch
  readonly profile: KernelProfile
  readonly bindings: ReadonlyArray<Binding>
}

/** @experimental Result of asking a running cell to stop. */
export interface Interruption {
  readonly sessionId: SessionId
  readonly cellId: CellId
  readonly _tag: "Interrupted" | "NotRunning" | "Unresponsive"
}

/** @experimental Result of starting a new kernel epoch for a Session. */
export interface Restart {
  readonly sessionId: SessionId
  readonly epoch: Epoch
  readonly reason: RestartReason
  readonly restoredNames: ReadonlyArray<string>
  readonly droppedNames: ReadonlyArray<string>
}

/**
 * @experimental The kernel lifecycle port. One live kernel per Session identity, exclusive per
 * Session and authored-order; the pool owns process lifetime, generation, and lease.
 */
export interface Interface {
  readonly execute: (request: ExecuteRequest) => Effect.Effect<Execution, CellFailure>
  readonly inspect: (request: InspectRequest) => Effect.Effect<Inspection, CellFailure>
  readonly interrupt: (sessionId: SessionId, cellId: CellId) => Effect.Effect<Interruption, CellFailure>
  readonly restart: (sessionId: SessionId, reason: RestartReason) => Effect.Effect<Restart, CellFailure>
  readonly close: (sessionId: SessionId) => Effect.Effect<void, CellFailure>
}

/** @experimental */
export class KernelPool extends Context.Service<KernelPool, Interface>()("tenetkit/repl/repl/kernel-pool/KernelPool") {}
