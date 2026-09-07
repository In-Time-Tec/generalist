import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { ExecutableResolver, LocalScheduler, Runtime } from "../../../../src/runtime/index.js"
import { Agent } from "../../../../src/index.js"
import { objectRuntimeLayer } from "../../execution/object.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { assistant, assistantAddress, assistantRef, registrationsFor } from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { allowAllAuthorization } from "../../../authorization.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.fromIterable<Response.StreamPartEncoded>([
        Response.makePart("text-delta", { id: "answer", delta: "done" }),
        finish,
      ]),
  }),
)

const resolver = ExecutableResolver.layerStatic([
  { executable: assistantRef, agent: Agent.close(assistant, Layer.mergeAll(allowAllAuthorization, model)) },
]).pipe(Layer.orDie)

const options = {
  addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
  scheduler: { pollInterval: "1 day" as const },
}

it.effect("reclaims durable work after a missed wake across object-host reconstruction", () =>
  Effect.gen(function* () {
    const storage = yield* makeSimulator()
    const first = objectRuntimeLayer(options, storage, false).pipe(Layer.provide(resolver))
    const second = objectRuntimeLayer(options, storage).pipe(Layer.provide(resolver))
    const receipt = yield* provideScoped(
      first,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:worker-wakeup-recovery",
          idempotencyKey: "worker-wakeup-recovery",
          prompt: "recover durable work",
        })
      }),
    )
    yield* provideScoped(
      second,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* scheduler.tick
        yield* scheduler.idle
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }),
    )
  }),
)
