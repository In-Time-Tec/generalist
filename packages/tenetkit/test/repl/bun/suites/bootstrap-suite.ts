import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { ToolContext } from "tenetkit"
import { liveOptions, platform, runCell, withPool } from "../../bun-harness.js"

const Out = Schema.Struct({ ok: Schema.Boolean })
const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })

const ping = {
  name: "ping",
  input: Schema.Struct({}),
  output: Out,
  failure: Fail,
  handle: () => Effect.succeed({ ok: true }),
}

const ambient = ToolContext.ToolContext.of({
  signal: new AbortController().signal,
  emit: () => Effect.void,
  sessionId: "ambient",
  runId: "r",
  toolCallId: "t",
})

layer(platform, liveOptions)("Bun kernel bootstrap", (it) => {
  /**
   * A host mounts its modules as flat globals, so a host whose cells are written against one
   * namespace has to assemble that namespace itself. The pool evaluates the host's source on every
   * worker start, and this asserts a later cell sees what that source defined rather than only the
   * flat names the registry mounted.
   */
  it.effect("evaluates the host's bootstrap before the first cell", () =>
    withPool({
      overrides: {
        modules: [{ name: "probe", operations: [ping] }],
        bootstrap: `globalThis.host = { probe: globalThis.probe }`,
      },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: `(await host.probe.ping({})).ok`,
          })
          expect(result.value).toBe("true")
        }).pipe(Effect.provideService(ToolContext.ToolContext, ambient)),
    }),
  )
})
