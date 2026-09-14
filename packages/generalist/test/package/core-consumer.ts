import { Cause, Context, Effect, Fiber, Layer, Queue, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ModelRegistry } from "generalist"
import * as Live from "generalist/live"
import * as ModelCatalog from "generalist/providers/model-catalog"
import * as Deterministic from "generalist/providers/deterministic"
import * as ModelRoute from "generalist/unstable/providers/model-route"

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message)
}

const qualifyLiveProvider = Effect.gen(function* () {
  const capabilities: Live.Capabilities = {
    input: [{ modality: "text", mediaTypes: [] }],
    output: [{ modality: "text", mediaTypes: [] }],
    tools: false,
    interruption: true,
  }
  const requests = yield* Ref.make<ReadonlyArray<Live.TurnRequest>>([])
  const provider: Live.Service = {
    capabilities,
    connect: () =>
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<Live.Event, Live.EventFailure | Cause.Done>()
        yield* Effect.addFinalizer(() => Queue.shutdown(queue))
        return {
          id: "packed-external-live",
          capabilities,
          events: Stream.fromQueue(queue),
          send: () => Effect.void,
          commitInput: (request) =>
            Ref.update(requests, (current) => [...current, request]).pipe(
              Effect.andThen(Queue.offer(queue, { _tag: "TurnStarted", sequence: 0, assignment: request.assignment })),
              Effect.andThen(
                Queue.offer(queue, {
                  _tag: "TurnCompleted",
                  sequence: 1,
                  assignment: request.assignment,
                  response: [Response.makePart("text", { text: "live response" })],
                }),
              ),
            ),
          sendToolResult: () =>
            Live.InvalidCommand.make({ connectionId: "packed-external-live", reason: "fixture has no tools" }),
          interrupt: () => Effect.void,
          close: Effect.void,
        } satisfies Live.Connection
      }),
  }
  const live = Context.get(yield* Layer.build(Layer.succeed(Live.LiveProvider, provider)), Live.LiveProvider)
  const connection = yield* live.connect({ capabilities, delivery: { _tag: "Backpressure", capacity: 2 } })
  const received = yield* Stream.runCollect(connection.events.pipe(Stream.take(2))).pipe(Effect.forkChild)
  const toolkit = Toolkit.empty
  const context = Prompt.fromMessages([
    Prompt.makeMessage("system", { content: "packed qualification" }),
    Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "use the external live provider" })],
    }),
  ])
  yield* connection.commitInput({
    assignment: { turnId: "packed-live-turn", assignmentId: "packed-live-operation" },
    context,
    toolkit,
  })
  const events = yield* Fiber.join(received)
  const observed = yield* Ref.get(requests)
  assert(events[0]?._tag === "TurnStarted" && events[1]?._tag === "TurnCompleted", "Live events diverged")
  assert(observed.length === 1 && observed[0]?.context === context, "Live provider lost authoritative context")
  assert(observed[0]?.toolkit === toolkit, "Live provider lost the active toolkit")
})

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
  yield* qualifyLiveProvider
  yield* Effect.log("qualified model/provider/catalog/compiler")
})

await Effect.runPromise(Effect.scoped(program))
