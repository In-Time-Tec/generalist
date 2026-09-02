import { Context, Effect, Layer, Terminal } from "effect"
import type { Level, Rule } from "./permissions.js"
import type { AccessRequest } from "../tools/tool-authorization.js"

export interface Approved {
  readonly _tag: "Approved"
  readonly remember?: Rule
}
export interface Denied {
  readonly _tag: "Denied"
  readonly reason?: string
}
/** An unresolved authorization request. */
export interface Pending extends AccessRequest {
  readonly _tag: "Pending"
  readonly token: string
  readonly level: Level
  readonly reason: string
}
export type Resolution = Approved | Denied | Pending
export interface Service {
  readonly resolve: (pending: Pending) => Effect.Effect<Resolution>
}
/** Enforcement point for policy asks and `Ai.Tool.needsApproval`. */
export class Approvals extends Context.Service<Approvals, Service>()("generalist/core/policy/approvals") {}

/** Construct an approval, optionally remembering one permission rule. */
export const Approved = (options: Omit<Approved, "_tag"> = {}): Approved => ({ _tag: "Approved", ...options })

/** Construct a denial with an optional operator-facing reason. */
export const Denied = (options: Omit<Denied, "_tag"> = {}): Denied => ({ _tag: "Denied", ...options })

/** Default: every request resolves Approved. */
export const layerAutoApprove: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ resolve: () => Effect.succeed({ _tag: "Approved" }) }),
)
/** Every request resolves Denied. */
export const layerDenyAll: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ resolve: () => Effect.succeed({ _tag: "Denied" }) }),
)
export const layerTest = (implementation: Service): Layer.Layer<Approvals> =>
  Layer.succeed(Approvals, Approvals.of(implementation))

const describe = (pending: Pending): string =>
  [
    `Approve ${pending.call.name}?`,
    `Level: ${pending.level}`,
    `Reason: ${pending.reason}`,
    `Arguments: ${JSON.stringify(pending.call.params)}`,
    "Approve? [y/N] ",
  ].join("\n")

/** Ask for each approval through Effect's Terminal service. */
// oxlint-disable-next-line effecttsgo/lazy-effect -- The public adapter contract is layerConsole().
export const layerConsole = (): Layer.Layer<Approvals, never, Terminal.Terminal> =>
  Layer.effect(
    Approvals,
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      return Approvals.of({
        resolve: (pending) =>
          terminal.display(describe(pending)).pipe(
            Effect.andThen(terminal.readLine),
            Effect.map((answer) =>
              ["y", "yes"].includes(answer.trim().toLowerCase())
                ? Approved()
                : Denied({ reason: "Approval denied at the terminal" }),
            ),
            Effect.orElseSucceed(() => Denied({ reason: "Approval prompt was unavailable" })),
          ),
      })
    }),
  )

const levelRank = { allow: 0, ask: 1, deny: 2 } as const satisfies Record<Level, number>

export interface TieredOptions<R, E> {
  readonly askAbove: Level
  readonly ask: Layer.Layer<Approvals, E, R>
}

/** Delegate approvals at or above one Permissions level and approve lower levels. */
export const layerTiered = <R, E>(options: TieredOptions<R, E>): Layer.Layer<Approvals, E, R> =>
  Layer.effect(
    Approvals,
    Layer.build(options.ask).pipe(
      Effect.map((context) => {
        const ask = Context.get(context, Approvals)
        return Approvals.of({
          resolve: (pending) =>
            levelRank[pending.level] >= levelRank[options.askAbove] ? ask.resolve(pending) : Effect.succeed(Approved()),
        })
      }),
    ),
  )
