/* oxlint-disable effecttsgo/strict-effect-provide -- each test is a test-host Layer composition root. */
import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { Model, Tool, Toolkit } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "generalist"
import {
  layerClient as bedrockClient,
  layerModel as bedrockModel,
} from "../../../src/ai/provider/amazon-bedrock/service.js"
import { layerConfig as anthropicClient, layerModel as anthropicModel } from "../../../src/ai/provider/anthropic.js"
import { layerModel as deterministicModel } from "../../../src/ai/provider/deterministic.js"
import { layerConfig as openAiClient, layerModel as openAiModel } from "../../../src/ai/provider/openai.js"
import {
  layerConfig as chatCompletionsClient,
  layerModel as chatCompletionsModel,
} from "../../../src/ai/provider/openai-chat-completions.js"
import {
  layerConfig as responsesClient,
  layerModel as responsesModel,
} from "../../../src/ai/provider/openai-responses.js"
import { layerConfig as openRouterClient, layerModel as openRouterModel } from "../../../src/ai/provider/openrouter.js"
import { allowAllAuthorization } from "../../authorization.js"

const apiKey = Config.succeed(Redacted.make("test-key"))

// Compile-time channel check: every provider's model layer closes over its own
// client layer, leaving no requirements. Never run — the values prove the wiring.
const _closed = Layer.mergeAll(
  allowAllAuthorization,
  openAiModel({ model: "gpt-5.6-sol" }).pipe(Layer.provide(openAiClient({ apiKey }))),
  responsesModel({ model: "gpt-5.6-sol" }).pipe(Layer.provide(responsesClient({ apiKey }))),
  chatCompletionsModel({ model: "any" }).pipe(Layer.provide(chatCompletionsClient({ apiKey }))),
  anthropicModel({ model: "claude-opus-4-8" }).pipe(Layer.provide(anthropicClient({ apiKey }))),
  openRouterModel({ model: "openai/gpt-5.6-sol" }).pipe(Layer.provide(openRouterClient({ apiKey }))),
  bedrockModel({ model: "us.anthropic.claude-opus-4-8" }).pipe(Layer.provide(bedrockClient())),
  deterministicModel(),
).pipe(Layer.provide(FetchHttpClient.layer))
void _closed

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})
const toolkit = Toolkit.make(echoTool)

const agent = Agent.make({ name: "assistant", instructions: "Be brief.", toolkit })

const testLayers = Layer.mergeAll(
  allowAllAuthorization,
  toolkit.toLayer({ echo: ({ text }) => Effect.succeed(text) }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

describe("layerModel", () => {
  it.effect("provides the model directly to a run — no registry, no selection strings", () =>
    Effect.gen(function* () {
      const result = yield* Agent.run(agent, "Say hello.").pipe(Effect.provide(deterministicModel()))
      expect(result).toBe("deterministic response")
    }).pipe(Effect.provide(testLayers)),
  )

  it.effect("decodes typed output and rejects malformed deterministic output", () => {
    const input = Schema.Struct({ question: Schema.String })
    const output = Schema.Struct({ answer: Schema.Number })
    const typedAgent = Agent.make({ name: "typed", input, output })
    const textAgent = Agent.make({ name: "text" })
    const validModel = deterministicModel({ response: '{"output":{"answer":42}}' })
    const malformedModel = deterministicModel({ response: '{"output":{"answer":"forty-two"}}' })

    return Effect.gen(function* () {
      expect(yield* Agent.run(typedAgent, { question: "answer" }).pipe(Effect.provide(validModel))).toEqual({
        answer: 42,
      })

      const failure = yield* Agent.run(typedAgent, { question: "answer" }).pipe(
        Effect.provide(malformedModel),
        Effect.flip,
      )
      expect(Schema.is(AgentEvent.InvalidOutput)(failure)).toBe(true)

      expect(yield* Agent.run(textAgent, "answer").pipe(Effect.provide(deterministicModel()))).toBe(
        "deterministic response",
      )

      const events = yield* Agent.stream(typedAgent, { question: "answer" }).pipe(
        Stream.provide(validModel),
        Stream.runCollect,
      )
      const completed = events.at(-1)
      expect(completed?._tag).toBe("Completed")
      if (completed?._tag === "Completed") expect(completed.output).toEqual({ answer: 42 })
    }).pipe(Effect.provide(testLayers))
  })

  it.effect("carries provider and model name tags for telemetry", () =>
    Effect.gen(function* () {
      const provider = yield* Model.ProviderName
      const model = yield* Model.ModelName
      expect(provider).toBe("deterministic")
      expect(model).toBe("test-model")
    }).pipe(Effect.provide(deterministicModel({ model: "test-model" }))),
  )

  it.effect("two model layers scope independently — supervisor Sol, utility Luna", () =>
    Effect.gen(function* () {
      const sol = yield* Agent.run(agent, "Sol run.").pipe(
        Effect.provide(deterministicModel({ provider: "test", model: "sol" })),
      )
      const luna = yield* Agent.run(agent, "Luna run.").pipe(
        Effect.provide(deterministicModel({ provider: "test", model: "luna" })),
      )
      expect([sol, luna]).toEqual(["deterministic response", "deterministic response"])
    }).pipe(Effect.provide(testLayers)),
  )

  it.effect("an inner provide overrides the outer model — closest scope wins", () =>
    Effect.gen(function* () {
      const modelName = Model.ModelName
      const inner = yield* modelName.pipe(Effect.provide(deterministicModel({ model: "inner" })))
      const outer = yield* modelName
      expect([inner, outer]).toEqual(["inner", "outer"])
    }).pipe(Effect.provide(deterministicModel({ model: "outer" }))),
  )
})
