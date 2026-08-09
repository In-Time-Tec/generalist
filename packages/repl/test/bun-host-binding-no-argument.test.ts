import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HostBindingRegistry } from "../src/index.js"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

const Out = Schema.Struct({ answered: Schema.Boolean })
const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })

const seen: Array<unknown> = []

const ping = {
  name: "ping",
  input: Schema.Struct({}),
  output: Out,
  failure: Fail,
  handle: (input: unknown) => {
    seen.push(input)
    return Effect.succeed({ answered: true })
  },
}

layer(platform, liveOptions)("Bun kernel host bindings", (it) => {
  /**
   * A binding called with no argument sends a request with nothing where its input would be, because
   * JSON carries no `undefined`. The host has to accept that and answer, or the cell waits forever
   * for a reply to a request that never decoded.
   */
  it.effect("answers a binding called with no argument", () =>
    withPool({
      overrides: { modules: [{ name: "probe", operations: [ping] } as unknown as HostBindingRegistry.Module] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const settled = yield* runCell({
            pool,
            sessionId: "session-a",
            cellId: "c1",
            code: `(await probe.ping()).answered`,
          })
          expect(settled.value).toBe("true")
          // An empty struct accepts any non-null value, so answering is not by itself proof that the
          // call carried the object it stands for.
          expect(seen).toEqual([{}])
        }),
    }),
  )
})
