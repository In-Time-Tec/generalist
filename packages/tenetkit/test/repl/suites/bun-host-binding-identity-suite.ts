import { expect, layer } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { ToolContext } from "tenetkit"
import { HostBindingRegistry } from "../../../src/repl/index.js"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

const Out = Schema.Struct({ session: Schema.String })
const Input = Schema.Struct({})
const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })

const ambientContext = ToolContext.ToolContext.of({
  signal: new AbortController().signal,
  emit: () => Effect.void,
  sessionId: "ambient",
  runId: "r",
  toolCallId: "t",
})

const whoami: HostBindingRegistry.AnyOperation = {
  name: "whoami",
  input: Input,
  output: Out,
  failure: Fail,
  handle: () =>
    Effect.map(Effect.serviceOption(ToolContext.ToolContext), (context) => ({
      session: Option.getOrElse(context, () => ambientContext).sessionId,
    })),
}

const probeModule = {
  name: "probe",
  operations: [whoami],
} satisfies HostBindingRegistry.Module

layer(platform, liveOptions)("Bun kernel host bindings", (it) => {
  /**
   * A pool serves every Session from one mounted surface, so the identity a handler answers with is
   * the one every binding derives its authority from. This drives the whole path a cell takes — cell
   * source, frame, host request, handler, reply — and asserts the handler saw the Session the cell
   * belongs to rather than whichever Session happened to mount the surface.
   */
  it.effect("answers a cell's host request with that cell's own Session identity", () =>
    withPool({
      overrides: { modules: [probeModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const first = yield* runCell({
            pool,
            sessionId: "session-a",
            cellId: "c1",
            code: `(await probe.whoami({})).session`,
          }).pipe(Effect.provideService(ToolContext.ToolContext, ambientContext))
          expect(first.value).toBe("session-a")
          const second = yield* runCell({
            pool,
            sessionId: "session-b",
            cellId: "c1",
            code: `(await probe.whoami({})).session`,
          }).pipe(Effect.provideService(ToolContext.ToolContext, ambientContext))
          expect(second.value).toBe("session-b")
        }),
    }),
  )
})
