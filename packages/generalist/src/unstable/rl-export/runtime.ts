import { Effect } from "effect"
import { RuntimeUnavailable } from "../../runtime/errors.js"
import { get } from "../../runtime/reward/export.js"
import { Runtime } from "../../runtime/service.js"
import type { DagRuntime } from "./index.js"

/** Acquire journal reads and reward recording from the Runtime that owns them. @experimental */
export const runtime: Effect.Effect<DagRuntime, RuntimeUnavailable, Runtime> = Effect.flatMap(Runtime, (service) => {
  const capability = get(service)
  return capability === undefined
    ? Effect.fail(RuntimeUnavailable.make({ message: "Runtime has no journal export capability" }))
    : Effect.succeed(capability)
})
