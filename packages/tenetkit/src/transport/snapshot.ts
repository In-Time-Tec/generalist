import { Effect } from "effect"
import { Runtime, type InspectError, type Interface as RuntimeInterface } from "../runtime/service.js"

/** @experimental */
export type RunSnapshot =
  ReturnType<RuntimeInterface["snapshot"]> extends Effect.Effect<infer A, unknown, unknown> ? A : never

/** @experimental Reads a snapshot without inventing a RunEvent or sequence. */
export const get = (runId: string): Effect.Effect<RunSnapshot, InspectError, Runtime> =>
  Runtime.use((runtime) => runtime.snapshot(runId))
