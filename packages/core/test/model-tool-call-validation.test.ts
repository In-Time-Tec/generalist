import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ModelRegistry, ModelToolCallValidation } from "../src/index.js"

const compiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) => Effect.succeed(Tool.getJsonSchema(tool))

const makeModel = (
  parts: ReadonlyArray<Response.StreamPartEncoded>,
  capture?: (tools: ReadonlyArray<Tool.Any>) => void,
) =>
  LanguageModel.make({
    generateText: () => Effect.succeed([]),
    streamText: (options) => {
      capture?.(options.tools)
      return Stream.fromIterable(parts)
    },
  })

const originalTool = Tool.make("lookup", {
  description: "Looks up a value",
  parameters: Schema.Struct({ value: Schema.String }),
  success: Schema.String,
}).annotate(Tool.Strict, true)
const originalToolkit = Toolkit.make(originalTool)

const finish = Response.makePart("finish", {
  reason: "tool-calls" as const,
  usage: Response.Usage.make({
    inputTokens: { uncached: undefined, total: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: undefined, reasoning: undefined },
  }),
  response: undefined,
}) as Response.StreamPartEncoded

describe("model tool-call validation", () => {
  it.effect("projects exact JSON Schema while making model response decoding permissive", () =>
    Effect.gen(function* () {
      const projected = yield* ModelToolCallValidation.projectToolkit(originalToolkit, compiler)
      const tool = projected.toolkit.tools.lookup!

      expect(Tool.isDynamic(tool)).toBe(true)
      expect(tool.parametersSchema).toBe(Schema.Unknown)
      expect(Tool.getJsonSchema(tool)).toEqual(Tool.getJsonSchema(originalTool))
      expect(Tool.getStrictMode(tool)).toBe(true)
      expect(Tool.getDescription(tool)).toBe("Looks up a value")
    }),
  )

  it.effect("buffers staged parts and emits decoded parameters only after validation", () =>
    Effect.gen(function* () {
      let providerTools: ReadonlyArray<Tool.Any> = []
      const model = yield* makeModel(
        [
          Response.makePart("response-metadata", {
            id: "request-1",
            modelId: "test",
            timestamp: undefined,
            request: undefined,
          }) as Response.StreamPartEncoded,
          { type: "tool-params-start", id: "call-1", name: "lookup" },
          { type: "tool-params-delta", id: "call-1", delta: '{"value":"accepted"}' },
          { type: "tool-params-end", id: "call-1" },
          { type: "tool-call", id: "call-1", name: "lookup", params: { value: "accepted" } },
          finish,
        ],
        (tools) => (providerTools = tools),
      )
      const projected = yield* ModelToolCallValidation.projectToolkit(originalToolkit, compiler)
      const wrapped = ModelToolCallValidation.wrap(model, originalToolkit, projected.toolkit)
      const parts = yield* wrapped
        .streamText({ prompt: "lookup", toolkit: originalToolkit, disableToolCallResolution: true })
        .pipe(Stream.runCollect)
      const values = Array.from(parts)

      expect(providerTools[0]).toBe(projected.toolkit.tools.lookup)
      expect(values.map((part) => part.type)).toEqual([
        "response-metadata",
        "tool-params-start",
        "tool-params-delta",
        "tool-params-end",
        "tool-call",
        "finish",
      ])
      expect(values.find((part) => part.type === "tool-call")).toMatchObject({ params: { value: "accepted" } })
    }),
  )

  it.effect("discards metadata and staged parts when original parameter validation fails", () =>
    Effect.gen(function* () {
      const model = yield* makeModel([
        Response.makePart("response-metadata", {
          id: "request-secret",
          modelId: "test",
          timestamp: undefined,
          request: undefined,
        }) as Response.StreamPartEncoded,
        { type: "tool-params-start", id: "call-1", name: "lookup" },
        { type: "tool-params-delta", id: "call-1", delta: '{"value":"secret"}' },
        { type: "tool-params-end", id: "call-1" },
        { type: "tool-call", id: "call-1", name: "lookup", params: { value: 1 } },
      ])
      const projected = yield* ModelToolCallValidation.projectToolkit(originalToolkit, compiler)
      const wrapped = ModelToolCallValidation.wrap(model, originalToolkit, projected.toolkit)
      const seen: Array<Response.StreamPart<any>> = []
      const failure = yield* wrapped
        .streamText({ prompt: "lookup", toolkit: originalToolkit, disableToolCallResolution: true })
        .pipe(
          Stream.runForEach((part) => Effect.sync(() => seen.push(part))),
          Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
        )

      expect(seen).toEqual([])
      expect(Schema.is(ModelToolCallValidation.InvalidToolCallParameters)(failure)).toBe(true)
      expect(failure).toEqual(ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" }))
      expect(failure).not.toHaveProperty("params")
      expect(failure).not.toHaveProperty("description")
    }),
  )

  it.effect("preserves raw dynamic schemas and provider-defined identity and args", () =>
    Effect.gen(function* () {
      const rawSchema = {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      } as const
      const dynamic = Tool.dynamic("dynamic", { parameters: rawSchema })
      const providerDefined = Tool.providerDefined({
        id: "test.search",
        customName: "ProviderSearch",
        providerName: "search",
        args: Schema.Struct({ limit: Schema.Finite }),
        parameters: Schema.Struct({ query: Schema.String }),
      })({ limit: 3 })
      const projected = yield* ModelToolCallValidation.projectToolkit(Toolkit.make(dynamic, providerDefined), compiler)
      const projectedDynamic = projected.toolkit.tools.dynamic!
      const projectedProvider = projected.toolkit.tools.ProviderSearch!

      expect(Tool.getJsonSchema(projectedDynamic)).toEqual(rawSchema)
      expect(Tool.getStrictMode(projectedDynamic)).toBeUndefined()
      expect(Tool.isProviderDefined(projectedProvider)).toBe(true)
      if (Tool.isProviderDefined(projectedProvider)) {
        expect(projectedProvider.id).toBe(providerDefined.id)
        expect(projectedProvider.providerName).toBe(providerDefined.providerName)
        expect(projectedProvider.args).toEqual(providerDefined.args)
        expect(projectedProvider.argsSchema).toBe(providerDefined.argsSchema)
        expect(projectedProvider.parametersSchema).toBe(Schema.Unknown)
      }

      const direct = yield* makeModel([])
      yield* ModelToolCallValidation.prepare(direct, Toolkit.make(dynamic, providerDefined), 1)
    }),
  )

  it.effect("fails before provider invocation when correction needs a missing direct-model compiler", () =>
    Effect.gen(function* () {
      let calls = 0
      const model = yield* makeModel([], () => calls++)
      const failure = yield* ModelToolCallValidation.prepare(model, originalToolkit, 1).pipe(Effect.flip)

      expect(Schema.is(ModelToolCallValidation.ToolJsonSchemaCompilerMissing)(failure)).toBe(true)
      expect(calls).toBe(0)

      const attached = ModelRegistry.withToolJsonSchemaCompiler(model, compiler)
      const prepared = yield* ModelToolCallValidation.prepare(attached, originalToolkit, 1)
      expect(ModelRegistry.toolJsonSchemaCompiler(prepared)).toBe(compiler)
    }),
  )
})
