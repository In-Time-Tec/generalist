import { Context, Duration, Effect } from "effect"
import type { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import type { DecodedRun } from "../codec/rows.js"
import type { StaleClaim } from "../errors.js"

export interface ClaimedRun {
  readonly run: DecodedRun
  readonly workerId: string
  readonly attemptFence: number
  readonly leaseExpiresAt: Date
}

export interface Interface {
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

export class RunClaims extends Context.Service<RunClaims, Interface>()("tenetkit/runtime/sql/run/claims/RunClaims") {}
