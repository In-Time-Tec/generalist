import { Effect } from "effect"
import { Runtime, type InspectError, type Service as RuntimeService } from "../../runtime/service.js"

/** @experimental */
export type RunSnapshot =
  ReturnType<RuntimeService["snapshot"]> extends Effect.Effect<infer A, unknown, unknown> ? A : never

/** @experimental Reads a snapshot without inventing a RunEvent or sequence. */
export const get = (runId: string): Effect.Effect<RunSnapshot, InspectError, Runtime> =>
  Runtime.use((runtime) => runtime.snapshot(runId))
