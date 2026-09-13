import { Effect, Layer } from "effect"
import { Approvals } from "./core/policy/approvals.js"
import type { Level } from "./core/policy/permissions.js"

export {
  Approvals,
  Approved,
  Denied,
  layerAutoApprove,
  layerConsole,
  layerDenyAll,
  layerTest,
  layerTiered,
  type Pending,
  type Resolution,
  type Service,
  type TieredOptions,
} from "./core/policy/approvals.js"
export { ApprovalTokenInvalid, resolve, type ResolveError, type ResolveOptions } from "./runtime/operation/approval.js"

/** One durable approval notification. */
export interface DurableRequest {
  readonly runId: string
  readonly tool: string
  readonly args: unknown
  readonly level: Level
  readonly reason: string
  readonly token: string
}

export interface DurableOptions<R> {
  readonly notify: (request: DurableRequest) => Effect.Effect<void, never, R>
}

/** Park approval requests in the Runtime and notify one external operator boundary. */
export const layerDurable = <R>(options: DurableOptions<R>): Layer.Layer<Approvals, never, R> =>
  Layer.effect(
    Approvals,
    Effect.gen(function* () {
      const context = yield* Effect.context<R>()
      return Approvals.of({
        resolve: (pending) => {
          if (pending.runId === undefined) {
            return Effect.succeed({
              _tag: "Denied",
              reason: "Durable approvals require a hosted Runtime Run",
            })
          }
          return options
            .notify({
              runId: pending.runId,
              tool: pending.call.name,
              args: pending.call.params,
              level: pending.level,
              reason: pending.reason,
              token: pending.token,
            })
            .pipe(Effect.provide(context), Effect.as(pending))
        },
      })
    }),
  )
