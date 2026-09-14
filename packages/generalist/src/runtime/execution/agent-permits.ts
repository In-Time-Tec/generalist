import { Effect, Function, Semaphore } from "effect"
import type { Service as RuntimeService } from "../service.js"

export interface Controller {
  readonly acquire: (runId: string) => Effect.Effect<void>
  readonly park: (runId: string) => Effect.Effect<void>
  readonly resume: (runId: string) => Effect.Effect<void>
  readonly release: (runId: string) => Effect.Effect<void>
}

const bindings = new WeakMap<RuntimeService, Controller>()

export const make = (limit: number | undefined): Controller => {
  if (limit === undefined) {
    return {
      acquire: () => Effect.void,
      park: () => Effect.void,
      resume: () => Effect.void,
      release: () => Effect.void,
    }
  }
  const permits = Semaphore.makeUnsafe(limit)
  const active = new Set<string>()
  const parked = new Set<string>()
  return {
    acquire: (runId) =>
      Effect.suspend(() => {
        if (active.has(runId) || parked.has(runId)) return Effect.void
        return Effect.uninterruptibleMask((restore) =>
          restore(permits.take(1)).pipe(Effect.andThen(Effect.sync(() => void active.add(runId)))),
        )
      }),
    park: (runId) =>
      Effect.suspend(() => {
        if (parked.has(runId)) return Effect.void
        if (!active.delete(runId)) return Effect.void
        parked.add(runId)
        return permits.release(1).pipe(Effect.asVoid)
      }),
    resume: (runId) =>
      Effect.suspend(() => {
        if (active.has(runId) || !parked.has(runId)) return Effect.void
        return Effect.uninterruptibleMask((restore) =>
          restore(permits.take(1)).pipe(
            Effect.flatMap(() =>
              Effect.sync(() => {
                if (!parked.delete(runId)) return false
                active.add(runId)
                return true
              }),
            ),
            Effect.flatMap((resumed) => (resumed ? Effect.void : permits.release(1).pipe(Effect.asVoid))),
          ),
        )
      }),
    release: (runId) =>
      Effect.suspend(() => {
        parked.delete(runId)
        return active.delete(runId) ? permits.release(1).pipe(Effect.asVoid) : Effect.void
      }),
  }
}

const bindRuntime = (runtime: RuntimeService, controller: Controller): void => {
  bindings.set(runtime, controller)
}
export const bind: {
  (runtime: RuntimeService, controller: Controller): void
  (controller: Controller): (runtime: RuntimeService) => void
} = Function.dual(2, bindRuntime)

export const get = (runtime: RuntimeService): Controller | undefined => bindings.get(runtime)
