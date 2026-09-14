import { Context, Effect, Layer, Schema } from "effect"
import { LanguageModel, Tool } from "effect/unstable/ai"
import { ModelRegistry } from "generalist"
import * as ModelCatalog from "generalist/providers/model-catalog"
import * as Deterministic from "generalist/providers/deterministic"
import * as ModelRoute from "generalist/unstable/providers/model-route"

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message)
}

const program = Effect.gen(function* () {
  const compiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) => Effect.succeed(Tool.getJsonSchema(tool))
  const compiled = yield* ModelRegistry.registration({
    provider: "fixture",
    model: "compiled",
    layer: Deterministic.layerModel({ response: "compiled response" }),
    toolJsonSchemaCompiler: compiler,
    isAvailabilityFailure: () => false,
  })
  const fallback = yield* Deterministic.registration({
    provider: "fixture",
    model: "fallback",
    response: "fallback response",
  })
  const route = yield* ModelRoute.make({ candidates: [compiled, fallback] })
  const registry = yield* Layer.build(
    ModelRegistry.layer([Effect.succeed(compiled), Effect.succeed(route.registration)]),
  )

  const selected = yield* ModelRegistry.withModel(
    { provider: "fixture", model: "compiled" },
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel
      assert(ModelRegistry.toolJsonSchemaCompiler(model) === compiler, "the provider compiler was not attached")
      return yield* LanguageModel.generateText({ prompt: "qualify the compiler" })
    }),
  ).pipe(Effect.provide(registry))
  assert(selected.text === "compiled response", "the registered model returned the wrong response")

  const routed = yield* ModelRegistry.withModel(
    route.selection,
    LanguageModel.generateText({ prompt: "qualify routing" }),
  ).pipe(Effect.provide(registry))
  assert(routed.text === "compiled response", "the ordered route did not invoke its first available candidate")

  const catalog = yield* Layer.build(
    ModelCatalog.layerTest([
      {
        provider: "fixture",
        model: "compiled",
        contextWindow: 65_536,
        maxOutput: 4_096,
        logprobs: false,
        modalities: ["text"],
      },
    ]),
  )
  const metadata = yield* ModelCatalog.get({ provider: "fixture", model: "compiled" }).pipe(Effect.provide(catalog))
  assert(metadata.contextWindow === 65_536, "the model catalog returned the wrong metadata")

  const tool = Tool.make("fixture_tool", { parameters: Schema.Struct({ value: Schema.Int }), success: Schema.Int })
  const activeModel = Context.get(yield* Layer.build(compiled.layer), LanguageModel.LanguageModel)
  const jsonSchema = yield* compiler(tool)
  assert(jsonSchema.type === "object", "the public compiler did not compile the tool schema")
  assert(
    ModelRegistry.toolJsonSchemaCompiler(activeModel) === undefined,
    "compiler metadata leaked outside the registry",
  )
  yield* Effect.log("qualified model/provider/catalog/compiler")
})

await Effect.runPromise(Effect.scoped(program))
