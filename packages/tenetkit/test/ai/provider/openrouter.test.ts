import "./suites/openrouter-stream-error-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Agent, ModelRegistry, ModelResilience } from "tenetkit"
import { decodeConfig, layer } from "../../../src/ai/provider/openrouter.js"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

describe("OpenRouter request configuration", () => {
  it("excludes transport-owned debug from the public configuration type", () => {
    type PublicConfig = NonNullable<Parameters<typeof layer>[0]["config"]>
    const excludesDebug: Assert<Equal<"debug" extends keyof PublicConfig ? true : false, false>> = true
    expect(excludesDebug).toBe(true)
  })

  it("accepts every reasoning effort and summary verbosity OpenRouter declares", () => {
    for (const effort of ["xhigh", "high", "medium", "low", "minimal", "none"] as const) {
      for (const summary of ["auto", "concise", "detailed"] as const) {
        expect(decodeConfig({ reasoning: { effort, summary } })).toEqual({ reasoning: { effort, summary } })
      }
    }
  })

  it("accepts common chat completion parameters", () => {
    expect(
      decodeConfig({
        reasoning: { effort: "high" },
        max_tokens: 16_384,
        temperature: 0.2,
        top_p: 1,
        stop: ["END"],
      }),
    ).toEqual({ reasoning: { effort: "high" }, max_tokens: 16_384, temperature: 0.2, top_p: 1, stop: ["END"] })
  })

  it("accepts exact routing, provider, plugin, and trace fields", () => {
    const config = {
      route: "sort" as const,
      provider: { allow_fallbacks: false, data_collection: "deny" as const, sort: "latency" as const },
      plugins: [{ id: "web" as const, engine: "exa" as const, max_results: 3 }],
      trace: { trace_id: "trace-1", span_name: "completion" },
    }
    expect(decodeConfig(config)).toEqual(config)
  })

  it("rejects unknown fields and invalid reasoning efforts", () => {
    expect(() => decodeConfig({ reasoning: { effort: "ultra" } })).toThrow()
    expect(() => decodeConfig({ route: { strategy: "fallback" } })).toThrow()
    expect(() => decodeConfig({ provider: { allow_fallbacks: "yes" } })).toThrow()
    expect(() => decodeConfig({ plugins: [{ id: "web", engine: "google" }] })).toThrow()
    expect(() => decodeConfig({ trace: { request_id: "secret" } })).toThrow()
  })

  it("rejects transport-owned request fields before transport", () => {
    let requests = 0
    type RejectedConfig = Parameters<typeof decodeConfig>[0]
    const request = (config: RejectedConfig) => {
      const decoded = decodeConfig(config)
      requests += 1
      return decoded
    }

    for (const config of [
      { debug: {} },
      { debug: { echo_upstream_body: true } },
      { model: "secret-model" },
      { messages: [] },
      { response_format: { type: "json_object" } },
      { stream: true },
      { stream_options: { include_usage: true } },
      { tool_choice: "auto" },
      { tools: [] },
    ]) {
      expect(() => request(config)).toThrow()
    }
    expect(requests).toBe(0)
  })

  it.effect("rejects a runtime debug bypass in the real provider layer before HttpClient", () => {
    let requests = 0
    const client = HttpClient.make(() => {
      requests += 1
      return Effect.die("invalid OpenRouter configuration reached transport")
    })
    const invalidConfig = { temperature: 0, debug: { echo_upstream_body: true } }
    const invalidLayer = layer({
      model: "router-test",
      apiKey: Config.succeed(Redacted.make("test-key")),
      config: invalidConfig,
    }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))

    return Effect.gen(function* () {
      const operation = ModelRegistry.withModel(
        { provider: "openrouter", model: "router-test" },
        LanguageModel.generateText({ prompt: "must not be sent" }),
      )
      const exit = yield* Effect.scoped(
        Effect.flatMap(Layer.build(invalidLayer), (context) => Effect.provide(operation, context)),
      ).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      expect(requests).toBe(0)
    })
  })
})

const apiKey = Config.succeed(Redacted.make("test-key"))
const RequestBody = Schema.Struct({
  messages: Schema.Array(Schema.Unknown),
  provider: Schema.optionalKey(Schema.Unknown),
  tools: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        function: Schema.Struct({ parameters: Schema.Unknown }),
      }),
    ),
  ),
})
type RequestBody = typeof RequestBody.Type
const decodeBody = (request: HttpClientRequest.HttpClientRequest): RequestBody | undefined =>
  request.body._tag === "Uint8Array"
    ? Schema.decodeSync(Schema.fromJsonString(RequestBody))(new TextDecoder().decode(request.body.body))
    : undefined
const encodeUnknown = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const sse = (...events: ReadonlyArray<unknown>): string =>
  events.map((event) => `data: ${encodeUnknown(event)}\n\n`).join("")
const usage = {
  completion_tokens: 2,
  cost: 0.0042,
  cost_details: {
    upstream_inference_completions_cost: 0.0028,
    upstream_inference_cost: 0.0038,
    upstream_inference_prompt_cost: 0.001,
  },
  is_byok: false,
  prompt_tokens: 3,
  total_tokens: 5,
}
interface ChatChunkInput {
  readonly choices?: ReadonlyArray<unknown>
  readonly provider?: string
  readonly system_fingerprint?: string
  readonly usage?: typeof usage
}
const chunk = (input: ChatChunkInput) => ({
  id: "generation-test",
  choices: [],
  created: 1,
  model: "served/model",
  object: "chat.completion.chunk",
  ...input,
})
const response = (request: HttpClientRequest.HttpClientRequest, body: string) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
  )

describe("OpenRouter public flow", () => {
  it.effect("exposes bounded OpenRouter billing metadata through the public Agent flow without prompts", () => {
    const bodies: Array<RequestBody | undefined> = []
    const client = HttpClient.make((request) => {
      bodies.push(decodeBody(request))
      return Effect.succeed(
        response(
          request,
          sse(
            chunk({ choices: [{ delta: { content: "done" }, finish_reason: "stop", index: 0 }] }),
            chunk({ provider: "Anthropic", system_fingerprint: "fp-184", usage }),
          ),
        ),
      )
    })

    return Effect.gen(function* () {
      const events = yield* Agent.stream(
        Agent.make({
          name: "openrouter-metadata",
          model: { provider: "openrouter", model: "requested/model" },
        }),
        { prompt: "prompt-secret" },
      ).pipe(
        Stream.provide(
          layer({ model: "requested/model", apiKey }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
        ),
        Stream.runCollect,
      )
      const completed = Array.from(events).find((event) => event._tag === "ModelAttemptCompleted")

      expect(bodies).toHaveLength(1)
      expect(completed?._tag === "ModelAttemptCompleted" && completed.requestId).toBe("generation-test")
      expect(completed?._tag === "ModelAttemptCompleted" && completed.responseModel).toBe("served/model")
      expect(completed?._tag === "ModelAttemptCompleted" && completed.providerMetadata).toEqual({
        openrouter: { provider: "Anthropic", systemFingerprint: "fp-184", usage },
      })
      expect(encodeUnknown(completed)).not.toContain("prompt-secret")
      expect(completed).not.toHaveProperty("prompt")
    })
  })

  it("accepts the supported routing policy and rejects widening or malformed policy with SchemaError", () => {
    const provider = {
      order: ["Anthropic", "OpenAI"],
      only: ["Anthropic"],
      require_parameters: true,
      zdr: true,
      data_collection: "deny" as const,
      max_price: { prompt: "0.10", completion: "0.20", request: "0.01" },
    }
    expect(decodeConfig({ provider })).toEqual({ provider })

    for (const invalid of [
      { provider: { ...provider, widen_policy: true } },
      { provider: { ...provider, require_parameters: "yes" } },
      { provider: { ...provider, max_price: { completion: 0.2 } } },
    ]) {
      try {
        decodeConfig(invalid)
        throw new Error("invalid policy decoded")
      } catch (error) {
        expect(Schema.isSchemaError(error)).toBe(true)
      }
    }
  })

  it.effect("retries invalid tool parameters without changing the transmitted OpenRouter tool schema", () => {
    const bodies: Array<RequestBody | undefined> = []
    let calls = 0
    const client = HttpClient.make((request) => {
      bodies.push(decodeBody(request))
      calls += 1
      const body =
        calls === 1
          ? sse(
              chunk({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          function: { arguments: '{"value":1}', name: "lookup" },
                          id: "call-test",
                          index: 0,
                          type: "function",
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                    index: 0,
                  },
                ],
              }),
              chunk({ usage }),
            )
          : sse(
              chunk({ choices: [{ delta: { content: "corrected" }, finish_reason: "stop", index: 0 }] }),
              chunk({ provider: "Anthropic", usage }),
            )
      return Effect.succeed(response(request, body))
    })
    const lookup = Tool.make("lookup", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
    }).annotate(Tool.Strict, true)
    const toolkit = Toolkit.make(lookup)
    const agent = Agent.make({
      name: "openrouter-correction",
      model: { provider: "openrouter", model: "requested/model" },
      toolkit,
    })

    return Effect.gen(function* () {
      const events = yield* Agent.stream(agent, { prompt: "use lookup" }).pipe(
        Stream.provide(
          Layer.mergeAll(
            layer({
              model: "requested/model",
              apiKey,
              config: decodeConfig({ provider: { only: ["Anthropic"], require_parameters: true } }),
            }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))),
            ModelResilience.layer({ invalidToolCallCorrectionLimit: 1 }).pipe(Layer.orDie),
            toolkit.toLayer({ lookup: () => Effect.succeed("ok") }),
          ),
        ),
        Stream.runCollect,
      )

      expect(calls).toBe(2)
      expect(bodies[0]?.tools).toEqual(bodies[1]?.tools)
      expect(bodies[0]?.provider).toEqual(bodies[1]?.provider)
      expect(bodies[0]?.messages).not.toEqual(bodies[1]?.messages)
      expect(bodies[1]?.tools?.[0]?.function?.parameters).toEqual({
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      })
      expect(Array.from(events).at(-1)).toMatchObject({ _tag: "Completed", text: "corrected" })
    })
  })
})
