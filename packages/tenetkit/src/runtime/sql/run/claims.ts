import { Context, Duration, Effect, Stream } from "effect"
import type { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import type { DecodedRun } from "../codec/rows.js"
import type { StaleClaim } from "../errors.js"

export interface ClaimedRun {
  readonly run: DecodedRun
  readonly workerId: string
  readonly attemptFence: number
  readonly leaseExpiresAt: Date
}

export interface Service {
  /**
   * Lossy hints that durable claim state may have changed. Every subscription first emits after
   * its change source is ready, so consumers can close the subscribe-before-catch-up race.
   */
  readonly changes: Stream.Stream<void, RuntimeUnavailable>
  readonly claimReadyRuns: (input: {
    readonly workerId: string
    readonly limit: number
    readonly lease?: Duration.Input
  }) => Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable>
  readonly refreshLease: (input: {
    readonly runId: string
    readonly workerId: string
    readonly attemptFence: number
    readonly cancellationRequested: boolean
    readonly lease?: Duration.Input
  }) => Effect.Effect<boolean, RuntimeUnavailable>
  readonly releaseClaim: (input: {
    readonly runId: string
    readonly workerId: string
    readonly attemptFence: number
  }) => Effect.Effect<void, RuntimeUnavailable>
  readonly commitWithClaim: (input: {
    readonly runId: string
    readonly workerId: string
    readonly attemptFence: number
    readonly transition: "complete" | "fail" | "cancel"
    readonly result?: unknown
    readonly error?: { readonly message: string }
    readonly reason?: string
  }) => Effect.Effect<void, RunNotFound | RunTerminal | StaleClaim | RuntimeUnavailable>
}

export class RunClaims extends Context.Service<RunClaims, Service>()("tenetkit/runtime/sql/run/claims/RunClaims") {}
