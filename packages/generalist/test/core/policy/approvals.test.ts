import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Terminal } from "effect"
import { Response } from "effect/unstable/ai"
import { Approvals } from "../../../src/index.js"

const pending = (level: "allow" | "ask" | "deny" = "ask"): Approvals.Pending => ({
  _tag: "Pending",
  token: "approval:test",
  level,
  reason: "test reason",
  call: Response.toolCallPart({
    id: "call-1",
    name: "write_file",
    params: { path: "README.md" },
    providerExecuted: false,
  }),
  agentName: "test-agent",
  turn: 0,
})

const provide = <A, E>(
  layer: Layer.Layer<Approvals.Approvals, E>,
  effect: Effect.Effect<A, never, Approvals.Approvals>,
) => Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

describe("Approvals adapters", () => {
  it.effect("asks through Effect Terminal and approves yes", () => {
    const displayed: Array<string> = []
    const terminal = Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.die("readInput is not used"),
      readLine: Effect.succeed("yes"),
      display: (text) => Effect.sync(() => displayed.push(text)),
    })
    const layer = Approvals.layerConsole().pipe(Layer.provide(Layer.succeed(Terminal.Terminal, terminal)))

    return provide(
      layer,
      Effect.gen(function* () {
        const approvals = yield* Approvals.Approvals
        expect(yield* approvals.resolve(pending())).toEqual({ _tag: "Approved" })
        expect(displayed).toHaveLength(1)
        expect(displayed[0]).toContain("write_file")
        expect(displayed[0]).toContain('"path":"README.md"')
      }),
    )
  })

  it.effect("denies terminal input other than yes", () => {
    const terminal = Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.die("readInput is not used"),
      readLine: Effect.succeed("no"),
      display: () => Effect.void,
    })
    const layer = Approvals.layerConsole().pipe(Layer.provide(Layer.succeed(Terminal.Terminal, terminal)))

    return provide(
      layer,
      Effect.gen(function* () {
        const approvals = yield* Approvals.Approvals
        expect(yield* approvals.resolve(pending())).toEqual({
          _tag: "Denied",
          reason: "Approval denied at the terminal",
        })
      }),
    )
  })

  it.effect("auto-approves below the tier and delegates at the tier", () => {
    let delegated = 0
    const ask = Approvals.layerTest({
      resolve: () =>
        Effect.sync(() => {
          delegated += 1
          return Approvals.Denied({ reason: "delegated" })
        }),
    })
    const layer = Approvals.layerTiered({ askAbove: "ask", ask })

    return provide(
      layer,
      Effect.gen(function* () {
        const approvals = yield* Approvals.Approvals
        expect(yield* approvals.resolve(pending("allow"))).toEqual({ _tag: "Approved" })
        expect(delegated).toBe(0)
        expect(yield* approvals.resolve(pending("ask"))).toEqual({ _tag: "Denied", reason: "delegated" })
        expect(delegated).toBe(1)
      }),
    )
  })
})
