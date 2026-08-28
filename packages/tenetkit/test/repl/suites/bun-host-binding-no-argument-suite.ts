import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HostBindingRegistry } from "../../../src/repl/index.js"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

const Out = Schema.Struct({ answered: Schema.Boolean })
const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })
const Input = Schema.Struct({})

const seen: Array<Record<string, never>> = []

const ping: HostBindingRegistry.AnyOperation = {
  name: "ping",
  input: Input,
  output: Out,
  failure: Fail,
  handle: (input) =>
    Schema.decodeUnknownEffect(Input)(input).pipe(
      Effect.tap((decoded) => Effect.sync(() => seen.push(decoded))),
      Effect.as({ answered: true }),
    ),
}

layer(platform, liveOptions)("Bun kernel host bindings", (it) => {
  /**
   * A binding called with no argument sends a request with nothing where its input would be, because
   * JSON carries no `undefined`. The host has to accept that and answer, or the cell waits forever
   * for a reply to a request that never decoded.
   */
  it.effect("answers a binding called with no argument", () =>
    withPool({
      overrides: { modules: [{ name: "probe", operations: [ping] }] },
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
