import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { ToolContext } from "tenetkit"
import { HostBindingRegistry } from "../../src/repl/index"

const Out = Schema.Struct({ seen: Schema.String })
const Fail = Schema.TaggedStruct("Never", { reason: Schema.String })

const context = (sessionId: string) =>
  ToolContext.ToolContext.of({
    signal: new AbortController().signal,
    emit: () => Effect.void,
    sessionId,
    runId: "run",
    toolCallId: "call",
    operationKey: "operation",
  })

/**
 * One mounted surface serves every Session a pool holds, so a handler that read the context the
 * surface was built with would answer every Session with one Session's identity. Every binding
 * derives its authority from that identity, so this pins which one a handler observes.
 */
const whoami: HostBindingRegistry.AnyOperation<ToolContext.ToolContext> = {
  name: "whoami",
  input: Schema.Struct({}),
  output: Out,
  failure: Fail,
  handle: () => Effect.map(ToolContext.ToolContext, (c) => ({ seen: c.sessionId })),
}

it.effect("answers with the calling Session identity rather than the one the surface was built with", () =>
  Effect.gen(function* () {
    const registry = yield* HostBindingRegistry.make([{ name: "probe", operations: [whoami] }]).pipe(
      Effect.provideService(ToolContext.ToolContext, context("BUILD-TIME")),
    )
    const response = yield* registry
      .invoke({ module: "probe", operation: "whoami", input: {} })
      .pipe(Effect.provideService(ToolContext.ToolContext, context("PER-CALL")))
    expect(response).toEqual({ _tag: "Success", output: { seen: "PER-CALL" } })
  }),
)
