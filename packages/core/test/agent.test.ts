import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Schedule, Schema, Stream, Tracer } from "effect"
import { AiError, Chat, LanguageModel, Prompt, Response, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  Approvals,
  Compaction,
  Instructions,
  Memory,
  ModelRegistry,
  ModelResilience,
  ModelMiddleware,
  Permissions,
  Session,
  SkillSource,
  Steering,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  TurnPolicy,
} from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]
type StreamServices<T> = T extends Stream.Stream<unknown, unknown, infer R> ? R : never

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value
type EffectRequirements<Value> =
  Value extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never
type StreamRequirements<Value> =
  Value extends Stream.Stream<unknown, unknown, infer Requirements> ? Requirements : never
type IsAssignable<Source, Target> = Source extends Target ? true : false

const plainRequiredAgent = Agent.make({ name: "plain-required" })
const selectedRequiredAgent = Agent.make({ name: "selected-required", model: { provider: "test", model: "test" } })
const memoryRequiredAgent = Agent.make({
  name: "memory-required",
  memory: { agent: "memory-required", subject: "memory-subject" },
})
const selectedMemoryRequiredAgent = Agent.make({
  name: "selected-memory-required",
  model: { provider: "test", model: "test" },
  memory: { agent: "selected-memory-required", subject: "memory-subject" },
})
const widenedOptions: Agent.MakeObjectOptions = { name: "widened-required" }
const widenedRequiredAgent = Agent.make(widenedOptions)
const memoryRequiredRun = Agent.generate(memoryRequiredAgent, { prompt: "hello" })
const runMemoryRequired = Agent.generate(plainRequiredAgent, {
  prompt: "hello",
  memory: { key: { agent: "plain-required", subject: "memory-subject" } },
})
const persistedRequired = Agent.persisted(plainRequiredAgent, {
  prompt: "hello",
  persistence: { chatId: "chat" },
})
const generatedPersistedRequired = Agent.generatePersisted(plainRequiredAgent, {
  prompt: "hello",
  persistence: { chatId: "chat" },
})
const persistedObjectRequired = Agent.persistedObject(plainRequiredAgent, {
  prompt: "hello",
  persistence: { chatId: "chat" },
  schema: Schema.Struct({ value: Schema.String }),
})
const generatedPersistedObjectRequired = Agent.generatePersistedObject(plainRequiredAgent, {
  prompt: "hello",
  persistence: { chatId: "chat" },
  schema: Schema.Struct({ value: Schema.String }),
})

class ModelDependency extends Context.Service<ModelDependency, { readonly value: string }>()(
  "@batonfx/core/test/agent.test/ModelDependency",
) {}

const dependentModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  ModelDependency.pipe(
    Effect.flatMap(() =>
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => Stream.make(Response.makePart("text-delta", { id: "text", delta: "provided" })),
      }),
    ),
  ),
)
const modelProvidedAgent = Agent.provideModel(memoryRequiredAgent, dependentModelLayer)

const agentRequirementProofs: ReadonlyArray<true> = [
  true satisfies Assert<Equal<Agent.Requirements<typeof plainRequiredAgent>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<Agent.Requirements<typeof selectedRequiredAgent>, ModelRegistry.Service>>,
  true satisfies Assert<
    Equal<Agent.Requirements<typeof memoryRequiredAgent>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<Agent.Requirements<typeof selectedMemoryRequiredAgent>, ModelRegistry.Service | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<
      Agent.Requirements<typeof widenedRequiredAgent>,
      LanguageModel.LanguageModel | ModelRegistry.Service | Memory.Memory
    >
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof memoryRequiredRun>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof runMemoryRequired>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<StreamRequirements<typeof persistedRequired>, LanguageModel.LanguageModel | Chat.Persistence>
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof generatedPersistedRequired>, LanguageModel.LanguageModel | Chat.Persistence>
  >,
  true satisfies Assert<
    Equal<StreamRequirements<typeof persistedObjectRequired>, LanguageModel.LanguageModel | Chat.Persistence>
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof generatedPersistedObjectRequired>, LanguageModel.LanguageModel | Chat.Persistence>
  >,
  true satisfies Assert<Equal<Agent.Requirements<typeof modelProvidedAgent>, Memory.Memory | ModelDependency>>,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<{}, LanguageModel.LanguageModel | Memory.Memory>,
        Agent.Agent<{}, LanguageModel.LanguageModel>
      >,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<{}, LanguageModel.LanguageModel>,
        Agent.Agent<{}, LanguageModel.LanguageModel | Memory.Memory>
      >,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<{}, LanguageModel.LanguageModel>,
        Agent.Agent<Record<"tool", Tool.Any>, LanguageModel.LanguageModel>
      >,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<{ readonly prompt: "hello"; readonly persistence: { readonly chatId: "chat" } }, Agent.RunOptions>,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        {
          readonly prompt: "hello"
          readonly history: "history"
          readonly persistence: { readonly chatId: "chat" }
        },
        Agent.PersistedRunOptions
      >,
      false
    >
  >,
]

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"] = () => Effect.succeed([{ type: "text", text: "unused" }]),
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText,
      streamText,
    }),
  )

class Budget extends Context.Service<Budget, { readonly remaining: (turn: number) => number }>()(
  "@batonfx/core/test/agent.test/Budget",
) {}

const characterTokenizerLayer = Layer.succeed(
  Tokenizer.Tokenizer,
  Tokenizer.Tokenizer.of({
    tokenize: (input) => Effect.succeed([...Json.stringify(Prompt.make(input).content)].map((_, index) => index)),
    truncate: (input) => Effect.succeed(Prompt.make(input)),
  }),
)

const echoTool = Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const requiredToolkit = Toolkit.make(echoTool)
const toolkitRequiredAgent = Agent.make({ name: "toolkit-required", toolkit: requiredToolkit })
const toolkitRequirementProof: Assert<
  Equal<
    Agent.Requirements<typeof toolkitRequiredAgent>,
    LanguageModel.LanguageModel | Tool.HandlersFor<typeof requiredToolkit.tools>
  >
> = true

const gatedTool = Tool.make("gated", {
  description: "Requires approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: true,
})

const testSkill = (
  name: string,
  description: string,
  body: string,
  options: Partial<SkillSource.Frontmatter> = {},
): SkillSource.Skill => {
  const frontmatter: SkillSource.Frontmatter = { name, description, ...options }
  return {
    frontmatter,
    listing: SkillSource.makeListing(frontmatter),
    body: Effect.succeed(body),
    tools: [],
  }
}

const echoExecutor = ToolExecutor.testLayer({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.testLayer({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const providerToolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: true })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const progressMessages = (events: Iterable<AgentEvent.Event>) =>
  [...events].filter((event) => event._tag === "ToolProgress").map((event) => event.message)

const toolCompletionMetadata = (events: Iterable<AgentEvent.Event>) =>
  [...events].find((event) => event._tag === "ToolExecutionCompleted")?.metadata

const systemText = (prompt: Prompt.Prompt): string | undefined => {
  for (const message of prompt.content) {
    if (message.role === "system") return message.content
  }
  return undefined
}

const usage = (
  inputTokens: Partial<Response.Usage["inputTokens"]>,
  outputTokens: Partial<Response.Usage["outputTokens"]>,
) =>
  Response.Usage.make({
    inputTokens: {
      uncached: inputTokens.uncached,
      total: inputTokens.total,
      cacheRead: inputTokens.cacheRead,
      cacheWrite: inputTokens.cacheWrite,
    },
    outputTokens: {
      total: outputTokens.total,
      text: outputTokens.text,
      reasoning: outputTokens.reasoning,
    },
  })

const finishPart = (reason: Response.FinishReason, reportedUsage: Response.Usage) =>
  Response.makePart("finish", { reason, usage: reportedUsage, response: undefined })

const testTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

const objectSchema = Schema.Struct({ ok: Schema.Boolean })

const transientModelError = AiError.make({
  module: "AgentTestLanguageModel",
  method: "streamText",
  reason: AiError.RateLimitError.make({}),
})

const contextOverflowError = (description: string) =>
  AiError.make({
    module: "AgentTestLanguageModel",
    method: "streamText",
    reason: AiError.UnknownError.make({ description }),
  })

const retryTransientModelError = ModelResilience.layer({
  retrySchedule: Schedule.recurs(1),
  classify: (error) => (error === transientModelError ? "transient" : "terminal"),
})

layer(unusedToolHandlerLayer)("Agent", (it) => {
  expect(agentRequirementProofs.every(Boolean)).toBe(true)
  expect(toolkitRequirementProof).toBe(true)

  ItLayer.make(
    it,
    "runs through a provided model layer while retaining the layer requirement",
    () =>
      [
        Layer.mergeAll(Layer.succeed(ModelDependency, ModelDependency.of({ value: "configured" })), Memory.layerNoop),
        Effect.gen(function* () {
          const result = yield* Agent.generate(modelProvidedAgent, { prompt: "hello" })

          expect(result.text).toBe("provided")
        }),
      ] as const,
  )

  it.effect("scopes a provided model layer to stream consumption and interruption", () =>
    Effect.gen(function* () {
      let acquisitions = 0
      let releases = 0
      const started = yield* Deferred.make<void>()
      const providedModelLayer = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () =>
              Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(Stream.drain, Stream.concat(Stream.never)),
          }).pipe(Effect.tap(() => Effect.sync(() => acquisitions++))),
          () => Effect.sync(() => releases++),
        ),
      )
      const agent = Agent.provideModel(Agent.make({ name: "scoped-model-agent" }), providedModelLayer)
      const run = Stream.runDrain(Agent.stream(agent, { prompt: "wait" }))

      expect(acquisitions).toBe(0)
      const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(started)
      expect(acquisitions).toBe(1)
      expect(releases).toBe(0)

      yield* Fiber.interrupt(fiber)
      expect(releases).toBe(1)
    }),
  )

  it("adds usage fieldwise without inventing absent leaves", () => {
    const first = usage({ uncached: 1, total: 10, cacheWrite: 3 }, { total: 4, text: 2 })
    const second = usage({ uncached: 4, total: 20, cacheRead: 5 }, { total: 6, reasoning: 7 })

    const summed = AgentEvent.addUsage(first, second)

    expect(summed.inputTokens.uncached).toBe(5)
    expect(summed.inputTokens.total).toBe(30)
    expect(summed.inputTokens.cacheRead).toBe(5)
    expect(summed.inputTokens.cacheWrite).toBe(3)
    expect(summed.outputTokens.total).toBe(10)
    expect(summed.outputTokens.text).toBe(2)
    expect(summed.outputTokens.reasoning).toBe(7)
    expect(AgentEvent.addUsage(usage({}, {}), usage({}, {})).inputTokens.total).toBeUndefined()
  })

  it("carries model, memory, and metadata defaults as agent data", () => {
    const model = { provider: "test", model: "deterministic", registrationKey: "primary" }
    const memory = { agent: "defaults-agent", subject: "subject-1" }
    const metadata = { audience: "internal", revision: 1 }

    const agent = Agent.make("defaults-agent", { model, memory, metadata })

    expect(agent.model).toEqual(model)
    expect(agent.memory).toEqual(memory)
    expect(agent.metadata).toEqual(metadata)
  })

  it("constructs AgentError without a cause", () => {
    const error = AgentEvent.AgentError.make({ message: "boom", turn: 0 })

    expect(error._tag).toBe("@batonfx/core/AgentError")
    expect(error.cause).toBeUndefined()
  })

  ItLayer.make(it, "rejects duplicate static tool names before the model is called", () => {
    let modelCalls = 0
    const duplicateEcho = Tool.make("echo", {
      description: "A second declaration with the same name",
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.Unknown,
    })
    return [
      modelLayer(() => {
        modelCalls += 1
        return Stream.make(textDelta("unexpected"))
      }),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "collision-agent", tools: [echoTool, duplicateEcho] })

        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "hello" })))

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "echo",
            origins: [
              { _tag: "Static", agent: "collision-agent" },
              { _tag: "Static", agent: "collision-agent" },
            ],
          }),
        )
        expect(Schema.is(AgentEvent.ToolNameCollision)(failure)).toBe(true)
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "advertises and dispatches a __proto__ tool from the same registry snapshot", () => {
    let modelCalls = 0
    let executorCalls = 0
    let advertisedTools: ReadonlyArray<string> = []
    const prototypeTool = Tool.make("__proto__", {
      parameters: Schema.Unknown,
      success: Schema.Unknown,
    })
    return [
      Layer.merge(
        modelLayer((options) => {
          modelCalls += 1
          advertisedTools = options.tools.map((tool) => tool.name)
          return modelCalls === 1
            ? Stream.make(toolCallPart("prototype-call", "__proto__", {}))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.testLayer({
          execute: () => {
            executorCalls += 1
            return Effect.succeed({ _tag: "Success", result: "safe", encodedResult: "safe" })
          },
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "prototype-agent", tools: [prototypeTool] })

        yield* Stream.runDrain(Agent.stream(agent, { prompt: "call prototype" }))

        expect(advertisedTools).toEqual(["__proto__"])
        expect(executorCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "reserves activate_skill before the model is called", () => {
    let modelCalls = 0
    const reserved = Tool.make("activate_skill", {
      parameters: Schema.Unknown,
      success: Schema.Unknown,
    })
    return [
      Layer.merge(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        SkillSource.fromSkills([testSkill("review", "Review code", "Review carefully")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reserved-agent", tools: [reserved] })

        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "hello" })))

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "activate_skill",
            origins: [
              { _tag: "Static", agent: "reserved-agent" },
              { _tag: "Builtin", builtin: "activate_skill" },
            ],
          }),
        )
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when toolOutputMaxBytes is invalid", () => {
    let modelCalls = 0
    const invalidValues = [-1, Number.NaN, Number.POSITIVE_INFINITY]
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-tool-output-limit-agent" })

        for (const toolOutputMaxBytes of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", toolOutputMaxBytes })),
          )

          expect(failure._tag).toBe("@batonfx/core/AgentError")
          expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe(
            "RunOptions.toolOutputMaxBytes must be a non-negative finite number",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when tool progress capacity is invalid", () => {
    let modelCalls = 0
    const invalidValues = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-progress-capacity-agent" })

        for (const capacity of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", toolProgress: { _tag: "Backpressure", capacity } })),
          )

          expect(failure._tag).toBe("@batonfx/core/AgentError")
          expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe(
            "RunOptions.toolProgress must select a supported policy with a positive safe-integer capacity",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when compaction contextWindow is invalid", () => {
    let modelCalls = 0
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY]
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-context-window-agent" })

        for (const contextWindow of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", compaction: { contextWindow } })),
          )

          expect(failure._tag).toBe("@batonfx/core/AgentError")
          expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe(
            "RunOptions.compaction.contextWindow must be a positive finite number",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "runs an agent turn and emits loop events",
    () =>
      [
        Layer.mergeAll(
          modelLayer((options) =>
            Stream.make(
              textDelta(
                Json.stringify(options.prompt.content).includes("Always mention relay input") &&
                  Json.stringify(options.prompt.content).includes("relay input")
                  ? "saw system and input"
                  : "missing system or input",
              ),
            ),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "loop-test-agent",
            instructions: "Always mention relay input when you answer.",
          })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "relay input" }))

          expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
          const completed = events.at(-1)
          expect(completed?._tag).toBe("Completed")
          if (completed?._tag === "Completed") {
            expect(completed.text).toBe("saw system and input")
            expect(completed.turns).toBe(1)
            expect("usage" in completed).toBe(false)
          }
          const modelPart = events[1]
          if (modelPart?._tag === "ModelPart") {
            expect(modelPart.part.type).toBe("text-delta")
          }
          const turnCompleted = events.find((event) => event._tag === "TurnCompleted")
          if (turnCompleted?._tag === "TurnCompleted") {
            expect("usage" in turnCompleted).toBe(false)
            expect("finishReason" in turnCompleted).toBe(false)
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "runs a no-tool agent with only a language model layer",
    () =>
      [
        modelLayer(() => Stream.make(textDelta("minimal done"))),
        Effect.gen(function* () {
          const agent = Agent.make("minimal-agent", { instructions: "Answer directly." })

          const result = yield* Agent.generate(agent, { prompt: "hello" })

          expect(result.text).toBe("minimal done")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "uses the agent model default through ModelRegistry",
    () =>
      [
        Layer.unwrap(
          ModelRegistry.registrationFromLayer({
            provider: "test",
            model: "agent-default",
            layer: modelLayer(() => Stream.make(textDelta("registry done"))),
          }).pipe(Effect.map((registration) => ModelRegistry.memoryLayer([registration]))),
        ),
        Effect.gen(function* () {
          const agent = Agent.make("model-default-agent", {
            model: { provider: "test", model: "agent-default" },
          })

          const result = yield* Agent.generate(agent, { prompt: "hello" })

          expect(result.text).toBe("registry done")
        }),
      ] as const,
  )

  ItLayer.make(it, "governs selected streaming and structured model operations through their exits", () => {
    let acquired = 0
    let released = 0
    const selection = { provider: "test", model: "scoped-structured" }
    const structuredEntered = Deferred.makeUnsafe<void>()
    const structuredGate = Deferred.makeUnsafe<void>()
    const selectedModel = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.acquireRelease(
        Effect.gen(function* () {
          acquired += 1
          const lifetime = { finalized: false }
          const assertLive = Effect.gen(function* () {
            if (lifetime.finalized) return yield* Effect.die("selected model used after layer release")
          })
          const model = yield* LanguageModel.make({
            streamText: () => Stream.fromEffect(assertLive).pipe(Stream.map(() => textDelta("normal answer"))),
            generateText: () =>
              assertLive.pipe(
                Effect.andThen(Deferred.succeed(structuredEntered, undefined)),
                Effect.andThen(Deferred.await(structuredGate)),
                Effect.as([{ type: "text" as const, text: '{"ok":true}' }]),
              ),
          })
          return { lifetime, model }
        }),
        ({ lifetime }) =>
          Effect.sync(() => {
            lifetime.finalized = true
            released += 1
          }),
      ).pipe(Effect.map(({ model }) => model)),
    )

    return [
      Layer.unwrap(
        ModelRegistry.registrationFromLayer({ ...selection, layer: selectedModel }).pipe(
          Effect.map((registration) =>
            Layer.mergeAll(
              ModelRegistry.memoryLayer([registration], { maxConcurrentModelCalls: 1 }),
              unusedExecutor,
              Approvals.autoApprove,
              ModelMiddleware.identityLayer,
            ),
          ),
        ),
      ),
      Effect.gen(function* () {
        const agent = Agent.make("scoped-structured-agent", { model: selection })
        const agentFiber = yield* Effect.forkChild(
          Agent.generateObject(agent, { prompt: "make object", schema: objectSchema }),
        )
        yield* Deferred.await(structuredEntered)

        let competitorEntered = false
        const competitor = yield* Effect.forkChild(
          ModelRegistry.operate(
            selection,
            Effect.sync(() => {
              competitorEntered = true
            }),
          ),
        )
        yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
        expect(competitorEntered).toBe(false)

        yield* Deferred.succeed(structuredGate, undefined)
        const result = yield* Fiber.join(agentFiber)
        yield* Fiber.join(competitor)

        expect(result.text).toBe("normal answer")
        expect(result.value).toEqual({ ok: true })
        expect(competitorEntered).toBe(true)
        expect(acquired).toBe(3)
        expect(released).toBe(3)
      }),
    ] as const
  })

  ItLayer.make(it, "uses the agent memory default when run options omit memory", () => {
    const key = { agent: "memory-default-agent", subject: "subject-1" }
    let recalled = false
    let rememberedKey: Memory.Key | undefined

    return [
      Layer.mergeAll(
        modelLayer((options) =>
          Stream.make(
            textDelta(Json.stringify(options.prompt.content).includes("stored fact") ? "saw memory" : "missing memory"),
          ),
        ),
        Memory.testLayer({
          recall: (input) =>
            Effect.sync(() => {
              recalled = input.key.agent === key.agent && input.key.subject === key.subject
              return [{ id: "memory-default-item", content: [Prompt.makePart("text", { text: "stored fact" })] }]
            }),
          remember: (input) =>
            Effect.sync(() => {
              rememberedKey = input.key
            }),
          forget: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make("memory-default-agent", { memory: key })

        const result = yield* Agent.generate(agent, { prompt: "live prompt" })

        expect(recalled).toBe(true)
        expect(rememberedKey).toEqual(key)
        expect(result.text).toBe("saw memory")
      }),
    ] as const
  })

  ItLayer.make(it, "executes Effect toolkit handlers without a ToolExecutor layer", () => {
    let calls = 0
    let handled = false
    const toolkit = Toolkit.make(echoTool)
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-effect-toolkit", "echo", { text: "from model" }))
            : Stream.make(
                textDelta(Json.stringify(options.prompt.content).includes("handled by toolkit") ? "done" : "missing"),
              )
        }),
        toolkit.toLayer({
          echo: ({ text }) =>
            Effect.sync(() => {
              handled = true
              return { echoed: text, marker: "handled by toolkit" }
            }),
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make("toolkit-handler-agent", { toolkit })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

        expect(handled).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps ToolExecutor as an override when it is provided", () => {
    let calls = 0
    let toolkitHandlerCalls = 0
    let executorCalls = 0
    const toolkit = Toolkit.make(echoTool)
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-override", "echo", { text: "from model" }))
            : Stream.make(
                textDelta(Json.stringify(options.prompt.content).includes("handled by executor") ? "done" : "missing"),
              )
        }),
        toolkit.toLayer({
          echo: () =>
            Effect.sync(() => {
              toolkitHandlerCalls += 1
              return { marker: "handled by toolkit" }
            }),
        }),
        ToolExecutor.testLayer({
          execute: () =>
            Effect.sync(() => {
              executorCalls += 1
              return {
                _tag: "Success",
                result: { marker: "handled by executor" },
                encodedResult: { marker: "handled by executor" },
              }
            }),
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make("tool-executor-override-agent", { toolkit })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

        expect(toolkitHandlerCalls).toBe(0)
        expect(executorCalls).toBe(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "fails approval-gated tools closed when Approvals is absent", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-missing-approvals", "gated", { text: "from model" }))
            : Stream.make(textDelta("after failed approval"))
        }),
        Toolkit.make(gatedTool).toLayer({
          gated: () => Effect.die("approval-gated call must not execute"),
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make("missing-approvals-agent", { toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use gated" }))
        const completion = events.find((event) => event._tag === "ToolExecutionCompleted")

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        if (completion?._tag === "ToolExecutionCompleted") {
          expect(completion.result.isFailure).toBe(true)
          expect(Json.stringify(completion.result.encodedResult)).toContain("Approvals service is required")
        }
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "uses an Instructions baseline for the first-turn system message", () => {
    let capturedSystem: string | undefined
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedSystem = systemText(options.prompt)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Instructions.layer([
          Instructions.staticSource("first", "first"),
          Instructions.staticSource("second", "second"),
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "instructions-agent", instructions: "fallback instructions" })

        yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello" }))

        expect(capturedSystem).toBe("first\n\nsecond")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps options.system ahead of an Instructions baseline", () => {
    let capturedSystem: string | undefined
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedSystem = systemText(options.prompt)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Instructions.layer([Instructions.staticSource("registry", "registry")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "instructions-system-agent", instructions: "fallback instructions" })

        yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello", system: "override" }))

        expect(capturedSystem).toBe("override")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps explicit history ahead of an Instructions baseline", () => {
    let capturedSystem: string | undefined
    let capturedPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedSystem = systemText(options.prompt)
          capturedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Instructions.layer([Instructions.staticSource("registry", "registry")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "instructions-history-agent", instructions: "fallback instructions" })

        yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "new input",
            history: [
              { role: "system", content: "history system" },
              { role: "user", content: [{ type: "text", text: "earlier" }] },
            ],
          }),
        )

        expect(capturedSystem).toBe("history system")
        expect(capturedPrompt).not.toContain("registry")
        expect(capturedPrompt).not.toContain("fallback instructions")
      }),
    ] as const
  })

  ItLayer.make(it, "falls back to agent instructions when the Instructions baseline is empty", () => {
    let capturedSystem: string | undefined
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedSystem = systemText(options.prompt)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        Instructions.layer([Instructions.staticSource("empty", "")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "empty-instructions-agent", instructions: "fallback instructions" })

        yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello" }))

        expect(capturedSystem).toBe("fallback instructions")
      }),
    ] as const
  })

  ItLayer.make(it, "injects skill listings and loads only activated skill bodies", () => {
    let calls = 0
    let firstPrompt = ""
    let secondPrompt = ""
    let firstTools: ReadonlyArray<string> = []
    let secondTools: ReadonlyArray<string> = []
    let deployBodyReads = 0
    const reviewTool = Tool.make("review_tool", {
      description: "Review helper",
      parameters: Schema.Struct({ target: Schema.String }),
      success: Schema.Unknown,
    })
    const review: SkillSource.Skill = {
      ...testSkill("review", "Review code before changing it.", "FULL REVIEW BODY", {
        allowedTools: ["read", "grep"],
      }),
      tools: [reviewTool],
    }
    const deployBase = testSkill("deploy", "Deploy after verification.", "FULL DEPLOY BODY", {
      allowedTools: ["deploy"],
    })
    const deploy: SkillSource.Skill = {
      ...deployBase,
      body: Effect.sync(() => {
        deployBodyReads += 1
        return "FULL DEPLOY BODY"
      }),
    }
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          const content = Json.stringify(options.prompt.content)
          if (calls === 1) {
            firstPrompt = content
            firstTools = options.tools.map((tool) => tool.name)
            return Stream.make(toolCallPart("skill-call-review", "activate_skill", { name: "review" }))
          }
          secondPrompt = content
          secondTools = options.tools.map((tool) => tool.name)
          return Stream.make(textDelta("used review"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        SkillSource.fromSkills([review, deploy]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "skill-agent", instructions: "base instructions" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "review this" }))
        const activation = events.find(
          (event) => event._tag === "ToolExecutionCompleted" && event.call.name === "activate_skill",
        )

        expect(calls).toBe(2)
        expect(firstTools).toContain("activate_skill")
        expect(firstTools).not.toContain("review_tool")
        expect(secondTools).toContain("review_tool")
        expect(firstPrompt).toContain("base instructions")
        expect(firstPrompt).toContain("- review: Review code before changing it.")
        expect(firstPrompt).toContain("- deploy: Deploy after verification.")
        expect(firstPrompt).not.toContain("FULL REVIEW BODY")
        expect(firstPrompt).not.toContain("FULL DEPLOY BODY")
        expect(secondPrompt).toContain("FULL REVIEW BODY")
        expect(secondPrompt).toContain("read")
        expect(secondPrompt).toContain("grep")
        expect(secondPrompt).not.toContain("FULL DEPLOY BODY")
        expect(deployBodyReads).toBe(0)
        expect(activation?._tag === "ToolExecutionCompleted" && activation.result.result).toEqual({
          name: "review",
          body: "FULL REVIEW BODY",
          allowedTools: ["read", "grep"],
        })
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a static and activated-skill collision before another model request", () => {
    let modelCalls = 0
    let bodyReads = 0
    let executorCalls = 0
    const collidingSkill: SkillSource.Skill = {
      ...testSkill("collision", "Contributes a colliding tool", "unused"),
      body: Effect.sync(() => {
        bodyReads += 1
        return "unused"
      }),
      tools: [echoTool],
    }
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(toolCallPart("activate-collision", "activate_skill", { name: "collision" }))
        }),
        SkillSource.fromSkills([collidingSkill]),
        ToolExecutor.testLayer({
          execute: () => {
            executorCalls += 1
            return Effect.die("collision candidate must not execute")
          },
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "static-skill-agent", toolkit: Toolkit.make(echoTool) })

        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "activate" })))

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "echo",
            origins: [
              { _tag: "Static", agent: "static-skill-agent" },
              { _tag: "Skill", skill: "collision" },
            ],
          }),
        )
        expect(modelCalls).toBe(1)
        expect(bodyReads).toBe(0)
        expect(executorCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects collisions between activated skills in activation order", () => {
    let modelCalls = 0
    let secondBodyReads = 0
    const sharedTool = Tool.make("shared", { parameters: Schema.Unknown, success: Schema.Unknown })
    const first: SkillSource.Skill = {
      ...testSkill("first", "First shared tool", "first body"),
      tools: [sharedTool],
    }
    const second: SkillSource.Skill = {
      ...testSkill("second", "Second shared tool", "second body"),
      body: Effect.sync(() => {
        secondBodyReads += 1
        return "second body"
      }),
      tools: [sharedTool],
    }
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(
            toolCallPart(`activate-${modelCalls}`, "activate_skill", { name: modelCalls === 1 ? "first" : "second" }),
          )
        }),
        SkillSource.fromSkills([first, second]),
        unusedExecutor,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          Stream.runDrain(Agent.stream(Agent.make({ name: "skill-skill-agent" }), { prompt: "activate both" })),
        )

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "shared",
            origins: [
              { _tag: "Skill", skill: "first" },
              { _tag: "Skill", skill: "second" },
            ],
          }),
        )
        expect(modelCalls).toBe(2)
        expect(secondBodyReads).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "isolates activated tool registries across concurrent runs", () => {
    const skillTool = Tool.make("skill_only", { parameters: Schema.Unknown, success: Schema.Unknown })
    const skill: SkillSource.Skill = {
      ...testSkill("isolated", "Run-local tools", "isolated body"),
      tools: [skillTool],
    }
    let activationTurns = 0
    const plainRunTools: Array<ReadonlyArray<string>> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = Json.stringify(options.prompt.content)
          const names = options.tools.map((tool) => tool.name)
          if (content.includes("plain run")) {
            plainRunTools.push(names)
            return Stream.make(textDelta("plain"))
          }
          activationTurns += 1
          return activationTurns === 1
            ? Stream.make(toolCallPart("activate-isolated", "activate_skill", { name: "isolated" }))
            : Stream.make(textDelta("activated"))
        }),
        SkillSource.fromSkills([skill]),
        unusedExecutor,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "concurrent-skill-agent" })
        yield* Effect.all(
          [
            Stream.runDrain(Agent.stream(agent, { prompt: "activation run" })),
            Stream.runDrain(Agent.stream(agent, { prompt: "plain run" })),
          ],
          { concurrency: 2 },
        )

        expect(plainRunTools).toEqual([["activate_skill"]])
        expect(activationTurns).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "does not dispatch a newly activated tool in the turn that advertised only activate_skill", () => {
    let modelCalls = 0
    let executorCalls = 0
    const skillTool = Tool.make("new_skill_tool", { parameters: Schema.Unknown, success: Schema.Unknown })
    const skill: SkillSource.Skill = {
      ...testSkill("same-turn", "Contributes a tool", "same turn body"),
      tools: [skillTool],
    }
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.fromIterable([
                toolCallPart("activate-same-turn", "activate_skill", { name: "same-turn" }),
                toolCallPart("call-new-tool", "new_skill_tool", {}),
              ])
            : Stream.make(textDelta("done"))
        }),
        SkillSource.fromSkills([skill]),
        ToolExecutor.testLayer({
          execute: () => {
            executorCalls += 1
            return Effect.succeed({ _tag: "Success", result: "unexpected", encodedResult: "unexpected" })
          },
        }),
      ),
      Effect.gen(function* () {
        const failure = yield* Agent.stream(Agent.make({ name: "same-turn-agent" }), {
          prompt: "activate and call",
        }).pipe(Stream.runDrain, Effect.flip)

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(executorCalls).toBe(0)
        expect(modelCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "restores activated tool metadata before resuming its suspended call", () => {
    let modelCalls = 0
    let executorCalls = 0
    let bodyReads = 0
    let suspendedTranscript: Prompt.Prompt | undefined
    const resumableTool = Tool.make("resumable_skill_tool", { parameters: Schema.Unknown, success: Schema.Unknown })
    const skill: SkillSource.Skill = {
      ...testSkill("resumable", "Contributes a resumable tool", "unused"),
      body: Effect.sync(() => {
        bodyReads += 1
        return "checkpointed body"
      }),
      tools: [resumableTool],
    }
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(toolCallPart("activate-resumable", "activate_skill", { name: "resumable" }))
          }
          if (modelCalls === 2) return Stream.make(toolCallPart("resumable-call", "resumable_skill_tool", {}))
          return Stream.make(textDelta("resumed"))
        }),
        SkillSource.fromSkills([skill]),
        ToolExecutor.testLayer({
          execute: () => {
            executorCalls += 1
            return executorCalls === 1
              ? Effect.succeed({ _tag: "Suspend", token: "resume-skill" })
              : Effect.succeed({ _tag: "Success", result: "restored", encodedResult: "restored" })
          },
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resumable-skill-agent" })
        const failure = yield* Agent.stream(agent, { prompt: "activate resumable" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") suspendedTranscript = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )

        expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
        if (suspendedTranscript === undefined) return yield* Effect.die("missing activated skill checkpoint")

        const resumed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: suspendedTranscript,
            resume: { call: { id: "resumable-call", name: "resumable_skill_tool", params: {} } },
          }),
        )

        expect(resumed.at(-1)?._tag).toBe("Completed")
        expect(executorCalls).toBe(2)
        expect(bodyReads).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "keeps runs without SkillSource unchanged", () => {
    let capturedPrompt = ""
    let capturedTools: ReadonlyArray<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedPrompt = Json.stringify(options.prompt.content)
          capturedTools = options.tools.map((tool) => tool.name)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-skills-agent", instructions: "plain instructions" })

        const result = yield* Agent.generate(agent, { prompt: "hello" })

        expect(result.text).toBe("done")
        expect(capturedPrompt).toBe(
          `[{"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","options":{},"role":"system","content":"plain instructions"},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{}}],"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user","options":{}}]`,
        )
        expect(capturedTools).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "preserves empty system instructions without SkillSource", () => {
    let capturedPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "empty-system-agent", instructions: "" })

        const result = yield* Agent.generate(agent, { prompt: "hello" })

        expect(result.text).toBe("done")
        expect(capturedPrompt).toBe(
          `[{"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","options":{},"role":"system","content":""},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{}}],"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user","options":{}}]`,
        )
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces finish usage while preserving raw finish parts", () => {
    const reportedUsage = usage({ total: 12, cacheRead: 2 }, { total: 5, text: 4 })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fromIterable([textDelta("done"), finishPart("stop", reportedUsage)])),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "usage-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "report usage" }))

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelPart",
          "ModelPart",
          "TurnCompleted",
          "Completed",
        ])
        const finishModelPart = events.find((event) => event._tag === "ModelPart" && event.part.type === "finish")
        expect(finishModelPart?._tag === "ModelPart" && finishModelPart.part.type === "finish").toBe(true)
        const turnCompleted = events.find((event) => event._tag === "TurnCompleted")
        if (turnCompleted?._tag === "TurnCompleted") {
          expect(turnCompleted.usage).toEqual(reportedUsage)
          expect(turnCompleted.finishReason).toBe("stop")
        }
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.usage).toEqual(reportedUsage)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "executes tool-call stream parts through ToolExecutor", () => {
    let calls = 0
    let secondCallSawToolResult = false
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
          }
          secondCallSawToolResult = Json.stringify(options.prompt.content).includes("from model")
          return Stream.make(textDelta("after tool"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "tool-test-agent",
          toolkit: Toolkit.make(echoTool),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

        expect(calls).toBe(2)
        expect(secondCallSawToolResult).toBe(true)
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(2)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
        const completed = events.at(-1)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("after tool")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "provides ToolContext to executors and emits ToolProgress events", () => {
    let calls = 0
    let requestSessionId = ""
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-context", "echo", { text: "from model" }))
            : Stream.make(textDelta("after context"))
        }),
        ToolExecutor.testLayer({
          execute: (request) =>
            Effect.gen(function* () {
              requestSessionId = request.sessionId
              const context = yield* ToolContext.ToolContext
              expect(context.sessionId).toBe("session-1")
              expect(context.signal.aborted).toBe(false)
              yield* context.emit({
                toolCallId: request.call.id,
                message: "working",
                data: { phase: "started" },
              })
              return { _tag: "Success", result: { ok: true }, encodedResult: { ok: true } }
            }),
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "context-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "use the context tool", sessionId: "session-1" }),
        )

        const tags = events.map((event) => event._tag)
        expect(requestSessionId).toBe("session-1")
        expect(tags.indexOf("ToolExecutionStarted")).toBeLessThan(tags.indexOf("ToolProgress"))
        expect(tags.indexOf("ToolProgress")).toBeLessThan(tags.indexOf("ToolExecutionCompleted"))
        const progress = events.find((event) => event._tag === "ToolProgress")
        if (progress?._tag === "ToolProgress") {
          expect(progress.turn).toBe(0)
          expect(progress.toolCallId).toBe("tool-call-context")
          expect(progress.message).toBe("working")
          expect(progress.data).toEqual({ phase: "started" })
        }
      }),
    ] as const
  })

  ItLayer.make(it, "backpressures tool progress at the configured capacity", () => {
    let calls = 0
    let firstProgress!: Deferred.Deferred<void>
    let releaseConsumer!: Deferred.Deferred<void>
    let thirdOfferStarted!: Deferred.Deferred<void>
    let thirdOfferCompleted!: Deferred.Deferred<void>
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          firstProgress = yield* Deferred.make<void>()
          releaseConsumer = yield* Deferred.make<void>()
          thirdOfferStarted = yield* Deferred.make<void>()
          thirdOfferCompleted = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return calls === 1
                ? Stream.make(toolCallPart("tool-call-backpressure", "echo", { text: "from model" }))
                : Stream.make(textDelta("after progress"))
            }),
            ToolExecutor.testLayer({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  yield* context.emit({ toolCallId: "tool-call-backpressure", message: "one" })
                  yield* context.emit({ toolCallId: "tool-call-backpressure", message: "two" })
                  yield* Deferred.succeed(thirdOfferStarted, undefined)
                  yield* context.emit({ toolCallId: "tool-call-backpressure", message: "three" })
                  yield* Deferred.succeed(thirdOfferCompleted, undefined)
                  return { _tag: "Success", result: { ok: true }, encodedResult: { ok: true } }
                }),
            }),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "backpressure-agent", toolkit: Toolkit.make(echoTool) })
        const run = Agent.stream(agent, {
          prompt: "use the tool",
          toolProgress: { _tag: "Backpressure", capacity: 1 },
        }).pipe(
          Stream.runForEach((event) =>
            event._tag !== "ToolProgress" || event.message !== "one"
              ? Effect.void
              : Deferred.succeed(firstProgress, undefined).pipe(Effect.andThen(Deferred.await(releaseConsumer))),
          ),
        )
        const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(firstProgress)
        yield* Deferred.await(thirdOfferStarted)
        yield* Effect.yieldNow
        expect(yield* Deferred.isDone(thirdOfferCompleted)).toBe(false)

        yield* Deferred.succeed(releaseConsumer, undefined)
        yield* Fiber.join(fiber)
        expect(yield* Deferred.isDone(thirdOfferCompleted)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "bounds tool progress with backpressure by default", () => {
    let calls = 0
    let firstProgress!: Deferred.Deferred<void>
    let releaseConsumer!: Deferred.Deferred<void>
    let overflowOfferStarted!: Deferred.Deferred<void>
    let overflowOfferCompleted!: Deferred.Deferred<void>
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          firstProgress = yield* Deferred.make<void>()
          releaseConsumer = yield* Deferred.make<void>()
          overflowOfferStarted = yield* Deferred.make<void>()
          overflowOfferCompleted = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return calls === 1
                ? Stream.make(toolCallPart("tool-call-default-progress", "echo", { text: "from model" }))
                : Stream.make(textDelta("after progress"))
            }),
            ToolExecutor.testLayer({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  for (let index = 0; index < 66; index += 1) {
                    if (index === 65) yield* Deferred.succeed(overflowOfferStarted, undefined)
                    yield* context.emit({ toolCallId: "tool-call-default-progress", message: String(index) })
                    if (index === 0) yield* Deferred.await(firstProgress)
                    if (index === 65) yield* Deferred.succeed(overflowOfferCompleted, undefined)
                  }
                  return { _tag: "Success", result: { ok: true }, encodedResult: { ok: true } }
                }),
            }),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "default-progress-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Agent.stream(agent, { prompt: "use the tool" }).pipe(
          Stream.runForEach((event) =>
            event._tag !== "ToolProgress" || event.message !== "0"
              ? Effect.void
              : Deferred.succeed(firstProgress, undefined).pipe(Effect.andThen(Deferred.await(releaseConsumer))),
          ),
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(firstProgress)
        yield* Deferred.await(overflowOfferStarted)
        yield* Effect.yieldNow
        expect(yield* Deferred.isDone(overflowOfferCompleted)).toBe(false)

        yield* Deferred.succeed(releaseConsumer, undefined)
        yield* Fiber.join(fiber)
        expect(yield* Deferred.isDone(overflowOfferCompleted)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "makes dropping and sliding progress loss observable", () => {
    let calls = 0
    let consumerStarted!: Deferred.Deferred<void>
    let producerFinished!: Deferred.Deferred<void>
    let releaseConsumer!: Deferred.Deferred<void>
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls % 2 === 1
            ? Stream.make(toolCallPart(`tool-call-lossy-${calls}`, "echo", { text: "from model" }))
            : Stream.make(textDelta("after progress"))
        }),
        ToolExecutor.testLayer({
          execute: (request) =>
            Effect.gen(function* () {
              const context = yield* ToolContext.ToolContext
              yield* context.emit({ toolCallId: request.call.id, message: "one" })
              yield* Deferred.await(consumerStarted)
              yield* context.emit({ toolCallId: request.call.id, message: "two" })
              yield* context.emit({ toolCallId: request.call.id, message: "three" })
              yield* Deferred.succeed(producerFinished, undefined)
              return { _tag: "Success", result: { ok: true }, encodedResult: { ok: true } }
            }),
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "lossy-progress-agent", toolkit: Toolkit.make(echoTool) })

        const run = (policy: Agent.ProgressOverflowPolicy) =>
          Effect.gen(function* () {
            consumerStarted = yield* Deferred.make<void>()
            producerFinished = yield* Deferred.make<void>()
            releaseConsumer = yield* Deferred.make<void>()
            const fiber = yield* Agent.stream(agent, { prompt: "use the tool", toolProgress: policy }).pipe(
              Stream.tap((event) =>
                event._tag !== "ToolProgress" || event.message !== "one"
                  ? Effect.void
                  : Deferred.succeed(consumerStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseConsumer))),
              ),
              Stream.runCollect,
              Effect.forkChild({ startImmediately: true }),
            )
            yield* Deferred.await(producerFinished)
            yield* Deferred.succeed(releaseConsumer, undefined)
            return yield* Fiber.join(fiber)
          })

        const droppingEvents = yield* run({ _tag: "Dropping", capacity: 1 })
        const slidingEvents = yield* run({ _tag: "Sliding", capacity: 1 })

        expect(progressMessages(droppingEvents)).toEqual(["one", "two"])
        expect(progressMessages(slidingEvents)).toEqual(["one", "three"])
        expect(toolCompletionMetadata(droppingEvents)).toEqual({ toolProgress: { dropped: 1 } })
        expect(toolCompletionMetadata(slidingEvents)).toEqual({ toolProgress: { dropped: 1 } })
      }),
    ] as const
  })

  ItLayer.make(it, "fails with a typed error when the progress fail policy overflows", () => {
    let calls = 0
    const seen: Array<AgentEvent.Event> = []
    let overflowReached!: Deferred.Deferred<void>
    let executionFinalized!: Deferred.Deferred<void>
    let consumerStarted!: Deferred.Deferred<void>
    let releaseConsumer!: Deferred.Deferred<void>
    let toolSignal!: AbortSignal
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          overflowReached = yield* Deferred.make<void>()
          executionFinalized = yield* Deferred.make<void>()
          consumerStarted = yield* Deferred.make<void>()
          releaseConsumer = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return calls === 1
                ? Stream.make(toolCallPart("tool-call-fail-progress", "echo", { text: "from model" }))
                : Stream.make(textDelta("unexpected"))
            }),
            ToolExecutor.testLayer({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  toolSignal = context.signal
                  yield* context.emit({ toolCallId: "tool-call-fail-progress", message: "one" })
                  yield* Deferred.await(consumerStarted)
                  yield* context.emit({ toolCallId: "tool-call-fail-progress", message: "two" })
                  yield* context.emit({ toolCallId: "tool-call-fail-progress", message: "three" })
                  yield* Deferred.succeed(overflowReached, undefined)
                  return yield* Effect.never
                }).pipe(Effect.ensuring(Deferred.succeed(executionFinalized, undefined))),
            }),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "fail-progress-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Agent.stream(agent, {
          prompt: "use the tool",
          toolProgress: { _tag: "Fail", capacity: 1 },
        }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => seen.push(event)).pipe(
              Effect.andThen(
                event._tag === "ToolProgress" && event.message === "one"
                  ? Deferred.succeed(consumerStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseConsumer)))
                  : Effect.void,
              ),
            ),
          ),
          Stream.runDrain,
          Effect.flip,
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(overflowReached)
        yield* Deferred.succeed(releaseConsumer, undefined)
        const failure = yield* Fiber.join(fiber)
        yield* Deferred.await(executionFinalized)

        expect(failure).toBeInstanceOf(AgentEvent.ProgressOverflowError)
        if (Schema.is(AgentEvent.ProgressOverflowError)(failure)) {
          expect(failure.turn).toBe(0)
          expect(failure.toolCallId).toBe("tool-call-fail-progress")
          expect(failure.capacity).toBe(1)
        }
        expect(progressMessages(seen)).toEqual(["one", "two"])
        expect(seen.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
        expect(calls).toBe(1)
        expect(toolSignal.aborted).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "drains progress before a tool failure completes", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-progress-failure", "echo", { text: "from model" }))
            : Stream.make(textDelta("after failure"))
        }),
        ToolExecutor.testLayer({
          execute: () =>
            Effect.gen(function* () {
              const context = yield* ToolContext.ToolContext
              yield* context.emit({ toolCallId: "tool-call-progress-failure", message: "before failure" })
              return { _tag: "Failure", message: "tool failed" }
            }),
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "progress-failure-agent", toolkit: Toolkit.make(echoTool) })
        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "use the tool",
            toolProgress: { _tag: "Backpressure", capacity: 1 },
          }),
        )
        const tags = events.map((event) => event._tag)
        const completion = events.find((event) => event._tag === "ToolExecutionCompleted")

        expect(tags.indexOf("ToolProgress")).toBeLessThan(tags.indexOf("ToolExecutionCompleted"))
        expect(completion?._tag === "ToolExecutionCompleted" && completion.result.isFailure).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupts the producer and shuts down progress when the event stream is abandoned", () => {
    let calls = 0
    let thirdOfferStarted!: Deferred.Deferred<void>
    let thirdOfferCompleted!: Deferred.Deferred<void>
    let executionFinalized!: Deferred.Deferred<void>
    let consumerStarted!: Deferred.Deferred<void>
    let toolSignal!: AbortSignal
    let toolContext!: ToolContext.Interface
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          thirdOfferStarted = yield* Deferred.make<void>()
          thirdOfferCompleted = yield* Deferred.make<void>()
          executionFinalized = yield* Deferred.make<void>()
          consumerStarted = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return Stream.make(toolCallPart("tool-call-abandoned-progress", "echo", { text: "from model" }))
            }),
            ToolExecutor.testLayer({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  toolContext = context
                  toolSignal = context.signal
                  yield* context.emit({ toolCallId: "tool-call-abandoned-progress", message: "one" })
                  yield* Deferred.await(consumerStarted)
                  yield* context.emit({ toolCallId: "tool-call-abandoned-progress", message: "two" })
                  yield* Deferred.succeed(thirdOfferStarted, undefined)
                  yield* context.emit({ toolCallId: "tool-call-abandoned-progress", message: "three" })
                  yield* Deferred.succeed(thirdOfferCompleted, undefined)
                  return {
                    _tag: "Success",
                    result: { ok: true },
                    encodedResult: { ok: true },
                  } satisfies ToolExecutor.Outcome
                }).pipe(Effect.ensuring(Deferred.succeed(executionFinalized, undefined))),
            }),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "abandoned-progress-agent", toolkit: Toolkit.make(echoTool) })

        yield* Agent.stream(agent, {
          prompt: "use the tool",
          toolProgress: { _tag: "Backpressure", capacity: 1 },
        }).pipe(
          Stream.tap((event) =>
            event._tag === "ToolProgress"
              ? Deferred.succeed(consumerStarted, undefined).pipe(Effect.andThen(Deferred.await(thirdOfferStarted)))
              : Effect.void,
          ),
          Stream.takeUntil((event) => event._tag === "ToolProgress"),
          Stream.runDrain,
        )

        yield* Deferred.await(executionFinalized)
        expect(yield* Deferred.isDone(thirdOfferCompleted)).toBe(false)
        expect(toolSignal.aborted).toBe(true)
        yield* toolContext.emit({ toolCallId: "tool-call-abandoned-progress", message: "after cancellation" })
      }),
    ] as const
  })

  ItLayer.make(it, "provides ToolContext to default toolkit handlers", () => {
    let calls = 0
    let handlerSessionId = ""
    const handledTool = Tool.make("handled-context", {
      description: "Reads Baton ToolContext from a toolkit handler",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      dependencies: [ToolContext.ToolContext],
    })
    const toolkit = Toolkit.make(handledTool)
    const handlers = toolkit.toLayer({
      "handled-context": () =>
        Effect.gen(function* () {
          const context = yield* ToolContext.ToolContext
          handlerSessionId = context.sessionId
          yield* context.emit({ toolCallId: "tool-call-handled-context", message: "from handler" })
          return { ok: true }
        }),
    })
    return [
      Layer.mergeAll(
        handlers,
        ToolExecutor.fromToolkit(toolkit).pipe(Layer.provide(handlers)),
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-handled-context", "handled-context", { text: "from model" }))
            : Stream.make(textDelta("after handler"))
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "toolkit-context-agent", toolkit })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "use handler", sessionId: "session-toolkit" }),
        )

        expect(handlerSessionId).toBe("session-toolkit")
        expect(events.some((event) => event._tag === "ToolProgress")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "passes sessionId to approvals for gated tools", () => {
    let calls = 0
    let approvalSessionId = ""
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-gated-session", "gated", { text: "from model" }))
            : Stream.make(textDelta("after denial"))
        }),
        unusedExecutor,
        Approvals.testLayer({
          check: (request) => {
            approvalSessionId = request.sessionId
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "gated-session-agent", toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "needs approval", sessionId: "session-approval" }),
        )

        expect(approvalSessionId).toBe("session-approval")
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "denies through Permissions before approvals or executor", () => {
    let calls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-permission-deny", "gated", { text: "blocked" }))
          }
          secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("saw denied permission"))
        }),
        ToolExecutor.testLayer({ execute: () => Effect.die("permission-denied call must not execute") }),
        Approvals.testLayer({ check: () => Effect.die("permission-denied call must not ask approvals") }),
        Permissions.fromRuleset({ rules: [{ pattern: "gated", level: "deny" }] }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-deny-agent", toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs permission" }))

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        const denied = events.find((event) => event._tag === "ToolExecutionCompleted")
        if (denied?._tag === "ToolExecutionCompleted") {
          expect(denied.result.isFailure).toBe(true)
          expect(Json.stringify(denied.result.encodedResult)).toContain("Permission denied")
        }
        expect(secondPrompt).toContain("Permission denied")
      }),
    ] as const
  })

  ItLayer.make(it, "allows through Permissions while preserving tool-declared approvals", () => {
    let calls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-permission-allow", "gated", { text: "still gated" }))
          }
          secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("saw approval denial"))
        }),
        ToolExecutor.testLayer({ execute: () => Effect.die("approval-denied call must not execute") }),
        Approvals.denyAll,
        Permissions.allowAll,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-allow-agent", toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs approval" }))

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(secondPrompt).toContain("Tool call denied")
      }),
    ] as const
  })

  ItLayer.make(it, "suspends permission asks through the existing approval suspension path", () => {
    const events: Array<AgentEvent.Event> = []
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-permission-ask", "gated", { text: "ask" }))),
        ToolExecutor.testLayer({ execute: () => Effect.die("permission ask must not execute") }),
        Approvals.testLayer({ check: () => Effect.die("permission ask must not ask approvals") }),
        Permissions.fromRuleset({ rules: [], fallback: "ask" }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-ask-agent", toolkit: Toolkit.make(gatedTool) })

        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "needs permission" }), (event) =>
            Effect.sync(() => {
              events.push(event)
            }),
          ),
        )

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelPart",
          "ApprovalRequested",
          "TurnCompleted",
        ])
        expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
        if (failure._tag === "@batonfx/core/AgentSuspended") {
          expect(failure.reason).toBe("approval")
          expect(failure.token).toBe("permission:tool-call-permission-ask")
          expect(failure.tool_name).toBe("gated")
          expect(failure.tool_params).toEqual({ text: "ask" })
        }
      }),
    ] as const
  })

  ItLayer.make(it, "executes permission Approved answers without consulting Approvals again", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-permission-approved", "gated", { text: "approved" }))
            : Stream.make(textDelta("after approved permission"))
        }),
        echoExecutor,
        Approvals.testLayer({ check: () => Effect.die("permission-approved call must not ask approvals") }),
        Permissions.interactive({
          ruleset: { rules: [], fallback: "ask" },
          onAsk: () => Effect.succeed({ _tag: "Approved" }),
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-approved-agent", toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "ask then approve" }))

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "remembers Always answers through the optional RuleStore", () => {
    let calls = 0
    const remembered: Array<Permissions.Rule> = []
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-permission-always", "gated", { text: "always" }))
            : Stream.make(textDelta("after always"))
        }),
        echoExecutor,
        Approvals.testLayer({ check: () => Effect.die("permission-always call must not ask approvals") }),
        Permissions.interactive({
          ruleset: { rules: [], fallback: "ask" },
          onAsk: () => Effect.succeed({ _tag: "Always" }),
        }),
        Permissions.ruleStoreTestLayer({
          remember: (rule) =>
            Effect.sync(() => {
              remembered.push(rule)
            }),
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-always-agent", toolkit: Toolkit.make(gatedTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "ask always" }))

        expect(remembered).toEqual([{ pattern: "gated", level: "allow" }])
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "preserves completion behavior when Steering is absent", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-steering-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete" }))

        expect(calls).toBe(1)
        expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
      }),
    ] as const
  })

  ItLayer.make(it, "leaves Session untouched when Compaction is absent", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("done"))
        }),
        Session.memoryLayer,
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-compaction-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete" }))
        const session = yield* Session.SessionStore

        expect(calls).toBe(1)
        expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
        expect(yield* session.path()).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "does not duplicate a pre-populated Session path when Compaction is active", () => {
    let calls = 0
    const seed = Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "seed" })] })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("done"))
        }),
        Session.memoryLayer,
        Compaction.testLayer({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const session = yield* Session.SessionStore
        yield* session.append({ _tag: "Message", message: seed })
        const agent = Agent.make({ name: "prepopulated-session-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "next", history: Prompt.fromMessages([seed]) }),
        )
        const path = yield* session.path()
        const seedEntries = path.filter(
          (entry) => entry._tag === "Message" && Json.stringify(entry.message.content).includes("seed"),
        )

        expect(calls).toBe(1)
        expect(seedEntries).toHaveLength(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "applies proactive compaction before a model call", () => {
    let prompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          prompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        Compaction.testLayer({
          maybeCompact: () =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact",
                history: Prompt.make("compacted history"),
                prompt: Prompt.make("compacted prompt"),
              }),
            ),
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "proactive-compaction-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "original prompt", compaction: { contextWindow: 10 } }),
        )

        expect(prompt).toContain("compacted history")
        expect(prompt).toContain("compacted prompt")
        expect(prompt).not.toContain("original prompt")
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "uses serialized prompt length without a Tokenizer after stale low provider usage", () => {
    let streamCalls = 0
    let secondPrompt = ""
    const measuredTokens: Array<number> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          streamCalls += 1
          if (streamCalls === 1) {
            return Stream.make(
              toolCallPart("tool-call-current-prompt", "echo", { text: "expand" }),
              finishPart("stop", usage({ total: 1 }, { total: 1 })),
            )
          }
          secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        ToolExecutor.testLayer({
          execute: () =>
            Effect.succeed({
              _tag: "Success",
              result: "x".repeat(800),
              encodedResult: "x".repeat(800),
            }),
        }),
        Compaction.testLayer({
          maybeCompact: (request) =>
            Effect.sync(() => {
              measuredTokens.push(request.usage.contextTokens)
              return request.usage.contextTokens > 200
                ? Option.some({
                    _tag: "Microcompact",
                    history: Prompt.empty,
                    prompt: Prompt.make("threshold compaction"),
                  })
                : Option.none()
            }),
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "current-prompt-compaction-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "short", compaction: { contextWindow: 200 } }),
        )

        expect(streamCalls).toBe(2)
        expect(measuredTokens[0]).toBeLessThan(200)
        expect(measuredTokens[1]).toBeGreaterThan(200)
        expect(secondPrompt).toContain("threshold compaction")
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "remeasures rebuilt context after compaction", () => {
    let streamCalls = 0
    const measuredTokens: Array<number> = []
    return [
      Layer.mergeAll(
        modelLayer(() => {
          streamCalls += 1
          return streamCalls === 1
            ? Stream.make(
                toolCallPart("tool-call-after-compaction", "echo", { text: "small" }),
                finishPart("stop", usage({ total: 9_999 }, { total: 1 })),
              )
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Compaction.testLayer({
          maybeCompact: (request) =>
            Effect.sync(() => {
              measuredTokens.push(request.usage.contextTokens)
              return measuredTokens.length === 1
                ? Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("compacted") })
                : Option.none()
            }),
        }),
        characterTokenizerLayer,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "post-compaction-measurement-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "x".repeat(800), compaction: { contextWindow: 10_000 } }),
        )

        expect(streamCalls).toBe(2)
        expect(measuredTokens[0]).toBeGreaterThan(800)
        expect(measuredTokens[1]).toBeLessThan(1_000)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "summarizes through the default Compaction layer and records a session boundary", () => {
    let streamCalls = 0
    let summaryCalls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer(
          (options) => {
            streamCalls += 1
            if (streamCalls === 1) {
              return Stream.make(
                toolCallPart("tool-call-compact-summary", "echo", { text: "needs summary" }),
                finishPart("stop", usage({ total: 100 }, { total: 1 })),
              )
            }
            secondPrompt = Json.stringify(options.prompt.content)
            return Stream.make(textDelta("after compaction"))
          },
          (options) => {
            summaryCalls += 1
            expect(options.toolChoice).toBe("none")
            return Effect.succeed([{ type: "text", text: "checkpoint summary" }])
          },
        ),
        echoExecutor,
        Approvals.autoApprove,
        Session.memoryLayer,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "default-compaction-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "old context" }))
        const session = yield* Session.SessionStore
        const path = yield* session.path()

        expect(streamCalls).toBe(2)
        expect(summaryCalls).toBe(1)
        expect(secondPrompt).toContain("<conversation-checkpoint>")
        expect(secondPrompt).toContain("checkpoint summary")
        expect(secondPrompt).toContain("tool-call-compact-summary")
        expect(path.some((entry) => entry._tag === "Compaction")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps the seeded system message after a Summarize compaction", () => {
    let streamCalls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer(
          (options) => {
            streamCalls += 1
            if (streamCalls === 1) {
              return Stream.make(
                toolCallPart("tool-call-system-compact", "echo", { text: "needs summary" }),
                finishPart("stop", usage({ total: 100 }, { total: 1 })),
              )
            }
            secondPrompt = Json.stringify(options.prompt.content)
            return Stream.make(textDelta("after compaction"))
          },
          () => Effect.succeed([{ type: "text", text: "checkpoint summary" }]),
        ),
        echoExecutor,
        Approvals.autoApprove,
        Session.memoryLayer,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "system-compaction-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "old context", system: "You are a careful test agent" }),
        )

        expect(streamCalls).toBe(2)
        expect(secondPrompt).toContain("<conversation-checkpoint>")
        expect(secondPrompt).toContain("You are a careful test agent")
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "uses Compaction layer reserveTokens instead of the Agent default", () => {
    let streamCalls = 0
    let summaryCalls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer(
          (options) => {
            streamCalls += 1
            if (streamCalls === 1) {
              return Stream.make(
                toolCallPart("tool-call-reserve", "echo", { text: "reserve" }),
                finishPart("stop", usage({ total: 10_000 }, { total: 1 })),
              )
            }
            secondPrompt = Json.stringify(options.prompt.content)
            return Stream.make(textDelta("after reserve"))
          },
          () => {
            summaryCalls += 1
            return Effect.succeed([{ type: "text", text: "unexpected summary" }])
          },
        ),
        echoExecutor,
        Approvals.autoApprove,
        Session.memoryLayer,
        Compaction.layer({ contextWindow: 20_000, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reserve-compaction-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "old context" }))

        expect(streamCalls).toBe(2)
        expect(summaryCalls).toBe(0)
        expect(secondPrompt).not.toContain("<conversation-checkpoint>")
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "reactively compacts and retries a pre-emission overflow once", () => {
    let calls = 0
    let overflowRequests = 0
    let retriedPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) return Stream.fail(contextOverflowError("maximum context length exceeded"))
          retriedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("recovered"))
        }),
        Compaction.testLayer({
          maybeCompact: (request) =>
            Effect.sync(() => {
              if (request.overflow) overflowRequests += 1
              return Option.some({
                _tag: "Microcompact",
                history: Prompt.empty,
                prompt: Prompt.make("after overflow"),
              })
            }),
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reactive-compaction-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "too large" }))

        expect(calls).toBe(2)
        expect(overflowRequests).toBe(1)
        expect(retriedPrompt).toContain("after overflow")
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "fails after one reactive compaction retry", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.fail(contextOverflowError("context window overflow"))
        }),
        Compaction.testLayer({
          maybeCompact: () =>
            Effect.succeed(Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") })),
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reactive-compaction-fail-agent" })

        const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "too large" })))

        expect(calls).toBe(2)
        expect(error._tag).toBe("@batonfx/core/AgentError")
      }),
    ] as const
  })

  ItLayer.make(it, "does not retry overflow after partial emission", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.concat(
            Stream.make(textDelta("partial")),
            Stream.fail(contextOverflowError("context length exceeded")),
          )
        }),
        Compaction.testLayer({
          maybeCompact: () =>
            Effect.succeed(Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") })),
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "partial-overflow-agent" })

        const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial" })))

        expect(calls).toBe(1)
        expect(error._tag).toBe("@batonfx/core/AgentError")
      }),
    ] as const
  })

  ItLayer.make(it, "drains steering after tool calls and before tool results", () => {
    let calls = 0
    let secondMessages: ReadonlyArray<Prompt.Message> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-steer", "echo", { text: "from model" }))
          }
          secondMessages = options.prompt.content
          return Stream.make(textDelta("after steering"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        Steering.layer({ steering: { mode: "all" } }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.steer({ prompt: "steer one" })
        yield* steering.steer({ prompt: "steer two" })
        const agent = Agent.make({ name: "steering-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool" }))

        expect(calls).toBe(2)
        const secondPrompt = Json.stringify(secondMessages)
        expect(secondPrompt).toContain("steer one")
        expect(secondPrompt).toContain("steer two")
        expect(secondPrompt).toContain("from model")
        const toolCallIndex = secondMessages.findIndex((message) => message.role === "assistant")
        const steerOneIndex = secondMessages.findIndex((message) =>
          Json.stringify(message.content).includes("steer one"),
        )
        const steerTwoIndex = secondMessages.findIndex((message) =>
          Json.stringify(message.content).includes("steer two"),
        )
        const toolResultIndex = secondMessages.findIndex((message) => message.role === "tool")
        expect(toolCallIndex).toBeGreaterThanOrEqual(0)
        expect(steerOneIndex).toBeGreaterThan(toolCallIndex)
        expect(steerTwoIndex).toBeGreaterThan(steerOneIndex)
        expect(toolResultIndex).toBeGreaterThan(steerTwoIndex)
        const drained = events.find((event) => event._tag === "SteeringDrained")
        expect(drained).toMatchObject({ _tag: "SteeringDrained", turn: 0, queue: "steering", count: 2 })
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "steering one-at-a-time leaves later steering queued", () => {
    let calls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-steering-one", "echo", { text: "from model" }))
          }
          secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("after first steering"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        Steering.layer({ steering: { mode: "one-at-a-time" } }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.steer({ prompt: "first steer" })
        yield* steering.steer({ prompt: "second steer" })
        const agent = Agent.make({ name: "steering-one-agent", toolkit: Toolkit.make(echoTool) })

        yield* Stream.runDrain(Agent.stream(agent, { prompt: "use tool" }))
        const remaining = yield* steering.takeSteering

        expect(secondPrompt).toContain("first steer")
        expect(secondPrompt).not.toContain("second steer")
        expect(remaining.map((message) => message.prompt)).toEqual(["second steer"])
      }),
    ] as const
  })

  ItLayer.make(it, "drains follow-up only when the run would otherwise complete", () => {
    let calls = 0
    const prompts: Array<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          prompts.push(Json.stringify(options.prompt.content))
          calls += 1
          return Stream.make(textDelta(`turn ${calls}`))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        Steering.layer(),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.followUp({ prompt: "follow one" })
        yield* steering.followUp({ prompt: "follow two" })
        const agent = Agent.make({ name: "follow-up-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "start" }))

        expect(calls).toBe(3)
        expect(prompts[1]).toContain("follow one")
        expect(prompts[2]).toContain("follow two")
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(3)
        expect(events.filter((event) => event._tag === "SteeringDrained" && event.queue === "followUp")).toHaveLength(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
      }),
    ] as const
  })

  ItLayer.make(it, "follow-up all mode combines queued follow-ups into one next turn", () => {
    let calls = 0
    let secondPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 2) secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta(`turn ${calls}`))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        Steering.layer({ followUp: { mode: "all" } }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.followUp({ prompt: "follow one" })
        yield* steering.followUp({ prompt: "follow two" })
        const agent = Agent.make({ name: "follow-up-all-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "start" }))

        expect(calls).toBe(2)
        expect(secondPrompt).toContain("follow one")
        expect(secondPrompt).toContain("follow two")
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "follow-up delays terminal structured output until follow-up is drained", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(
          () => {
            calls += 1
            return Stream.make(textDelta(`turn ${calls}`))
          },
          () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        Steering.layer(),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.followUp({ prompt: "follow before object" })
        const agent = Agent.make({ name: "follow-up-structured-agent" })

        const events = yield* Stream.runCollect(Agent.streamObject(agent, { prompt: "start", schema: objectSchema }))

        expect(calls).toBe(2)
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(2)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") expect(structured.turn).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting Agent.stream preserves undrained steering queues", () => {
    let started: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.fromEffect(
            started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
          ).pipe(Stream.drain, Stream.concat(Stream.never)),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        Steering.layer(),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const steering = yield* Steering.Steering
        yield* steering.steer({ prompt: "queued steering" })
        yield* steering.followUp({ prompt: "queued follow-up" })
        const agent = Agent.make({ name: "interrupt-steering-agent" })
        const run = Stream.runDrain(Agent.stream(agent, { prompt: "never finish" }))
        const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(currentStarted)
        yield* Fiber.interrupt(fiber)

        expect((yield* steering.takeSteering).map((message) => message.prompt)).toEqual(["queued steering"])
        expect((yield* steering.takeFollowUp).map((message) => message.prompt)).toEqual(["queued follow-up"])
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting Agent.stream while needsApproval awaits exits interrupted", () => {
    let started: Deferred.Deferred<void> | undefined
    const waitingApprovalTool = Tool.make("waiting-approval", {
      description: "Requires waiting approval",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      needsApproval: () =>
        Effect.gen(function* () {
          if (started === undefined) return yield* Effect.die("missing started Deferred")
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.never
        }),
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-waiting-approval", "waiting-approval", { text: "wait" }))),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({
          name: "interrupt-waiting-approval-agent",
          toolkit: Toolkit.make(waitingApprovalTool),
        })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "needs approval" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentStarted)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting Agent.stream before the first model part exits interrupted", () => {
    let started: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.fromEffect(
            started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
          ).pipe(Stream.drain, Stream.concat(Stream.never)),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({ name: "external-interrupt-model-stream-agent" })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "never emit" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentStarted)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves interrupt causes while needsApproval is evaluating", () => {
    let started: Deferred.Deferred<void> | undefined
    const interruptibleApprovalTool = Tool.make("interruptible-approval", {
      description: "Requires interruptible approval",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      needsApproval: () =>
        Effect.gen(function* () {
          if (started === undefined) return yield* Effect.die("missing started Deferred")
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.interrupt
        }),
    })
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.make(toolCallPart("tool-call-interrupt-approval", "interruptible-approval", { text: "wait" })),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({
          name: "interrupt-approval-agent",
          toolkit: Toolkit.make(interruptibleApprovalTool),
        })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "needs approval" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentStarted)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves interrupt causes before the first model part", () => {
    let started: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.fromEffect(
            started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
          ).pipe(Stream.drain, Stream.concat(Stream.fromEffect(Effect.interrupt))),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({ name: "interrupt-model-stream-agent" })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "never emit" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentStarted)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "aborts ToolContext signals when a running tool stream is interrupted", () => {
    let calls = 0
    let aborted = false
    let started!: Deferred.Deferred<void>
    return [
      Layer.unwrap(
        Deferred.make<void>().pipe(
          Effect.map((ready) => {
            started = ready
            return Layer.mergeAll(
              modelLayer(() => {
                calls += 1
                return Stream.make(toolCallPart("tool-call-abort", "echo", { text: "from model" }))
              }),
              ToolExecutor.testLayer({
                execute: () =>
                  Effect.gen(function* () {
                    const context = yield* ToolContext.ToolContext
                    context.signal.addEventListener("abort", () => {
                      aborted = true
                    })
                    yield* Deferred.succeed(started, undefined)
                    return yield* Effect.never
                    return { _tag: "Failure", message: "unreachable" }
                  }),
              }),
              Approvals.autoApprove,
              ModelMiddleware.identityLayer,
            )
          }),
        ),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "abort-agent", toolkit: Toolkit.make(echoTool) })
        const run = Stream.runDrain(Agent.stream(agent, { prompt: "abort the tool" }))

        const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        expect(aborted).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "spills large successful tool results before re-feeding them", () => {
    let calls = 0
    let stored: { readonly toolCallId: string; readonly content: unknown } | undefined
    let secondPrompt = ""
    const largeOutput = "x".repeat(256)
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-spill", "echo", { text: "from model" }))
          }
          secondPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("after spill"))
        }),
        ToolExecutor.testLayer({
          execute: () => Effect.succeed({ _tag: "Success", result: largeOutput, encodedResult: largeOutput }),
        }),
        ToolOutput.testLayer({
          put: (toolCallId, content) => {
            stored = { toolCallId, content }
            return Effect.succeed(Option.some(`mem:${toolCallId}`))
          },
        }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "spill-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "use big tool", sessionId: "spill-session", toolOutputMaxBytes: 48 }),
        )

        const completed = events.find((event) => event._tag === "ToolExecutionCompleted")
        expect(stored).toEqual({
          toolCallId: "tool-call-spill",
          content: { result: largeOutput, encodedResult: largeOutput },
        })
        if (completed?._tag === "ToolExecutionCompleted") {
          expect(completed.result.encodedResult).toMatchObject({
            inline: { truncated: true, maxBytes: 48 },
            outputPaths: ["mem:tool-call-spill"],
          })
          expect(Json.stringify(completed.result.encodedResult)).not.toContain(largeOutput)
        }
        expect(secondPrompt).toContain("mem:tool-call-spill")
        expect(secondPrompt).not.toContain(largeOutput)
      }),
    ] as const
  })

  ItLayer.make(it, "accumulates usage across tool-calling turns", () => {
    let calls = 0
    const firstUsage = usage({ total: 10, uncached: 8 }, { total: 2 })
    const secondUsage = usage({ total: 7, cacheRead: 3 }, { total: 5, text: 4, reasoning: 1 })
    const expectedUsage = AgentEvent.addUsage(firstUsage, secondUsage)
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.fromIterable([
                toolCallPart("tool-call-usage", "echo", { text: "from model" }),
                finishPart("tool-calls", firstUsage),
              ])
            : Stream.fromIterable([textDelta("after tool"), finishPart("stop", secondUsage)])
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "multi-usage-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

        const turnCompleted = events.filter((event) => event._tag === "TurnCompleted")
        expect(turnCompleted).toHaveLength(2)
        if (turnCompleted[0]?._tag === "TurnCompleted") {
          expect(turnCompleted[0].usage).toEqual(firstUsage)
          expect(turnCompleted[0].finishReason).toBe("tool-calls")
        }
        if (turnCompleted[1]?._tag === "TurnCompleted") {
          expect(turnCompleted[1].usage).toEqual(secondUsage)
          expect(turnCompleted[1].finishReason).toBe("stop")
        }
        expect(events.filter((event) => event._tag === "ModelPart" && event.part.type === "finish")).toHaveLength(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.usage).toEqual(expectedUsage)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "emits StructuredOutput immediately before Completed", () => {
    const structuredUsage = usage({ total: 3 }, { total: 1, text: 1 })
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.make(textDelta("normal answer")),
          () => Effect.succeed([{ type: "text", text: '{"ok":true}' }, finishPart("stop", structuredUsage)]),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-agent" })

        const events = yield* Stream.runCollect(
          Agent.streamObject(agent, { prompt: "make object", schema: objectSchema }),
        )

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelPart",
          "TurnCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const structuredIndex = events.findIndex((event) => event._tag === "StructuredOutput")
        expect(structuredIndex).toBe(events.length - 2)
        const structured = events[structuredIndex]
        if (structured?._tag === "StructuredOutput") {
          expect(structured.turn).toBe(1)
          expect(structured.value).toEqual({ ok: true })
          expect(structured.content.some((part) => part.type === "finish")).toBe(true)
        }
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("normal answer")
          expect(completed.turns).toBe(2)
          expect(completed.usage).toEqual(structuredUsage)
          expect(Json.stringify(completed.transcript.content)).toContain(Agent.defaultObjectPrompt)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "attributes a direct terminal structured call to its own ordered turn span", () => {
    const streamedUsage = usage({ total: 7 }, { total: 2 })
    const structuredUsage = usage({ total: 3 }, { total: 1, text: 1 })
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.fromIterable([textDelta("normal answer"), finishPart("length", streamedUsage)]),
          () => Effect.succeed([{ type: "text", text: '{"ok":true}' }, finishPart("stop", structuredUsage)]),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-span-agent" })

        const events = yield* Stream.runCollect(
          Agent.streamObject(agent, { prompt: "make object", schema: objectSchema }),
        ).pipe(Effect.withTracer(tracer))

        const runSpan = spans.find((span) => span.name === "Baton.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "Baton.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("baton.turn"))).toEqual([0, 1])
        expect(runSpan).toBeDefined()
        expect(turnSpans.every((span) => Option.getOrUndefined(span.parent) === runSpan)).toBe(true)
        expect(turnSpans[0]?.attributes.get("gen_ai.usage.input_tokens")).toBe(7)
        expect(turnSpans[0]?.attributes.get("gen_ai.usage.output_tokens")).toBe(2)
        expect(turnSpans[0]?.attributes.get("gen_ai.response.finish_reasons")).toEqual(["length"])
        expect(turnSpans[1]?.attributes.get("gen_ai.usage.input_tokens")).toBe(3)
        expect(turnSpans[1]?.attributes.get("gen_ai.usage.output_tokens")).toBe(1)
        expect(turnSpans[1]?.attributes.get("gen_ai.response.finish_reasons")).toEqual(["stop"])
        expect(turnSpans.map((span) => span.status._tag)).toEqual(["Ended", "Ended"])
        expect(turnSpans.every((span) => span.status._tag === "Ended" && Exit.isSuccess(span.status.exit))).toBe(true)
        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelPart",
          "ModelPart",
          "TurnCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.usage).toEqual(AgentEvent.addUsage(streamedUsage, structuredUsage))
        }
      }),
    ] as const
  })

  ItLayer.make(it, "does not start the terminal structured turn before it is consumed", () => {
    let structuredCalled = false
    const streamedUsage = usage({ total: 2 }, { total: 1 })
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.fromIterable([textDelta("normal answer"), finishPart("stop", streamedUsage)]),
          () => {
            structuredCalled = true
            return Effect.succeed([{ type: "text", text: '{"ok":true}' }])
          },
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-lazy-span-agent" })

        const events = yield* Agent.streamObject(agent, { prompt: "make object", schema: objectSchema }).pipe(
          Stream.take(4),
          Stream.runCollect,
          Effect.withTracer(tracer),
        )

        expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "ModelPart", "TurnCompleted"])
        expect(structuredCalled).toBe(false)
        const turnSpans = spans.filter((span) => span.name === "Baton.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("baton.turn"))).toEqual([0])
        expect(turnSpans[0]?.status._tag).toBe("Ended")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "generateObject returns the typed structured value",
    () =>
      [
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "generate-object-agent" })

          const result = yield* Agent.generateObject(agent, { prompt: "make typed object", schema: objectSchema })

          expect(result.text).toBe("normal answer")
          expect(result.turns).toBe(2)
          expect(result.value).toEqual({ ok: true })
        }),
      ] as const,
  )

  ItLayer.make(it, "runs the tool loop before the terminal structured turn", () => {
    let streamCalls = 0
    let structuredPrompt = ""
    const structuredUsage = usage({ total: 5 }, { total: 2 })
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          () => {
            streamCalls += 1
            return streamCalls === 1
              ? Stream.make(toolCallPart("tool-call-structured", "echo", { text: "from model" }))
              : Stream.make(textDelta("after tool"))
          },
          (options) => {
            structuredPrompt = Json.stringify(options.prompt.content)
            return Effect.succeed([{ type: "text", text: '{"ok":true}' }, finishPart("stop", structuredUsage)])
          },
        ),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-tool-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.streamObject(agent, { prompt: "use tool", schema: objectSchema }),
        ).pipe(Effect.withTracer(tracer))

        expect(streamCalls).toBe(2)
        expect(structuredPrompt).toContain("from model")
        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelPart",
          "ToolExecutionStarted",
          "ToolExecutionCompleted",
          "TurnCompleted",
          "TurnStarted",
          "ModelPart",
          "TurnCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const runSpan = spans.find((span) => span.name === "Baton.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "Baton.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("baton.turn"))).toEqual([0, 1, 2])
        expect(runSpan).toBeDefined()
        expect(turnSpans.every((span) => Option.getOrUndefined(span.parent) === runSpan)).toBe(true)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") {
          expect(structured.turn).toBe(2)
          expect(structured.content.some((part) => part.type === "finish")).toBe(true)
        }
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("after tool")
          expect(completed.turns).toBe(3)
          expect(completed.usage).toEqual(structuredUsage)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "fails AgentError at the structured turn when schema decoding fails", () => {
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.make(textDelta("normal answer")),
          () => Effect.succeed([{ type: "text", text: '{"ok":"nope"}' }]),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-decode-agent" })

        const failure = yield* Effect.flip(
          Stream.runCollect(Agent.streamObject(agent, { prompt: "bad object", schema: objectSchema })).pipe(
            Effect.withTracer(tracer),
          ),
        )

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") {
          expect(failure.turn).toBe(1)
          expect(AiError.isAiError(failure.cause)).toBe(true)
        }
        const structuredSpan = spans.find(
          (span) => span.name === "Baton.Agent.turn" && span.attributes.get("baton.turn") === 1,
        )
        expect(structuredSpan?.status._tag).toBe("Ended")
        if (structuredSpan?.status._tag === "Ended") {
          expect(Exit.isFailure(structuredSpan.status.exit)).toBe(true)
          if (Exit.isFailure(structuredSpan.status.exit)) {
            expect(Cause.hasFails(structuredSpan.status.exit.cause)).toBe(true)
          }
        }
      }),
    ] as const
  })

  ItLayer.make(it, "closes the terminal structured turn span on a defect", () => {
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.make(textDelta("normal answer")),
          () => Effect.die("structured defect"),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-defect-agent" })

        const exit = yield* Stream.runDrain(
          Agent.streamObject(agent, { prompt: "defect object", schema: objectSchema }),
        ).pipe(Effect.withTracer(tracer), Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
        const structuredSpan = spans.find(
          (span) => span.name === "Baton.Agent.turn" && span.attributes.get("baton.turn") === 1,
        )
        expect(structuredSpan?.status._tag).toBe("Ended")
        if (structuredSpan?.status._tag === "Ended") {
          expect(Exit.isFailure(structuredSpan.status.exit)).toBe(true)
          if (Exit.isFailure(structuredSpan.status.exit)) {
            expect(Cause.hasDies(structuredSpan.status.exit.cause)).toBe(true)
          }
        }
      }),
    ] as const
  })

  ItLayer.make(it, "closes the terminal structured turn span on interruption", () => {
    const { spans, tracer } = testTracer()
    let structuredStarted: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.make(textDelta("normal answer")),
          () =>
            structuredStarted === undefined
              ? Effect.die("structured turn started before test initialization")
              : Deferred.succeed(structuredStarted, undefined).pipe(Effect.andThen(Effect.never)),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        structuredStarted = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "structured-interrupt-agent" })
        const fiber = yield* Stream.runDrain(
          Agent.streamObject(agent, { prompt: "interrupt object", schema: objectSchema }),
        ).pipe(Effect.withTracer(tracer), Effect.forkChild)

        yield* Deferred.await(structuredStarted)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
        const structuredSpan = spans.find(
          (span) => span.name === "Baton.Agent.turn" && span.attributes.get("baton.turn") === 1,
        )
        expect(structuredSpan?.status._tag).toBe("Ended")
        if (structuredSpan?.status._tag === "Ended") {
          expect(Exit.isFailure(structuredSpan.status.exit)).toBe(true)
          if (Exit.isFailure(structuredSpan.status.exit)) {
            expect(Cause.hasInterrupts(structuredSpan.status.exit.cause)).toBe(true)
          }
        }
      }),
    ] as const
  })

  ItLayer.make(it, "performs the terminal structured turn after resume", () => {
    let calls = 0
    let sawResumedToolResult = false
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          (options) => {
            calls += 1
            sawResumedToolResult = sawResumedToolResult || Json.stringify(options.prompt.content).includes("resumed")
            return Stream.make(textDelta("after resume"))
          },
          () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
        ),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resume-structured-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.streamObject(agent, {
            prompt: "ignored original prompt",
            history: [
              { role: "system", content: "resume history system" },
              { role: "user", content: [{ type: "text", text: "earlier user input" }] },
            ],
            resume: { call: { id: "tool-call-resume-structured", name: "echo", params: { text: "resumed" } } },
            schema: objectSchema,
          }),
        ).pipe(Effect.withTracer(tracer))

        expect(calls).toBe(1)
        expect(sawResumedToolResult).toBe(true)
        expect(events.map((event) => event._tag)).toEqual([
          "ToolExecutionStarted",
          "ToolExecutionCompleted",
          "TurnCompleted",
          "TurnStarted",
          "ModelPart",
          "TurnCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const runSpan = spans.find((span) => span.name === "Baton.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "Baton.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("baton.turn"))).toEqual([0, 1, 2])
        expect(runSpan).toBeDefined()
        expect(turnSpans.every((span) => Option.getOrUndefined(span.parent) === runSpan)).toBe(true)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") expect(structured.turn).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("after resume")
          expect(completed.turns).toBe(3)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "uses ModelResilience for the terminal structured turn", () => {
    let structuredCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(
          () => Stream.make(textDelta("normal answer")),
          () => {
            structuredCalls += 1
            return structuredCalls === 1
              ? Effect.fail(transientModelError)
              : Effect.succeed([{ type: "text", text: '{"ok":true}' }])
          },
        ),
        unusedExecutor,
        Approvals.autoApprove,
        retryTransientModelError,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resilient-structured-agent" })

        const events = yield* Stream.runCollect(
          Agent.streamObject(agent, { prompt: "retry object", schema: objectSchema }),
        )

        expect(structuredCalls).toBe(2)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") expect(structured.value).toEqual({ ok: true })
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed on in-band stream error parts", () => {
    const streamError = new Error("stream exploded")
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.fromIterable([textDelta("partial"), Response.makePart("error", { error: streamError })]),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "error-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("stream exploded")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.turn).toBe(0)
        expect(failure._tag === "@batonfx/core/AgentError" && failure.cause).toBe(streamError)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when the stream channel fails", () => {
    const streamFailure = AiError.make({
      module: "TestLanguageModel",
      method: "streamText",
      reason: AiError.UnknownError.make({ description: "stream channel exploded" }),
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.fail(streamFailure)))),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "channel-error-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("stream channel exploded")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.cause).toBe(streamFailure)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves a model stream defect after emitted events", () => {
    const cause = Cause.die(new Error("model defect"))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(cause)))),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const events: Array<AgentEvent.Event> = []
        const agent = Agent.make({ name: "defective-model-agent" })

        const exit = yield* Agent.stream(agent, { prompt: "relay input" }).pipe(
          Stream.runForEach((event) => Effect.sync(() => events.push(event))),
          Effect.exit,
        )

        expect(events.some((event) => event._tag === "ModelPart")).toBe(true)
        expect(exit).toEqual(Exit.failCause(cause))
      }),
    ] as const
  })

  ItLayer.make(it, "preserves a compound stream Cause after emitted events", () => {
    const failure = AgentEvent.AgentError.make({ message: "model stream failure", turn: 0 })
    const cause = Cause.combine(Cause.fail(failure), Cause.die(new Error("model defect")))
    let parts = 0
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fromIterable([textDelta("partial"), textDelta("terminal")])),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([
          {
            transformPart: (part) => {
              parts += 1
              return parts === 1 ? Effect.succeed(Option.some(part)) : Effect.failCause(cause)
            },
          },
        ]),
      ),
      Effect.gen(function* () {
        const events: Array<AgentEvent.Event> = []
        const agent = Agent.make({ name: "compound-model-agent" })

        const exit = yield* Agent.stream(agent, { prompt: "relay input" }).pipe(
          Stream.runForEach((event) => Effect.sync(() => events.push(event))),
          Effect.exit,
        )

        expect(events.some((event) => event._tag === "ModelPart")).toBe(true)
        expect(exit).toEqual(Exit.failCause(cause))
      }),
    ] as const
  })

  ItLayer.make(it, "does not retry model failures when ModelResilience is absent", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.fail(transientModelError)
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-model-retry-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "retry absent" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
      }),
    ] as const
  })

  ItLayer.make(it, "retries model stream failures before any part is emitted", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1 ? Stream.fail(transientModelError) : Stream.make(textDelta("after retry"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        retryTransientModelError,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-retry-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "retry model" }))

        expect(calls).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.text).toBe("after retry")
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces terminal pre-emission model failures through AgentError", () => {
    let calls = 0
    let classifications = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.fail(transientModelError)
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(3),
          classify: () => {
            classifications += 1
            return "terminal"
          },
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-terminal-failure-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "terminal model" })))

        expect(calls).toBe(1)
        expect(classifications).toBe(1)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
      }),
    ] as const
  })

  ItLayer.make(it, "does not retry model stream failures after a part is emitted", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.fail(transientModelError)))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelResilience.layer({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-partial-failure-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial model" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
      }),
    ] as const
  })

  ItLayer.make(it, "does not retry in-band model error parts", () => {
    let calls = 0
    let classifications = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(Response.makePart("error", { error: transientModelError }))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(3),
          classify: () => {
            classifications += 1
            return "transient"
          },
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-in-band-error-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "in-band error" })))

        expect(calls).toBe(1)
        expect(classifications).toBe(0)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
      }),
    ] as const
  })

  ItLayer.make(it, "wraps per-turn model overrides with ModelResilience", () => {
    let ambientCalls = 0
    let overrideCalls = 0
    const overrideModel = modelLayer(() => {
      overrideCalls += 1
      return overrideCalls === 1 ? Stream.fail(transientModelError) : Stream.make(textDelta("override ok"))
    })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          ambientCalls += 1
          return Stream.make(toolCallPart("tool-call-override-model", "echo", { text: "from model" }))
        }),
        echoExecutor,
        Approvals.autoApprove,
        retryTransientModelError,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "override-model-retry-agent",
          toolkit: Toolkit.make(echoTool),
          policy: TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.continue({ model: overrideModel }))),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool then override" }))

        expect(ambientCalls).toBe(1)
        expect(overrideCalls).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.text).toBe("override ok")
      }),
    ] as const
  })

  ItLayer.make(it, "preserves TurnLimitExceeded for a configured recurrence limit", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(toolCallPart(`tool-call-${calls}`, "echo", { text: `call ${calls}` }))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "policy-stop-agent",
          toolkit: Toolkit.make(echoTool),
          policy: TurnPolicy.recurs(0),
        })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "loop forever" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("@batonfx/core/TurnLimitExceeded")
        if (failure._tag === "@batonfx/core/TurnLimitExceeded") {
          expect(failure.turn).toBe(1)
          expect(failure.limit).toBe(0)
          expect(failure.pending).toEqual([{ tool_call_id: "tool-call-1", tool_name: "echo" }])
        }
      }),
    ] as const
  })

  ItLayer.make(it, "keeps every pending call in order when a configured limit stops", () => [
    Layer.mergeAll(
      modelLayer(() =>
        Stream.make(
          toolCallPart("tool-call-first", "echo", { text: "first" }),
          toolCallPart("tool-call-second", "echo", { text: "second" }),
        ),
      ),
      echoExecutor,
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "ordered-policy-stop-agent",
        toolkit: Toolkit.make(echoTool),
        policy: TurnPolicy.recurs(0),
      })
      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "call twice" })))
      expect(failure._tag).toBe("@batonfx/core/TurnLimitExceeded")
      if (failure._tag === "@batonfx/core/TurnLimitExceeded") {
        expect(failure.pending).toEqual([
          { tool_call_id: "tool-call-first", tool_name: "echo" },
          { tool_call_id: "tool-call-second", tool_name: "echo" },
        ])
      }
    }),
  ])

  ItLayer.make(it, "propagates policy requirements and explicit non-limit stop reasons", () => {
    let calls = 0
    const budgetLayer = Layer.succeed(Budget, { remaining: () => 0 })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(toolCallPart(`tool-call-${calls}`, "echo", { text: `call ${calls}` }))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
        budgetLayer,
      ),
      Effect.gen(function* () {
        const policy = TurnPolicy.make<Budget>((info) =>
          Effect.gen(function* () {
            const budget = yield* Budget
            return budget.remaining(info.turn) === 0
              ? TurnPolicy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
              : TurnPolicy.decision.continue()
          }),
        )
        const agent = Agent.make({ name: "budget-policy-agent", toolkit: Toolkit.make(echoTool), policy })
        const run = Agent.stream(agent, { prompt: "use budget" })
        const requirementProof: Budget extends StreamServices<typeof run> ? true : false = true

        const failure = yield* Effect.flip(Stream.runCollect(run))

        expect(requirementProof).toBe(true)
        expect(calls).toBe(1)
        expect(failure._tag).toBe("@batonfx/core/TurnPolicyStopped")
        if (failure._tag === "@batonfx/core/TurnPolicyStopped") {
          expect(failure.reason).toEqual({ _tag: "BudgetExhausted", budget: "tokens" })
          expect(failure.pending).toEqual([{ tool_call_id: "tool-call-1", tool_name: "echo" }])
        }
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces every non-limit stop reason through terminal output", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(toolCallPart(`tool-call-stop-${calls}`, "echo", { text: `call ${calls}` }))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const reasons: ReadonlyArray<Exclude<TurnPolicy.StopReason, { readonly _tag: "TurnLimit" }>> = [
          { _tag: "GoalSatisfied" },
          { _tag: "BudgetExhausted", budget: "requests" },
          { _tag: "Policy", detail: "operator requested stop" },
        ]

        for (const reason of reasons) {
          const agent = Agent.make({
            name: `stop-reason-${reason._tag}`,
            toolkit: Toolkit.make(echoTool),
            policy: TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.stop(reason))),
          })
          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "stop" })))
          expect(failure._tag).toBe("@batonfx/core/TurnPolicyStopped")
          if (failure._tag === "@batonfx/core/TurnPolicyStopped") expect(failure.reason).toEqual(reason)
        }

        expect(calls).toBe(reasons.length)
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces a policy evaluation failure without erasing its cause", () => {
    const policyCause = { system: "budget-service", status: "offline" }
    const policyFailure = TurnPolicy.TurnPolicyError.make({ message: "budget unavailable", cause: policyCause })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-policy-failure", "echo", { text: "call" }))),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "policy-failure-agent",
          toolkit: Toolkit.make(echoTool),
          policy: TurnPolicy.make(() => Effect.fail(policyFailure)),
        })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use policy" })))

        expect(failure).toBe(policyFailure)
        expect(failure.cause).toBe(policyCause)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when a stale reasonless policy bypasses the migration adapter", () => {
    const policy = TurnPolicy.recurs(0)
    Reflect.set(policy, "decide", () => Effect.succeed({ _tag: "Stop" }))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-stale-policy", "echo", { text: "call" }))),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "stale-policy-agent", toolkit: Toolkit.make(echoTool), policy })
        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use stale policy" })))
        expect(failure._tag).toBe("@batonfx/core/TurnPolicyError")
        if (failure._tag === "@batonfx/core/TurnPolicyError") {
          expect(failure.message).toContain("TurnPolicy.fromLegacy")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "applies per-turn instruction overrides from the policy", () => {
    let calls = 0
    let secondCallSawInjectedSystem = false
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-override", "echo", { text: "from model" }))
          }
          secondCallSawInjectedSystem = Json.stringify(options.prompt.content).includes("injected system content")
          return Stream.make(textDelta("after override"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "override-agent",
          toolkit: Toolkit.make(echoTool),
          policy: TurnPolicy.make(() =>
            Effect.succeed(TurnPolicy.decision.continue({ instructions: "injected system content" })),
          ),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

        expect(secondCallSawInjectedSystem).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "does not dispatch a tool excluded by the advertised activeTools snapshot", () => {
    let modelCalls = 0
    let executorCalls = 0
    let secondTurnTools: ReadonlyArray<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 2) secondTurnTools = options.tools.map((tool) => tool.name)
          return modelCalls < 3
            ? Stream.make(toolCallPart(`active-tool-${modelCalls}`, "echo", { text: "hidden" }))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.testLayer({
          execute: () => {
            executorCalls += 1
            return Effect.succeed({ _tag: "Success", result: "echoed", encodedResult: "echoed" })
          },
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "active-tools-agent",
          toolkit: Toolkit.make(echoTool),
          policy: TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.continue({ activeTools: [] }))),
        })

        const failure = yield* Agent.stream(agent, { prompt: "use then hide echo" }).pipe(Stream.runDrain, Effect.flip)

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(secondTurnTools).toEqual([])
        expect(executorCalls).toBe(1)
        expect(modelCalls).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "suspends when the executor returns Suspend",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-wait", "echo", { text: "hold" }))),
          ToolExecutor.testLayer({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "suspend-agent",
            toolkit: Toolkit.make(echoTool),
          })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "wait please" })))

          expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
          if (failure._tag === "@batonfx/core/AgentSuspended") {
            expect(failure.token).toBe("wait-1")
            expect(failure.reason).toBe("tool-wait")
            expect(failure.tool_call_id).toBe("tool-call-wait")
            expect(failure.tool_name).toBe("echo")
            expect(failure.tool_params).toEqual({ text: "hold" })
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "checkpoints completed sibling tool results before suspension and preserves them on resume", () => {
    let suspendedTranscript: Prompt.Prompt | undefined
    let ordinaryExecutions = 0
    let suspendedExecutions = 0
    let modelCalls = 0
    let resumedPrompt = ""
    const assertExchange = (prompt: Prompt.Prompt, expectedResultIds: ReadonlyArray<string>) => {
      const assistantIndex = prompt.content.findIndex(
        (message) =>
          message.role === "assistant" &&
          message.content.some((part) => part.type === "tool-call" && part.id === "tool-call-ordinary"),
      )
      expect(assistantIndex).toBeGreaterThanOrEqual(0)
      const assistant = prompt.content[assistantIndex]
      expect(assistant?.role).toBe("assistant")
      if (assistant?.role !== "assistant") throw new Error("missing assistant tool calls")
      expect(assistant.content.filter((part) => part.type === "tool-call").map((part) => part.id)).toEqual([
        "tool-call-ordinary",
        "tool-call-child",
      ])
      const resultIds: Array<string> = []
      for (const message of prompt.content.slice(assistantIndex + 1)) {
        if (message.role !== "tool") break
        resultIds.push(...message.content.filter((part) => part.type === "tool-result").map((part) => part.id))
      }
      expect(resultIds).toEqual(expectedResultIds)
    }
    const executor = ToolExecutor.testLayer({
      execute: (request) => {
        if (request.call.id === "tool-call-ordinary") {
          ordinaryExecutions += 1
          return Effect.succeed({
            _tag: "Success" as const,
            result: { text: "README.md" },
            encodedResult: { text: "README.md" },
          })
        }
        suspendedExecutions += 1
        return suspendedExecutions === 1
          ? Effect.succeed({ _tag: "Suspend" as const, token: "wait-child" })
          : Effect.succeed({
              _tag: "Success" as const,
              result: { text: "child complete" },
              encodedResult: { text: "child complete" },
            })
      },
    })
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable([
              toolCallPart("tool-call-ordinary", "echo", { text: "ordinary" }),
              toolCallPart("tool-call-child", "echo", { text: "child" }),
            ])
          }
          assertExchange(options.prompt, ["tool-call-ordinary", "tool-call-child"])
          resumedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("completed after resume"))
        }),
        executor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "sibling-suspend-agent", toolkit: Toolkit.make(echoTool) })
        const first = Agent.stream(agent, { prompt: "run ordinary and child tools" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") suspendedTranscript = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        const suspension = yield* first

        expect(suspension._tag).toBe("@batonfx/core/AgentSuspended")
        expect(suspendedTranscript).toBeDefined()
        if (suspendedTranscript === undefined) return yield* Effect.die("missing suspension checkpoint")
        assertExchange(suspendedTranscript, ["tool-call-ordinary"])
        const checkpoint = Json.stringify(suspendedTranscript?.content)
        expect(checkpoint).toContain("tool-call-ordinary")
        expect(checkpoint).toContain("README.md")
        expect(checkpoint).toContain("tool-call-child")
        expect(checkpoint).not.toContain("child complete")

        const resumed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: suspendedTranscript,
            resume: { call: { id: "tool-call-child", name: "echo", params: { text: "child" } } },
          }),
        )

        expect(resumed.at(-1)?._tag).toBe("Completed")
        expect(ordinaryExecutions).toBe(1)
        expect(suspendedExecutions).toBe(2)
        expect(resumedPrompt.match(/tool-call-ordinary/g)).toHaveLength(2)
        expect(resumedPrompt.match(/README\.md/g)).toHaveLength(1)
        expect(resumedPrompt.match(/tool-call-child/g)).toHaveLength(2)
        expect(resumedPrompt.match(/child complete/g)).toHaveLength(1)
      }),
    ] as const
  })

  ItLayer.make(it, "resumes a suspended run by executing the pending call first", () => {
    let calls = 0
    let sawOriginalPrompt = false
    let sawResumedToolResult = false
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          const content = Json.stringify(options.prompt.content)
          sawOriginalPrompt = sawOriginalPrompt || content.includes("ignored original prompt")
          sawResumedToolResult = sawResumedToolResult || content.includes("resumed")
          return Stream.make(textDelta("after resume"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "resume-agent",
          toolkit: Toolkit.make(echoTool),
        })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored original prompt",
            history: [
              { role: "system", content: "resume history system" },
              { role: "user", content: [{ type: "text", text: "earlier user input" }] },
            ],
            resume: { call: { id: "tool-call-resume", name: "echo", params: { text: "resumed" } } },
          }),
        )

        expect(calls).toBe(1)
        expect(sawOriginalPrompt).toBe(false)
        expect(sawResumedToolResult).toBe(true)
        expect(events.map((event) => event._tag)).toEqual([
          "ToolExecutionStarted",
          "ToolExecutionCompleted",
          "TurnCompleted",
          "TurnStarted",
          "ModelPart",
          "TurnCompleted",
          "Completed",
        ])
        const completed = events.at(-1)
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("after resume")
        }
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "passes provider-executed tool calls through without local gating or execution",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(providerToolCallPart("provider-call", "gated", { text: "done upstream" }))),
          unusedExecutor,
          Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "provider-tool-agent", toolkit: Toolkit.make(gatedTool) })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "provider already handled it" }))

          expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
          expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
          expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
          const modelPart = events.find((event) => event._tag === "ModelPart")
          if (modelPart?._tag === "ModelPart" && modelPart.part.type === "tool-call") {
            expect(modelPart.part.providerExecuted).toBe(true)
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "evaluates needsApproval functions and executes when they return false", () => {
    let calls = 0
    let executed = 0
    let sawParams: unknown
    let sawToolCallId = ""
    let sawMessages = ""
    const dynamicTool = Tool.make("dynamic", {
      description: "Dynamic approval test tool",
      parameters: Schema.Struct({ amount: Schema.Finite }),
      success: Schema.Unknown,
      needsApproval: (params, context) => {
        sawParams = params
        sawToolCallId = context.toolCallId
        sawMessages = Json.stringify(context.messages)
        return params.amount > 100
      },
    })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-dynamic-safe", "dynamic", { amount: 10 }))
            : Stream.make(textDelta("safe executed"))
        }),
        ToolExecutor.testLayer({
          execute: () => {
            executed += 1
            return Effect.succeed({ _tag: "Success", result: { ok: true }, encodedResult: { ok: true } })
          },
        }),
        Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "dynamic-approval-agent", toolkit: Toolkit.make(dynamicTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "safe amount" }))

        expect(executed).toBe(1)
        expect(sawParams).toEqual({ amount: 10 })
        expect(sawToolCallId).toBe("tool-call-dynamic-safe")
        expect(sawMessages).toContain("safe amount")
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "evaluates needsApproval functions and gates when they return true", () => {
    let calls = 0
    let approvals = 0
    const dynamicTool = Tool.make("dynamic-gated", {
      description: "Dynamic approval gated test tool",
      parameters: Schema.Struct({ amount: Schema.Finite }),
      success: Schema.Unknown,
      needsApproval: (params) => params.amount > 100,
    })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-dynamic-gated", "dynamic-gated", { amount: 500 }))
            : Stream.make(textDelta("saw denial"))
        }),
        unusedExecutor,
        Approvals.testLayer({
          check: () => {
            approvals += 1
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "dynamic-gated-agent", toolkit: Toolkit.make(dynamicTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "large amount" }))

        expect(approvals).toBe(1)
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "fails closed when needsApproval functions throw or fail", () => {
    let approvals = 0
    let calls = 0
    const failingNeedsApproval = (() => Effect.fail("approval predicate failed")) as unknown as (
      params: { readonly amount: number },
      context: Tool.NeedsApprovalContext,
    ) => boolean
    const throwingTool = Tool.make("throwing-approval", {
      description: "Throwing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Finite }),
      success: Schema.Unknown,
      needsApproval: () => {
        throw new Error("approval predicate exploded")
      },
    })
    const failingTool = Tool.make("failing-approval", {
      description: "Failing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Finite }),
      success: Schema.Unknown,
      needsApproval: failingNeedsApproval,
    })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.fromIterable([
                toolCallPart("tool-call-throwing", "throwing-approval", { amount: 1 }),
                toolCallPart("tool-call-failing", "failing-approval", { amount: 1 }),
              ])
            : Stream.make(textDelta("saw denied dynamic approvals"))
        }),
        unusedExecutor,
        Approvals.testLayer({
          check: () => {
            approvals += 1
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "fail-closed-agent",
          toolkit: Toolkit.make(throwingTool, failingTool),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs approval fail closed" }))

        expect(approvals).toBe(2)
        expect(events.filter((event) => event._tag === "ApprovalRequested")).toHaveLength(2)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "executes needsApproval tools when approvals auto-approve", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-gated", "gated", { text: "please" }))
            : Stream.make(textDelta("after approval"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "approval-agent",
          toolkit: Toolkit.make(gatedTool),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" }))

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "re-feeds a failed tool result when approvals deny", () => {
    let calls = 0
    let secondCallSawDenial = false
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-denied", "gated", { text: "please" }))
          }
          secondCallSawDenial = Json.stringify(options.prompt.content).includes("Tool call denied")
          return Stream.make(textDelta("saw denial"))
        }),
        unusedExecutor,
        Approvals.denyAll,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "denied-agent",
          toolkit: Toolkit.make(gatedTool),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" }))

        expect(secondCallSawDenial).toBe(true)
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "suspends with reason approval when approvals return Pending",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-pending", "gated", { text: "please" }))),
          unusedExecutor,
          Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "approval-1" }) }),
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "pending-agent",
            toolkit: Toolkit.make(gatedTool),
          })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" })))

          expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
          if (failure._tag === "@batonfx/core/AgentSuspended") {
            expect(failure.token).toBe("approval-1")
            expect(failure.reason).toBe("approval")
            expect(failure.tool_name).toBe("gated")
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "never consults approvals for tools without needsApproval", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-ungated", "echo", { text: "please" }))
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "ungated-agent",
          toolkit: Toolkit.make(echoTool),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })
})
