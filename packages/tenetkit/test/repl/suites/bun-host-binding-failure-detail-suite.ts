import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })

const strict = {
  name: "strict",
  input: Schema.Struct({ needed: Schema.String }),
  output: Schema.Struct({ ok: Schema.Boolean }),
  failure: Fail,
  handle: () => Effect.succeed({ ok: true }),
}

layer(platform, liveOptions)("Bun kernel host binding failures", (it) => {
  /**
   * A rejected request is all a cell learns about a call it got wrong, and naming only the operation
   * left a model to guess which field was at fault. The reason the boundary already produced has to
   * survive the trip back.
   */
  it.effect("tells a cell why its request was refused, not only which operation refused it", () =>
    withPool({
      overrides: { modules: [{ name: "probe", operations: [strict] }] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const settled = yield* runCell({
            pool,
            sessionId: "session-a",
            cellId: "c1",
            code: `await probe.strict({ wrong: 1 }).then(() => "no failure", (error) => String(error))`,
          })
          expect(settled.value).toContain("probe.strict")
          expect(settled.value).toContain("needed")
        }),
    }),
  )
})
