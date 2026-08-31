import { Context, Effect, Layer } from "effect"
import type { ExecutionClaim } from "../run/store.js"
import { make } from "./run-executor-internal.js"

export interface Service {
  readonly execute: (claim: ExecutionClaim) => Effect.Effect<void>
  readonly interrupt: (runId: string) => Effect.Effect<void>
}

export class RunExecutor extends Context.Service<RunExecutor, Service>()(
  "generalist/runtime/execution/run-executor/RunExecutor",
) {}

export const layer = Layer.effect(RunExecutor, make)
