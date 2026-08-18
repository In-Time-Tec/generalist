import { Effect } from "effect"
import { Runtime } from "tenetkit/runtime"

/** @experimental */
export type RunSnapshot =
  ReturnType<Runtime.Interface["snapshot"]> extends Effect.Effect<infer A, unknown, unknown> ? A : never

/** @experimental Reads a snapshot without inventing a RunEvent or sequence. */
export const get = (runId: string): Effect.Effect<RunSnapshot, Runtime.InspectError, Runtime.Runtime> =>
  Runtime.Runtime.use((runtime) => runtime.snapshot(runId))
