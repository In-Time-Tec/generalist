import { expect, layer } from "@effect/vitest"
import { Json } from "../json"
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Ref,
  Schedule,
  Schema,
  Stream,
  Tracer,
} from "effect"
import { AiError, LanguageModel, Prompt, Response, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  Approvals,
  Compaction,
  DurableDriver,
  ExecutableManifest,
  Instructions,
  Memory,
  ModelRegistry,
  ModelResilience,
  ModelMiddleware,
  ModelStreamTermination,
  ModelTelemetry,
  Permissions,
  RunBudget,
  Session,
  SkillCatalog,
  Steering,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  Policy,
} from "../../../src/index"
import { unusedToolHandlerLayer } from "../tool-handler-layer"
import { ItLayer } from "../it-layer"
import { estimatePromptTokens } from "../../../src/core/turn/prompt-token-estimate"
import { withProviderFinish, withProviderFinishContent } from "../provider-finish"

type ModelParams = Parameters<typeof LanguageModel.make>[0]
type StreamServices<T> = T extends Stream.Stream<unknown, unknown, infer R> ? R : never

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value
type EffectRequirements<Value> =
  Value extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never
type EffectSuccess<Value> = Value extends Effect.Effect<infer Success, unknown, unknown> ? Success : never
type StreamRequirements<Value> =
  Value extends Stream.Stream<unknown, unknown, infer Requirements> ? Requirements : never
type IsAssignable<Source, Target> = Source extends Target ? true : false

void (() => {
  // @ts-expect-error Agent.make only accepts an options object.
  Agent.make("x")
  // @ts-expect-error Agent.make requires a name.
  Agent.make({})
  const invalidRunOptions: Agent.RunOptions = {
    prompt: "hello",
    // @ts-expect-error Session is the sole durable conversation authority; RunOptions.persistence does not exist.
    persistence: { chatId: "chat" },
  }
  void invalidRunOptions
})

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
const widenedOptions: Agent.MakeOptions = { name: "widened-required" }
const widenedRequiredAgent = Agent.make(widenedOptions)
const memoryRequiredRun = Agent.generate(memoryRequiredAgent, { prompt: "hello" })
const runMemoryRequired = Agent.generate(plainRequiredAgent, {
  prompt: "hello",
  memory: { key: { agent: "plain-required", subject: "memory-subject" } },
})

const structuredOutputSchema = Schema.Struct({ value: Schema.String })
const plainStreamRequired = Agent.stream(plainRequiredAgent, { prompt: "hello" })
const plainGenerateRequired = Agent.generate(plainRequiredAgent, { prompt: "hello" })
const decodingRequired = Agent.stream(plainRequiredAgent, {
  prompt: "hello",
  output: { schema: structuredOutputSchema },
})
const decodingGenerated = Agent.generate(plainRequiredAgent, {
  prompt: "hello",
  output: { schema: structuredOutputSchema },
})
interface OptionalOutputOptions {
  readonly prompt: string
  readonly output?: { readonly schema: typeof structuredOutputSchema }
}
const optionalOutputOptions: OptionalOutputOptions = {
  prompt: "hello",
  output: { schema: structuredOutputSchema },
}
const optionalOutputRequired = Agent.stream(plainRequiredAgent, optionalOutputOptions)
const optionalOutputGenerated = Agent.generate(plainRequiredAgent, optionalOutputOptions)
type TextOrOutputOptions =
  | { readonly prompt: string }
  | { readonly prompt: string; readonly output: { readonly schema: typeof structuredOutputSchema } }
const generateTextOrOutput = (options: TextOrOutputOptions) => Agent.generate(plainRequiredAgent, options)
const curriedOutputRequired = Agent.generate({ prompt: "hello", output: { schema: structuredOutputSchema } })(
  plainRequiredAgent,
)

class ModelDependency extends Context.Service<ModelDependency, { readonly value: string }>()(
  "tenetkit/test/core/agent/service.test/ModelDependency",
) {}

const dependentModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  ModelDependency.pipe(
    Effect.flatMap(() =>
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "text", delta: "provided" }))),
      }),
    ),
  ),
)
const runBoundaryModelProvided = Agent.stream(memoryRequiredAgent, { prompt: "hello" }).pipe(
  Stream.provide(dependentModelLayer),
)

const agentRequirementProofs: ReadonlyArray<true> = [
  true satisfies Assert<Equal<Agent.Requirements<typeof plainRequiredAgent>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<Agent.Requirements<typeof selectedRequiredAgent>, ModelRegistry.ModelRegistry>>,
  true satisfies Assert<
    Equal<Agent.Requirements<typeof memoryRequiredAgent>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<Agent.Requirements<typeof selectedMemoryRequiredAgent>, ModelRegistry.ModelRegistry | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<
      Agent.Requirements<typeof widenedRequiredAgent>,
      LanguageModel.LanguageModel | ModelRegistry.ModelRegistry | Memory.Memory
    >
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof memoryRequiredRun>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<
    Equal<EffectRequirements<typeof runMemoryRequired>, LanguageModel.LanguageModel | Memory.Memory>
  >,
  true satisfies Assert<Equal<StreamRequirements<typeof plainStreamRequired>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<EffectRequirements<typeof plainGenerateRequired>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<EffectSuccess<typeof plainGenerateRequired>, Agent.Result>>,
  true satisfies Assert<Equal<StreamRequirements<typeof runBoundaryModelProvided>, Memory.Memory | ModelDependency>>,
  true satisfies Assert<Equal<StreamRequirements<typeof decodingRequired>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<EffectRequirements<typeof decodingGenerated>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<EffectSuccess<typeof decodingGenerated>, Agent.ObjectResult<{ readonly value: string }>>>,
  true satisfies Assert<Equal<StreamRequirements<typeof optionalOutputRequired>, LanguageModel.LanguageModel>>,
  true satisfies Assert<Equal<EffectRequirements<typeof optionalOutputGenerated>, LanguageModel.LanguageModel>>,
  true satisfies Assert<
    Equal<EffectSuccess<typeof optionalOutputGenerated>, Agent.Result | Agent.ObjectResult<{ readonly value: string }>>
  >,
  true satisfies Assert<
    Equal<
      EffectSuccess<ReturnType<typeof generateTextOrOutput>>,
      Agent.Result | Agent.ObjectResult<{ readonly value: string }>
    >
  >,
  true satisfies Assert<Equal<EffectRequirements<typeof curriedOutputRequired>, LanguageModel.LanguageModel>>,
  true satisfies Assert<
    Equal<EffectSuccess<typeof curriedOutputRequired>, Agent.ObjectResult<{ readonly value: string }>>
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<Record<never, never>, LanguageModel.LanguageModel | Memory.Memory>,
        Agent.Agent<Record<never, never>, LanguageModel.LanguageModel>
      >,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<Record<never, never>, LanguageModel.LanguageModel>,
        Agent.Agent<Record<never, never>, LanguageModel.LanguageModel | Memory.Memory>
      >,
      false
    >
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<
        Agent.Agent<Record<never, never>, LanguageModel.LanguageModel>,
        Agent.Agent<Record<"tool", Tool.Any>, LanguageModel.LanguageModel>
      >,
      false
    >
  >,
]

const conversation = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.Message> =>
  prompt.content.filter((message) => message.role !== "system")

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"] = () => Effect.succeed([{ type: "text", text: "unused" }]),
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => withProviderFinishContent(generateText(options)),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const unusedModelLayer = modelLayer(() => Stream.make(textDelta("unused")))

class Budget extends Context.Service<Budget, { readonly remaining: (turn: number) => number }>()(
  "tenetkit/test/core/agent/service.test/Budget",
) {}

const characterTokenizerLayer = Layer.succeed(
  Tokenizer.Tokenizer,
  Tokenizer.Tokenizer.of({
    tokenize: (input) => Effect.succeed(Array.from(Json.stringify(Prompt.make(input).content), (_, index) => index)),
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

class AuthorizationDependency extends Context.Service<AuthorizationDependency, string>()(
  "tenetkit/test/core/agent/service.test/AuthorizationDependency",
) {}

const testSkill = (
  name: string,
  description: string,
  body: string,
  options: Partial<SkillCatalog.Skill> = {},
): SkillCatalog.Skill => ({
  name,
  description,
  instructions: Effect.succeed(body),
  tools: [],
  ...options,
})

const echoExecutor = ToolExecutor.layerTest({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.layerTest({
  execute: () => Effect.die("unexpected tool execution"),
})

type ToolCallParams = Response.ToolCallPartEncoded["params"]

const toolCallPart = (id: string, name: string, params: ToolCallParams): Response.ToolCallPart<string, unknown> =>
  Response.toolCallPart({ id, name, params, providerExecuted: false })

const providerToolCallPart = (id: string, name: string, params: ToolCallParams) =>
  Response.toolCallPart({ id, name, params, providerExecuted: true })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const reasoningDelta = (delta: string) => Response.makePart("reasoning-delta", { id: "reasoning", delta })

interface SuspensionChanges {
  readonly token?: string
  readonly reason?: "approval" | "tool-wait"
  readonly tool_call_id?: string
  readonly tool_name?: string
  readonly tool_params?: ToolCallParams
  readonly tool_call_batch?: ReadonlyArray<Response.ToolCallPart<string, unknown>>
  readonly active_tools?: ReadonlyArray<string>
  readonly activated_skills?: ReadonlyArray<string>
}

type CheckpointCall = AgentEvent.AgentSuspended["checkpoint"]["calls"][number]

const replacementValue = <Value>(
  targeted: boolean,
  changed: Value | undefined,
  replacement: Value | undefined,
  current: Value,
): Value => (targeted ? changed : undefined) ?? replacement ?? current

const replaceCheckpointCall = (
  entry: CheckpointCall,
  index: number,
  targetIndex: number,
  changes: SuspensionChanges,
): CheckpointCall => {
  const replacement = changes.tool_call_batch?.[index]
  const targeted = index === targetIndex
  const call = Response.toolCallPart({
    id: replacementValue(targeted, changes.tool_call_id, replacement?.id, entry.call.id),
    name: replacementValue(targeted, changes.tool_name, replacement?.name, entry.call.name),
    params: replacementValue(targeted, changes.tool_params, replacement?.params, entry.call.params),
    providerExecuted: replacement?.providerExecuted ?? entry.call.providerExecuted,
    metadata: replacement?.metadata ?? entry.call.metadata,
  })
  const state =
    targeted && entry.state._tag === "Waiting"
      ? {
          ...entry.state,
          token: changes.token ?? entry.state.token,
          reason: changes.reason ?? entry.state.reason,
        }
      : entry.state
  return { ...entry, call, state }
}

const replaceSuspension = (suspension: AgentEvent.AgentSuspended, changes: SuspensionChanges) => {
  const targetIndex = suspension.waits[0]?.callIndex ?? 0
  const calls = suspension.checkpoint.calls.map((entry, index) =>
    replaceCheckpointCall(entry, index, targetIndex, changes),
  )
  const checkpoint = {
    ...suspension.checkpoint,
    calls,
    activeTools: changes.active_tools ?? suspension.checkpoint.activeTools,
    activatedSkills: changes.activated_skills ?? suspension.checkpoint.activatedSkills,
  }
  return AgentEvent.AgentSuspended.make({
    checkpoint,
    waits: calls.flatMap((entry, callIndex) =>
      entry.state._tag === "Waiting"
        ? [
            {
              waitId: entry.state.waitId,
              token: entry.state.token,
              reason: entry.state.reason,
              callIndex,
              call: entry.call,
            },
          ]
        : [],
    ),
  })
}

const toolResultResolution = <Result>(suspension: AgentEvent.AgentSuspended, callId: string, result: Result) => {
  const wait = suspension.waits.find((entry) => entry.call.id === callId)
  if (wait === undefined) throw new Error(`missing wait for ${callId}`)
  return {
    waitId: wait.waitId,
    resolution: { _tag: "ToolResult" as const, result, encodedResult: result },
  }
}

const suspendedCall = (
  call: Response.ToolCallPart<string, unknown>,
  token: string,
  reason: "approval" | "tool-wait" = "tool-wait",
): AgentEvent.AgentSuspended => {
  const waitId = reason === "approval" ? token : `test:${call.id}`
  const checkpointCall = Response.makePart("tool-call", {
    id: call.id,
    name: call.name,
    params: call.params,
    providerExecuted: call.providerExecuted,
    metadata: call.metadata,
  })
  return AgentEvent.AgentSuspended.make({
    checkpoint: {
      turn: 0,
      calls: [
        {
          call: checkpointCall,
          operationKey: `test:${call.id}`,
          state: { _tag: "Waiting", reason, waitId, token },
        },
      ],
      activeTools: [call.name],
      authorizationContextDigest: "",
      activatedSkills: [],
      invocationPath: [],
    },
    waits: [{ waitId, token, reason, callIndex: 0, call: checkpointCall }],
  })
}

const responseMetadataPart = (id: string): Response.StreamPartEncoded => ({
  type: "response-metadata",
  id,
  modelId: "test",
  timestamp: undefined,
  request: undefined,
})

const unterminatedModelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const progressMessages = (events: Iterable<AgentEvent.Event>) =>
  [...events].filter((event) => event._tag === "ToolProgress").map((event) => event.message)

const toolCompletionMetadata = (events: Iterable<AgentEvent.Event>) =>
  [...events].find((event) => event._tag === "ToolExecutionCompleted")?.metadata

const toolResultPartSchema = Schema.Struct({ type: Schema.Literal("tool-result"), id: Schema.String })

const toolResultIds = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    Array.isArray(message.content)
      ? Schema.decodeSync(Schema.Array(Schema.Unknown))(message.content)
          .filter(Schema.is(toolResultPartSchema))
          .map((part) => part.id)
      : [],
  )

const modelToolSchema = Schema.Struct({ name: Schema.String })
const modelToolNames = (tools: ReadonlyArray<unknown>): ReadonlyArray<string> =>
  Schema.decodeUnknownSync(Schema.Array(modelToolSchema))(tools).map((tool) => tool.name)

const echoParamsSchema = Schema.Struct({ text: Schema.String })
const checkpointStateSchema = Schema.Struct({ pending: Schema.optionalKey(Schema.Unknown) })

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

const overflowSelection = { provider: "test", model: "overflow" }

const overflowModelLayer = (streamText: ModelParams["streamText"], generateText?: ModelParams["generateText"]) =>
  Layer.unwrap(
    ModelRegistry.registration({
      ...overflowSelection,
      layer: modelLayer(streamText, generateText),
      classifyFailure: (error) =>
        AiError.isAiError(error) && error.module === "AgentTestLanguageModel" && error.reason._tag === "UnknownError"
          ? "context-overflow"
          : "other",
    }).pipe(Effect.map((registration) => ModelRegistry.layer([Effect.succeed(registration)]))),
  )

const retryTransientModelError = ModelResilience.layer({
  retrySchedule: Schedule.recurs(1),
  classify: (error) => (error === transientModelError ? "transient" : "terminal"),
})

layer(unusedToolHandlerLayer)("Agent", (it) => {
  expect(agentRequirementProofs.every(Boolean)).toBe(true)
  expect(toolkitRequirementProof).toBe(true)

  ItLayer.make(
    it,
    "runs through a model layer provided at the run boundary while retaining the layer requirement",
    () =>
      [
        Layer.mergeAll(Layer.succeed(ModelDependency, ModelDependency.of({ value: "configured" })), Memory.layerNoop),
        Effect.gen(function* () {
          const events = yield* Stream.runCollect(runBoundaryModelProvided)
          const completed = events.at(-1)

          expect(completed?._tag === "Completed" && completed.text).toBe("provided")
        }),
      ] as const,
  )

  it.effect("scopes a run-boundary model layer to stream consumption and interruption", () =>
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
      const agent = Agent.make({ name: "scoped-model-agent" })
      const run = Stream.runDrain(Agent.stream(agent, { prompt: "wait" }).pipe(Stream.provide(providedModelLayer)))

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

    const agent = Agent.make({ name: "defaults-agent", model, memory, metadata })

    expect(agent.model).toEqual(model)
    expect(agent.memory).toEqual(memory)
    expect(agent.metadata).toEqual(metadata)
  })

  it("carries an explicit safe tool scheduling policy through Agent.make", () => {
    const toolScheduling = { maxConcurrency: 3, parallelSafe: ["echo"] }

    expect(Agent.make({ name: "tool-scheduling-agent", toolScheduling }).toolScheduling).toBe(toolScheduling)
    expect(Agent.make({ name: "serial-tool-agent" }).toolScheduling).toEqual({
      maxConcurrency: 1,
      parallelSafe: [],
    })
  })

  it("constructs AgentError without a cause", () => {
    const error = AgentEvent.AgentError.make({ message: "boom", turn: 0 })

    expect(error._tag).toBe("tenetkit/core/AgentError")
    expect(error.cause).toBeUndefined()
  })

  ItLayer.make(it, "rejects unresolved framework tool history before calling the model", () => {
    let modelCalls = 0
    const call = Prompt.makePart("tool-call", {
      id: "call-unresolved",
      name: "run_child",
      params: { prompt: "inspect" },
      providerExecuted: false,
    })
    return [
      modelLayer(() => {
        modelCalls += 1
        return Stream.make(textDelta("unexpected"))
      }),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-context-agent" })
        const failure = yield* Agent.stream(agent, {
          prompt: "continue",
          history: Prompt.fromMessages([Prompt.makeMessage("assistant", { content: [call] })]),
        }).pipe(Stream.runDrain, Effect.flip)

        expect(failure).toMatchObject({
          _tag: "tenetkit/core/AgentError",
          cause: {
            _tag: "tenetkit/core/ContextInvalid",
            issues: [{ toolCallId: call.id, reason: "unresolved" }],
          },
        })
        expect(modelCalls).toBe(0)
      }),
    ] as const
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
          advertisedTools = modelToolNames(options.tools)
          return modelCalls === 1
            ? Stream.make(toolCallPart("prototype-call", "__proto__", {}))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
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

  ItLayer.make(it, "reports duplicate __proto__ declarations in source order", () => {
    let modelCalls = 0
    const first = Tool.make("__proto__", { parameters: Schema.Unknown, success: Schema.Unknown })
    const second = Tool.make("__proto__", { parameters: Schema.Unknown, success: Schema.Unknown })
    return [
      modelLayer(() => {
        modelCalls += 1
        return Stream.make(textDelta("unexpected"))
      }),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "duplicate-prototype-agent", tools: [first, second] })

        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "hello" })))

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "__proto__",
            origins: [
              { _tag: "Static", agent: "duplicate-prototype-agent" },
              { _tag: "Static", agent: "duplicate-prototype-agent" },
            ],
          }),
        )
        expect(modelCalls).toBe(0)
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
        SkillCatalog.layerSkills([testSkill("review", "Review code", "Review carefully")]),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-tool-output-limit-agent" })

        for (const toolOutputMaxBytes of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", toolOutputMaxBytes })),
          )

          expect(failure._tag).toBe("tenetkit/core/AgentError")
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "RunOptions.toolOutputMaxBytes must be a non-negative finite number",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when modelCallOrdinalStart is invalid", () => {
    let modelCalls = 0
    const invalidValues = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-model-call-ordinal-agent" })

        for (const modelCallOrdinalStart of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", modelCallOrdinalStart })),
          )

          expect(failure._tag).toBe("tenetkit/core/AgentError")
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "RunOptions.modelCallOrdinalStart must be a non-negative safe integer",
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-progress-capacity-agent" })

        for (const capacity of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", toolProgress: { _tag: "Backpressure", capacity } })),
          )

          expect(failure._tag).toBe("tenetkit/core/AgentError")
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "RunOptions.toolProgress must select a supported policy with a positive safe-integer capacity",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when tool scheduling is invalid", () => {
    let modelCalls = 0
    const invalidValues = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        for (const maxConcurrency of invalidValues) {
          const agent = Agent.make({
            name: "invalid-tool-scheduling-agent",
            toolScheduling: { maxConcurrency, parallelSafe: [] },
          })
          const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "hello" })))
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "Agent.toolScheduling.maxConcurrency must be a positive safe integer",
          )
        }
        for (const parallelSafe of [["missing"], ["echo", "echo"]]) {
          const agent = Agent.make({
            name: "invalid-parallel-safe-agent",
            toolkit: Toolkit.make(echoTool),
            toolScheduling: { maxConcurrency: 2, parallelSafe },
          })
          const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "hello" })))
          expect(failure._tag).toBe("tenetkit/core/AgentError")
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-context-window-agent" })

        for (const contextWindow of invalidValues) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", compaction: { contextWindow } })),
          )

          expect(failure._tag).toBe("tenetkit/core/AgentError")
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "RunOptions.compaction.contextWindow must be a positive finite number",
          )
        }
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fails before model calls when compaction reserveTokens is invalid", () => {
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "invalid-reserve-agent" })
        for (const reserveTokens of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.stream(agent, { prompt: "hello", compaction: { reserveTokens } })),
          )
          expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toBe(
            "RunOptions.compaction.reserveTokens must be a non-negative safe integer",
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
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "loop-test-agent",
            instructions: "Always mention relay input when you answer.",
          })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "relay input" }))

          expect(events.map((event) => event._tag)).toEqual([
            "TurnStarted",
            "ModelCallStarted",
            "ModelAttemptStarted",
            "ModelAttemptFirstOutput",
            "ModelPart",
            "ModelPart",
            "ModelAttemptCompleted",
            "ModelCallCompleted",
            "ModelResponseCommitted",
            "TurnCompleted",
            "Completed",
          ])
          const completed = events.at(-1)
          expect(completed?._tag).toBe("Completed")
          if (completed?._tag === "Completed") {
            expect(completed.text).toBe("saw system and input")
            expect(completed.turns).toBe(1)
            expect("usage" in completed).toBe(true)
          }
          const modelPart = events.find((event) => event._tag === "ModelPart")
          if (modelPart?._tag === "ModelPart") {
            expect(modelPart.part.type).toBe("text-delta")
          }
          const turnCompleted = events.find((event) => event._tag === "TurnCompleted")
          if (turnCompleted?._tag === "TurnCompleted") {
            expect("usage" in turnCompleted).toBe(true)
            expect(turnCompleted._tag === "TurnCompleted" && turnCompleted.finishReason).toBe("stop")
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
          const agent = Agent.make({ name: "minimal-agent", instructions: "Answer directly." })

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
          ModelRegistry.registration({
            provider: "test",
            model: "agent-default",
            layer: modelLayer(() => Stream.make(textDelta("registry done"))),
          }).pipe(
            Effect.map((registration) =>
              Layer.mergeAll(ModelRegistry.layer([Effect.succeed(registration)]), unusedModelLayer),
            ),
          ),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "model-default-agent",
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
            streamText: () =>
              withProviderFinish(Stream.fromEffect(assertLive).pipe(Stream.map(() => textDelta("normal answer")))),
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
        ModelRegistry.registration({ ...selection, layer: selectedModel }).pipe(
          Effect.map((registration) =>
            Layer.mergeAll(
              ModelRegistry.layer([Effect.succeed(registration)], { maxConcurrentModelCalls: 1 }),
              unusedExecutor,
              Approvals.layerAutoApprove,
              ModelMiddleware.layerIdentity,
              unusedModelLayer,
            ),
          ),
        ),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "scoped-structured-agent", model: selection })
        const agentFiber = yield* Effect.forkChild(
          Agent.generate(agent, { prompt: "make object", output: { schema: objectSchema } }),
        )
        yield* Deferred.await(structuredEntered)

        let competitorEntered = false
        const competitor = yield* Effect.forkChild(
          ModelRegistry.withModel(
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
        expect(acquired).toBe(1)
        expect(released).toBe(0)
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
        Memory.layerTest({
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
        const agent = Agent.make({ name: "memory-default-agent", memory: key })

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
        const agent = Agent.make({ name: "toolkit-handler-agent", toolkit })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

        expect(handled).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "executes the static tool snapshot advertised to the model", () => {
    let modelCalls = 0
    let originalCalls = 0
    const original = Tool.make("snapshot_tool", {
      parameters: Schema.Struct({}),
      success: Schema.Literal("original"),
    })
    const replacement = Tool.make("snapshot_tool", {
      parameters: Schema.Struct({}),
      success: Schema.Literal("replacement"),
    })
    const toolkit = Toolkit.make(original)
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            Object.defineProperty(toolkit.tools, "snapshot_tool", {
              configurable: true,
              enumerable: true,
              value: replacement,
              writable: true,
            })
            return Stream.make(toolCallPart("snapshot-call", "snapshot_tool", {}))
          }
          return Stream.make(textDelta("done"))
        }),
        toolkit.toLayer({
          snapshot_tool: () =>
            Effect.sync(() => {
              originalCalls += 1
              return "original" as const
            }),
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "snapshot-agent", toolkit })

        yield* Stream.runCollect(Agent.stream(agent, { prompt: "run snapshot" }))

        expect(originalCalls).toBe(1)
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
        ToolExecutor.layerTest({
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
        const agent = Agent.make({ name: "tool-executor-override-agent", toolkit })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

        expect(toolkitHandlerCalls).toBe(0)
        expect(executorCalls).toBe(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "suspends when approval policy is absent and tool needs approval", () => {
    let calls = 0
    let handled = false
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-missing-approvals", "gated", { text: "from model" }))
            : Stream.make(textDelta("after failed approval"))
        }),
        Toolkit.make(gatedTool).toLayer({
          gated: () =>
            Effect.sync(() => {
              handled = true
              return { approved: true }
            }),
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "missing-approvals-agent", toolkit: Toolkit.make(gatedTool) })

        const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "use gated" })).pipe(Effect.flip)

        expect(handled).toBe(false)
        expect(Schema.is(AgentEvent.AgentSuspended)(error)).toBe(true)
        if (Schema.is(AgentEvent.AgentSuspended)(error)) {
          expect(error.waits[0]?.reason).toBe("approval")
          expect(error.waits[0]?.call.name).toBe("gated")
        }
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Instructions.layer([Instructions.fromText("first", "first"), Instructions.fromText("second", "second")]),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Instructions.layer([Instructions.fromText("registry", "registry")]),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Instructions.layer([Instructions.fromText("registry", "registry")]),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Instructions.layer([Instructions.fromText("empty", "")]),
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
    const review: SkillCatalog.Skill = {
      ...testSkill("review", "Review code before changing it.", "FULL REVIEW BODY", {
        allowedTools: ["read", "grep"],
      }),
      tools: [reviewTool],
    }
    const deployBase = testSkill("deploy", "Deploy after verification.", "FULL DEPLOY BODY", {
      allowedTools: ["deploy"],
    })
    const deploy: SkillCatalog.Skill = {
      ...deployBase,
      instructions: Effect.sync(() => {
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
            firstTools = modelToolNames(options.tools)
            return Stream.make(toolCallPart("skill-call-review", "activate_skill", { name: "review" }))
          }
          secondPrompt = content
          secondTools = modelToolNames(options.tools)
          return Stream.make(textDelta("used review"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        SkillCatalog.layerSkills([review, deploy]),
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

  ItLayer.make(it, "restores activated skill state after replaying its bounded durable outcome", () => {
    let modelCalls = 0
    let bodyReads = 0
    let executorCalls = 0
    const replayTool = Tool.make("replayed_skill_tool", { parameters: Schema.Unknown, success: Schema.Unknown })
    const skill: SkillCatalog.Skill = {
      ...testSkill("replayed", "Contributes a replayed tool", "unused"),
      instructions: Effect.sync(() => {
        bodyReads += 1
        return "REPLAYED SKILL BODY"
      }),
      tools: [replayTool],
    }
    const noOutputPaths: ReadonlyArray<string> = []
    const bounded = {
      inline: {
        truncated: true as const,
        bytes: 4_096,
        maxBytes: 64,
        digest: "0".repeat(64),
        preview: "bounded activation",
      },
      outputPaths: noOutputPaths,
    }
    const replayed: DurableDriver.OperationOutcome = {
      _tag: "Succeeded",
      value: { _tag: "Success", result: bounded, encodedResult: bounded, outputPaths: [] },
    }
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(toolCallPart("replayed-activation", "activate_skill", { name: "replayed" }))
          }
          if (modelCalls === 2) {
            expect(modelToolNames(options.tools)).toContain("replayed_skill_tool")
            return Stream.make(toolCallPart("replayed-tool", "replayed_skill_tool", {}))
          }
          return Stream.make(textDelta("done"))
        }),
        SkillCatalog.layerSkills([skill]),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              executorCalls += 1
              expect(request.call.name).toBe("replayed_skill_tool")
              return { _tag: "Success" as const, result: "replayed", encodedResult: "replayed" }
            }),
        }),
      ),
      Effect.gen(function* () {
        const journal: DurableDriver.Journal = {
          onScheduled: (operation) => {
            const input = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String }))(operation.input)
            return operation.kind === "tool" && Option.isSome(input) && input.value.name === "activate_skill"
              ? Effect.succeed(replayed)
              : Effect.void
          },
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        }
        const agent = Agent.make({ name: "replayed-skill-agent" })

        const events = yield* Agent.stream(agent, {
          prompt: "replay activation",
          logicalOperationId: "replayed-skill-run",
        }).pipe(Stream.runCollect, Effect.provideService(DurableDriver.DriverJournal, journal))

        expect(events.at(-1)?._tag).toBe("Completed")
        expect(bodyReads).toBe(1)
        expect(executorCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a static and activated-skill collision before another model request", () => {
    let modelCalls = 0
    let bodyReads = 0
    let executorCalls = 0
    const collidingSkill: SkillCatalog.Skill = {
      ...testSkill("collision", "Contributes a colliding tool", "unused"),
      instructions: Effect.sync(() => {
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
        SkillCatalog.layerSkills([collidingSkill]),
        ToolExecutor.layerTest({
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
    const first: SkillCatalog.Skill = {
      ...testSkill("first", "First shared tool", "first body"),
      tools: [sharedTool],
    }
    const second: SkillCatalog.Skill = {
      ...testSkill("second", "Second shared tool", "second body"),
      instructions: Effect.sync(() => {
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
        SkillCatalog.layerSkills([first, second]),
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
    const skill: SkillCatalog.Skill = {
      ...testSkill("isolated", "Run-local tools", "isolated body"),
      tools: [skillTool],
    }
    let activationTurns = 0
    const plainRunTools: Array<ReadonlyArray<string>> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = Json.stringify(options.prompt.content)
          const names = modelToolNames(options.tools)
          if (content.includes("plain run")) {
            plainRunTools.push(names)
            return Stream.make(textDelta("plain"))
          }
          activationTurns += 1
          return activationTurns === 1
            ? Stream.make(toolCallPart("activate-isolated", "activate_skill", { name: "isolated" }))
            : Stream.make(textDelta("activated"))
        }),
        SkillCatalog.layerSkills([skill]),
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
    const skill: SkillCatalog.Skill = {
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
        SkillCatalog.layerSkills([skill]),
        ToolExecutor.layerTest({
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

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(executorCalls).toBe(0)
        expect(modelCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "restores an activated skill from its original call when the persisted result is bounded", () => {
    let modelCalls = 0
    let executorCalls = 0
    let bodyReads = 0
    let suspendedTranscript: Prompt.Prompt | undefined
    const skillBody = `checkpointed body ${"x".repeat(4 * 1024)}`
    const resumableTool = Tool.make("resumable_skill_tool", { parameters: Schema.Unknown, success: Schema.Unknown })
    const skill: SkillCatalog.Skill = {
      ...testSkill("resumable", "Contributes a resumable tool", "unused"),
      instructions: Effect.sync(() => {
        bodyReads += 1
        return skillBody
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
        SkillCatalog.layerSkills([skill]),
        ToolExecutor.layerTest({
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
        const failure = yield* Agent.stream(agent, { prompt: "activate resumable", toolOutputMaxBytes: 256 }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") suspendedTranscript = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )

        expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
        if (failure._tag !== "tenetkit/core/AgentSuspended" || suspendedTranscript === undefined) {
          return yield* Effect.die("missing activated skill checkpoint")
        }
        const persisted = Json.stringify(suspendedTranscript.content)
        expect(persisted).toContain('"truncated":true')
        expect(persisted).not.toContain(skillBody)

        const resumed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: suspendedTranscript,
            resume: {
              suspension: failure,
              resolutions: [toolResultResolution(failure, "resumable-call", "restored")],
            },
            toolOutputMaxBytes: 256,
          }),
        )

        expect(resumed.at(-1)?._tag).toBe("Completed")
        expect(executorCalls).toBe(1)
        expect(bodyReads).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "keeps runs without SkillCatalog unchanged", () => {
    let capturedPrompt: Prompt.Prompt | undefined
    let capturedTools: ReadonlyArray<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedPrompt = options.prompt
          capturedTools = modelToolNames(options.tools)
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-skills-agent", instructions: "plain instructions" })

        const result = yield* Agent.generate(agent, { prompt: "hello" })

        expect(result.text).toBe("done")
        if (capturedPrompt === undefined) return yield* Effect.die("model did not capture prompt")
        const expectedMessages = yield* Schema.decodeUnknownEffect(Schema.Array(Prompt.Message))(
          Json.parse(
            `[{"content":"plain instructions","options":{"anthropic":{"cacheControl":{"type":"ephemeral","ttl":"1h"}},"amazonBedrock":{"cachePoint":true}},"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"system"},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{"anthropic":{"cacheControl":{"type":"ephemeral"}},"amazonBedrock":{"cachePoint":true}}}],"options":{},"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user"}]`,
          ),
        )
        expect(capturedPrompt).toEqual(Prompt.fromMessages(expectedMessages))
        expect(capturedTools).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "preserves empty system instructions without SkillCatalog", () => {
    let capturedPrompt: Prompt.Prompt | undefined
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          capturedPrompt = options.prompt
          return Stream.make(textDelta("done"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "empty-system-agent", instructions: "" })

        const result = yield* Agent.generate(agent, { prompt: "hello" })

        expect(result.text).toBe("done")
        if (capturedPrompt === undefined) return yield* Effect.die("model did not capture prompt")
        const expectedMessages = yield* Schema.decodeUnknownEffect(Schema.Array(Prompt.Message))(
          Json.parse(
            `[{"content":"","options":{"anthropic":{"cacheControl":{"type":"ephemeral","ttl":"1h"}},"amazonBedrock":{"cachePoint":true}},"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"system"},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{"anthropic":{"cacheControl":{"type":"ephemeral"}},"amazonBedrock":{"cachePoint":true}}}],"options":{},"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user"}]`,
          ),
        )
        expect(capturedPrompt).toEqual(Prompt.fromMessages(expectedMessages))
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces finish usage while preserving raw finish parts", () => {
    const reportedUsage = usage({ total: 12, cacheRead: 2 }, { total: 5, text: 4 })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fromIterable([textDelta("done"), finishPart("stop", reportedUsage)])),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "usage-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "report usage" }))

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "reports only the final turn's answer, not every turn's narration", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.fromIterable([
                textDelta("I'll check the workspace first."),
                toolCallPart("tool-call-narrated", "echo", { text: "looking" }),
              ])
            : Stream.make(textDelta("The workspace has two packages."))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "narration-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "explore" }))

        expect(calls).toBe(2)
        const completed = events.at(-1)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("The workspace has two packages.")
          expect(completed.text).not.toContain("I'll check the workspace first.")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "fails a run whose last turn reported an unknown finish reason with no output", () => {
    const cutReasoning = "The report should list both packages"
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-cut-report", "echo", { text: "looking" }))
            : Stream.fromIterable([
                reasoningDelta(cutReasoning),
                finishPart("unknown", usage({ total: 10 }, { total: 2 })),
              ])
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "cut-report-agent", toolkit: Toolkit.make(echoTool) })
        const events: Array<AgentEvent.Event> = []

        const failure = yield* Agent.stream(agent, { prompt: "explore" }).pipe(
          Stream.tap((event) => Effect.sync(() => events.push(event))),
          Stream.runDrain,
          Effect.flip,
        )

        expect(calls).toBe(2)
        expect(events.some((event) => event._tag === "Completed")).toBe(false)
        expect(events.some((event) => event._tag === "TurnCompleted" && event.turn === 1)).toBe(true)
        expect(failure).toMatchObject({
          _tag: "tenetkit/core/RunEndedWithoutOutput",
          turn: 1,
          finishReason: "unknown",
          providerTextCharacters: 0,
          reasoningCharacters: cutReasoning.length,
        })
      }),
    ] as const
  })

  ItLayer.make(it, "completes the same run when the last turn reasons and then answers", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-answered-report", "echo", { text: "looking" }))
            : Stream.fromIterable([
                reasoningDelta("The report should list both packages"),
                textDelta("The workspace has two packages."),
                finishPart("stop", usage({ total: 10 }, { total: 2 })),
              ])
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "answered-report-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "explore" }))

        const completed = events.find((event) => event._tag === "Completed")
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(completed.text).toBe("The workspace has two packages.")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "completes a run whose only text arrived in the last of several turns", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-silent-first", "echo", { text: "looking" }))
            : Stream.make(textDelta("done exploring"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "silent-first-turn-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "explore" }))

        expect(calls).toBe(2)
        const completed = events.find((event) => event._tag === "Completed")
        expect(completed?._tag === "Completed" && completed.text).toBe("done exploring")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "fails a run whose stream was cut before any output rather than completing it",
    () =>
      [
        Layer.mergeAll(
          unterminatedModelLayer(() => Stream.make(responseMetadataPart("req-cut-before-output"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "cut-before-output-agent" })
          const events: Array<AgentEvent.Event> = []

          const failure = yield* Agent.stream(agent, { prompt: "answer" }).pipe(
            Stream.tap((event) => Effect.sync(() => events.push(event))),
            Stream.runDrain,
            Effect.flip,
          )

          expect(events.some((event) => event._tag === "Completed")).toBe(false)
          expect(failure).toMatchObject({ _tag: "tenetkit/core/AgentError", turn: 0 })
          expect(
            failure._tag === "tenetkit/core/AgentError" && Schema.is(ModelStreamTermination.Truncated)(failure.cause),
          ).toBe(true)
        }),
      ] as const,
  )

  ItLayer.make(it, "completes when a retried attempt answers after an earlier attempt was cut", () => {
    let attempts = 0
    return [
      Layer.mergeAll(
        unterminatedModelLayer(() => {
          attempts += 1
          return attempts === 1
            ? Stream.make(responseMetadataPart("req-cut-first-attempt"))
            : Stream.fromIterable([textDelta("the recovered answer"), finishPart("stop", usage({}, {}))])
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        ModelResilience.layer({ retrySchedule: Schedule.recurs(1) }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "retried-attempt-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "answer" }))

        expect(attempts).toBe(2)
        const completed = events.find((event) => event._tag === "Completed")
        expect(completed?._tag === "Completed" && completed.text).toBe("the recovered answer")
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting a turn that has produced no text stays interrupted", () => {
    let started: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.fromEffect(
            started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
          ).pipe(Stream.drain, Stream.concat(Stream.never)),
        ),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({ name: "interrupted-without-output-agent" })
        const events: Array<AgentEvent.Event> = []
        const fiber = yield* Agent.stream(agent, { prompt: "never answers" }).pipe(
          Stream.tap((event) => Effect.sync(() => events.push(event))),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentStarted)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
        expect(events.some((event) => event._tag === "Completed")).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves custom authorizer requirements in the run type", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("required-authorizer", "echo", { text: "run" }))
            : Stream.make(textDelta("authorized"))
        }),
        echoExecutor,
        ModelMiddleware.layerIdentity,
        Layer.succeed(AuthorizationDependency, "available"),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "required-authorizer-agent",
          toolkit: Toolkit.make(echoTool),
          authorization: {
            authorize: () => Effect.as(AuthorizationDependency, { _tag: "Execute" as const }),
          },
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "authorize" }))

        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
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
        ToolExecutor.layerTest({
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
            ToolExecutor.layerTest({
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
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
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
            ToolExecutor.layerTest({
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
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
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
        ToolExecutor.layerTest({
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
            ToolExecutor.layerTest({
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
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
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

        expect(failure).toBeInstanceOf(AgentEvent.ProgressOverflow)
        if (Schema.is(AgentEvent.ProgressOverflow)(failure)) {
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
        ToolExecutor.layerTest({
          execute: () =>
            Effect.gen(function* () {
              const context = yield* ToolContext.ToolContext
              yield* context.emit({ toolCallId: "tool-call-progress-failure", message: "before failure" })
              return { _tag: "DomainFailure", failure: "tool failed", encodedFailure: "tool failed" }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
    let toolContext!: ToolContext.Service
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
            ToolExecutor.layerTest({
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
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
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
        expect(
          yield* toolContext.emit({ toolCallId: "tool-call-abandoned-progress", message: "after cancellation" }),
        ).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "provides ToolContext to default toolkit handlers", () => {
    let calls = 0
    let handlerSessionId = ""
    const handledTool = Tool.make("handled-context", {
      description: "Reads TenetKit ToolContext from a toolkit handler",
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
        ToolExecutor.layerToolkit(toolkit).pipe(Layer.provide(handlers)),
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-handled-context", "handled-context", { text: "from model" }))
            : Stream.make(textDelta("after handler"))
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        Approvals.layerTest({
          resolve: (request) => {
            approvalSessionId = request.sessionId ?? ""
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "gated-session-agent", toolkit: Toolkit.make(gatedTool) })

        const failure = yield* Effect.flip(
          Stream.runDrain(Agent.stream(agent, { prompt: "needs approval", sessionId: "session-approval" })),
        )

        expect(approvalSessionId).toBe("session-approval")
        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
      }),
    ] as const
  })

  ItLayer.make(it, "emits ApprovalRequested before a blocking approval check completes", () => {
    let modelCalls = 0
    let approval: Deferred.Deferred<Approvals.Resolution> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("blocking-approval", "gated", { text: "wait" }))
            : Stream.make(textDelta("after blocking approval"))
        }),
        unusedExecutor,
        Approvals.layerTest({
          resolve: () => (approval === undefined ? Effect.die("missing approval Deferred") : Deferred.await(approval)),
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        approval = yield* Deferred.make<Approvals.Resolution>()
        const requested = yield* Deferred.make<AgentEvent.ApprovalRequest>()
        const agent = Agent.make({ name: "blocking-approval-agent", toolkit: Toolkit.make(gatedTool) })
        const fiber = yield* Stream.runForEach(Agent.stream(agent, { prompt: "wait for approval" }), (event) =>
          event._tag === "ApprovalRequested"
            ? Deferred.succeed(requested, event.request).pipe(Effect.asVoid)
            : Effect.void,
        ).pipe(Effect.forkChild({ startImmediately: true }))

        expect(yield* Deferred.await(requested)).toEqual({
          approvalId: "approval:blocking-approval",
          operation: "blocking-approval",
          capability: "gated",
          input: { text: "wait" },
        })
        expect(fiber.pollUnsafe()).toBeUndefined()
        yield* Deferred.succeed(approval, { _tag: "Denied" })
        const failure = yield* Fiber.join(fiber).pipe(Effect.flip)
        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
      }),
    ] as const
  })

  ItLayer.make(it, "denies through Permissions before approvals or executor", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-permission-deny", "gated", { text: "blocked" }))
          }
          return Stream.make(textDelta("saw denied permission"))
        }),
        ToolExecutor.layerTest({ execute: () => Effect.die("permission-denied call must not execute") }),
        Approvals.layerTest({ resolve: () => Effect.die("permission-denied call must not ask approvals") }),
        Permissions.layerRuleset({ rules: [{ pattern: "gated", level: "deny" }] }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-deny-agent", toolkit: Toolkit.make(gatedTool) })
        const events: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "needs permission" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
        expect(calls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "allows through Permissions while preserving tool-declared approvals", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-permission-allow", "gated", { text: "still gated" }))
          }
          return Stream.make(textDelta("saw approval denial"))
        }),
        ToolExecutor.layerTest({ execute: () => Effect.die("approval-denied call must not execute") }),
        Approvals.layerDenyAll,
        Permissions.layerAllowAll,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-allow-agent", toolkit: Toolkit.make(gatedTool) })
        const events: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "needs approval" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
        expect(calls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "never executes a tool missing from the fail-closed policy", () => {
    const events: Array<AgentEvent.Event> = []
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-permission-ask", "gated", { text: "ask" }))),
        ToolExecutor.layerTest({ execute: () => Effect.die("unclassified tool must not execute") }),
        Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
        Permissions.layerFailClosed(),
        ModelMiddleware.layerIdentity,
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
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "ApprovalRequested",
          "TurnCompleted",
        ])
        expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
        if (failure._tag === "tenetkit/core/AgentSuspended") {
          expect(failure.waits[0]?.reason).toBe("approval")
          expect(failure.waits[0]?.token).toBe("permission:tool-call-permission-ask")
          expect(failure.waits[0]?.call.name).toBe("gated")
          expect(failure.waits[0]?.call.params).toEqual({ text: "ask" })
        }
      }),
    ] as const
  })

  ItLayer.make(it, "does not let permission Allow bypass needsApproval", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-permission-approved", "gated", { text: "approved" }))
            : Stream.make(textDelta("after approved permission"))
        }),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
        }),
        Approvals.layerDenyAll,
        Permissions.layerAllowAll,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-approved-agent", toolkit: Toolkit.make(gatedTool) })
        const events: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "ask then approve" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "remembers an approved rule through the single approval flow", () => {
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
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
        }),
        Approvals.layerTest({
          resolve: () => Effect.succeed({ _tag: "Approved", remember: { pattern: "gated", level: "allow" } }),
        }),
        Permissions.layerRuleset({ rules: [], fallback: "ask" }),
        Permissions.layerRuleStoreTest({
          remember: (rule) =>
            Effect.sync(() => {
              remembered.push(rule)
            }),
          rules: Effect.succeed([]),
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "permission-always-agent", toolkit: Toolkit.make(gatedTool) })
        const events: Array<AgentEvent.Event> = []

        yield* Stream.runForEach(Agent.stream(agent, { prompt: "ask always" }), (event) =>
          Effect.sync(() => events.push(event)),
        )

        expect(remembered).toEqual([{ pattern: "gated", level: "allow" }])
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "reads a remembered approved rule before asking again", () => {
    let modelCalls = 0
    let asks = 0
    let executions = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.fromIterable([
                toolCallPart("tool-call-always-first", "echo", { text: "first" }),
                toolCallPart("tool-call-always-second", "echo", { text: "second" }),
              ])
            : Stream.make(textDelta("after remembered permission"))
        }),
        ToolExecutor.layerTest({
          execute: (request) => {
            executions += 1
            return Effect.succeed({
              _tag: "Success",
              result: request.call.params,
              encodedResult: request.call.params,
            })
          },
        }),
        Permissions.layerRuleset({ rules: [], fallback: "ask" }),
        Approvals.layerTest({
          resolve: () => {
            asks += 1
            return Effect.succeed({
              _tag: "Approved",
              remember: { pattern: "echo", level: "allow" },
            })
          },
        }),
        Permissions.layerRuleStoreMemory(),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "remembered-always-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "remember approval" }))

        expect(asks).toBe(1)
        expect(executions).toBe(2)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "owns the default RuleStore for later calls in the run", () => {
    let modelCalls = 0
    let resolutions = 0
    let executions = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.fromIterable([
                toolCallPart("default-store-first", "echo", { text: "first" }),
                toolCallPart("default-store-second", "echo", { text: "second" }),
              ])
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) => {
            executions += 1
            return Effect.succeed({
              _tag: "Success",
              result: request.call.params,
              encodedResult: request.call.params,
            })
          },
        }),
        Permissions.layerRuleset({ rules: [], fallback: "ask" }),
        Approvals.layerTest({
          resolve: () => {
            resolutions += 1
            return Effect.succeed({
              _tag: "Approved",
              remember: { pattern: "echo", level: "allow" },
            })
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "default-rule-store-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "remember" }))

        expect(resolutions).toBe(1)
        expect(executions).toBe(2)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects middleware changing a call to an excluded static tool", () => {
    let modelCalls = 0
    let gatedExecutions = 0
    const policy = Policy.make(({ turn }) =>
      Effect.succeed(Policy.decision.continue(turn === 1 ? { activeTools: ["echo"] } : undefined)),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) return Stream.make(toolCallPart("active-seed", "echo", { text: "seed" }))
          if (modelCalls === 2) return Stream.make(toolCallPart("excluded-static", "echo", { text: "blocked" }))
          return Stream.make(textDelta("after excluded tool"))
        }),
        ToolExecutor.layerTest({
          execute: (request) => {
            if (request.call.name === "gated") gatedExecutions += 1
            return Effect.succeed({
              _tag: "Success",
              result: request.call.params,
              encodedResult: request.call.params,
            })
          },
        }),
        Approvals.layerTest({ resolve: () => Effect.die("excluded tool must not request approval") }),
        ModelMiddleware.layer([
          {
            transformPart: (part) =>
              Effect.succeed(
                Option.some(
                  part.type === "tool-call" && part.id === "excluded-static"
                    ? toolCallPart(part.id, "gated", part.params)
                    : part,
                ),
              ),
          },
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "active-tools-agent",
          toolkit: Toolkit.make(echoTool, gatedTool),
          policy,
        })

        const events: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "use active tools" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(Schema.is(AgentEvent.MiddlewareViolation)(failure)).toBe(true)
        expect(gatedExecutions).toBe(0)
        expect(events.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(
          events.some((event) => event._tag === "ToolExecutionCompleted" && event.call.id === "excluded-static"),
        ).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects middleware introducing an excluded activated skill tool", () => {
    let modelCalls = 0
    const reviewTool = Tool.make("review_tool", {
      parameters: Schema.Struct({ target: Schema.String }),
      success: Schema.Unknown,
    })
    const review: SkillCatalog.Skill = {
      ...testSkill("review-active", "Review active tool behavior.", "REVIEW BODY"),
      tools: [reviewTool],
    }
    const policy = Policy.make(() => Effect.succeed(Policy.decision.continue({ activeTools: ["activate_skill"] })))
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(toolCallPart("activate-review", "activate_skill", { name: "review-active" }))
          }
          return Stream.make(textDelta(modelCalls === 2 ? "invalid skill call" : "done"))
        }),
        ToolExecutor.layerTest({ execute: () => Effect.die("excluded skill tool must not execute") }),
        SkillCatalog.layerSkills([review]),
        ModelMiddleware.layer([
          {
            transformPart: (part, context) =>
              Effect.succeed(
                Option.some(
                  context.turn === 1 && part.type === "text-delta"
                    ? toolCallPart("excluded-skill", "review_tool", { target: "src" })
                    : part,
                ),
              ),
          },
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "active-skill-tools-agent", policy })

        const events: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "review" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(Schema.is(AgentEvent.MiddlewareViolation)(failure)).toBe(true)
        expect(events.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect(
          events.some((event) => event._tag === "ToolExecutionCompleted" && event.call.id === "excluded-skill"),
        ).toBe(false)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-steering-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete" }))

        expect(calls).toBe(1)
        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "Completed",
        ])
      }),
    ] as const
  })

  ItLayer.make(it, "re-derives Instructions on every Run of a continued Session", () => {
    const prompts: Array<string> = []
    let guidance = "GUIDANCE ONE"
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          prompts.push(Json.stringify(options.prompt.content))
          return Stream.make(
            Response.makePart("text-start", { id: "text" }),
            textDelta("ok"),
            Response.makePart("text-end", { id: "text" }),
          )
        }),
        Instructions.layer([{ id: "workspace", render: () => Effect.succeedSome(guidance) }]),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        Compaction.layer({ contextWindow: 1_000_000, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "session-epoch-agent", instructions: "fallback" })
        const sessionId = "session-epoch"

        yield* Stream.runCollect(Agent.stream(agent, { prompt: "one", sessionId }))
        guidance = "GUIDANCE TWO"
        yield* Stream.runCollect(Agent.stream(agent, { prompt: "two", sessionId }))

        expect(prompts[0]).toContain("GUIDANCE ONE")
        // A continued Session renders current guidance instead of the epoch captured on run one.
        expect(prompts[1]).toContain("GUIDANCE TWO")
        expect(prompts[1]).not.toContain("GUIDANCE ONE")
        expect(prompts[1]).toContain("one")
      }),
    ] as const
  })

  ItLayer.make(it, "continues an active Session across separate Runs", () => {
    const prompts: Array<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          prompts.push(Json.stringify(options.prompt.content))
          return Stream.make(
            Response.makePart("text-start", { id: "text" }),
            textDelta(`reply ${prompts.length}`),
            Response.makePart("text-end", { id: "text" }),
          )
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        Compaction.layer({ contextWindow: 1_000_000, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "session-continuity-agent" })
        const sessionId = "session-continuity"

        yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "first question", system: "stable instructions", sessionId }),
        )
        yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "second question", system: "stable instructions", sessionId }),
        )
        yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "third question", system: "stable instructions", sessionId }),
        )

        expect(prompts).toHaveLength(3)
        // Run 1 sees only its own prompt.
        expect(prompts[0]).toContain("first question")
        expect(prompts[0]).not.toContain("second question")
        // Run 2 sees run 1's exchange. This is the regression: it used to start empty.
        expect(prompts[1]).toContain("first question")
        expect(prompts[1]).toContain("reply 1")
        expect(prompts[1]).toContain("second question")
        // Run 3 sees both prior turns.
        expect(prompts[2]).toContain("first question")
        expect(prompts[2]).toContain("second question")
        expect(prompts[2]).toContain("reply 2")
        expect(prompts[2]).toContain("third question")
        // The system message is derived per Run and never becomes a Session entry.
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        expect(path.every((entry) => entry._tag !== "Message" || entry.message.role !== "system")).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "renders current instructions on a Session resumed with different instructions", () => {
    const prompts: Array<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          prompts.push(Json.stringify(options.prompt.content))
          return Stream.make(
            Response.makePart("text-start", { id: "text" }),
            textDelta("ok"),
            Response.makePart("text-end", { id: "text" }),
          )
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        Compaction.layer({ contextWindow: 1_000_000, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "session-instructions-agent" })
        const sessionId = "session-instructions"

        yield* Stream.runCollect(Agent.stream(agent, { prompt: "one", system: "ORIGINAL GUIDANCE", sessionId }))
        yield* Stream.runCollect(Agent.stream(agent, { prompt: "two", system: "EDITED GUIDANCE", sessionId }))

        expect(prompts[1]).toContain("EDITED GUIDANCE")
        expect(prompts[1]).not.toContain("ORIGINAL GUIDANCE")
        expect(prompts[1]).toContain("one")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps Session authoritative when Compaction is absent", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("done"))
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-compaction-agent" })
        const sessionId = "no-compaction"

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete", sessionId }))

        expect(calls).toBe(1)
        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "Completed",
        ])
        const projection = Session.buildContext(
          yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path()))),
        )
        expect(projection.content.map((message) => message.role)).toEqual(["user", "assistant"])
      }),
    ] as const
  })

  ItLayer.make(it, "does not measure prompts when Compaction is absent", () => {
    let calls = 0
    let tokenizerCalls = 0
    const tokenizer = Layer.succeed(
      Tokenizer.Tokenizer,
      Tokenizer.Tokenizer.of({
        tokenize: () => {
          tokenizerCalls += 1
          return Effect.die("Tokenizer must not run without Compaction")
        },
        truncate: () => {
          tokenizerCalls += 1
          return Effect.die("Tokenizer must not run without Compaction")
        },
      }),
    )
    const prompt = Prompt.fromMessages([
      Prompt.makeMessage("tool", {
        content: [
          Prompt.makePart("tool-result", {
            id: "bigint-result",
            name: "echo",
            isFailure: false,
            providerExecuted: false,
            result: { value: 1n },
          }),
        ],
      }),
    ])
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("done"))
        }),
        tokenizer,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-compaction-measurement-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt }))

        expect(calls).toBe(1)
        expect(tokenizerCalls).toBe(0)
        expect(events.at(-1)?._tag).toBe("Completed")
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
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "prepopulated-session"
        yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) => session.append({ _tag: "Message", message: seed })),
          ),
        )
        const agent = Agent.make({ name: "prepopulated-session-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "next", history: Prompt.fromMessages([seed]), sessionId }),
        )
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
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
        Compaction.layerTest({
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        ToolExecutor.layerTest({
          execute: () =>
            Effect.succeed({
              _tag: "Success",
              result: "x".repeat(800),
              encodedResult: "x".repeat(800),
            }),
        }),
        Compaction.layerTest({
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "uses reported usage for rebuilt context after compaction", () => {
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
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              measuredTokens.push(request.usage.contextTokens)
              return measuredTokens.length === 1
                ? Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("compacted") })
                : Option.none()
            }),
        }),
        characterTokenizerLayer,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "post-compaction-measurement-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "x".repeat(800), compaction: { contextWindow: 10_000 } }),
        )

        expect(streamCalls).toBe(2)
        expect(measuredTokens[0]).toBeGreaterThan(800)
        expect(measuredTokens[1]).toBeGreaterThan(9_999)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "uses prior reported input usage as the context baseline", () => {
    let streamCalls = 0
    const measuredTokens: Array<number> = []
    return [
      Layer.mergeAll(
        modelLayer(() => {
          streamCalls += 1
          return streamCalls === 1
            ? Stream.make(
                toolCallPart("tool-call-reported-context", "echo", { text: "small" }),
                finishPart("stop", usage({ total: 90_000 }, { total: 1 })),
              )
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              measuredTokens.push(request.usage.contextTokens)
              return Option.none()
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "reported-context-agent", toolkit: Toolkit.make(echoTool) }), {
            prompt: "small prompt",
            compaction: { contextWindow: 100_000 },
          }),
        )

        expect(streamCalls).toBe(2)
        expect(measuredTokens[0]).toBeLessThan(1_000)
        expect(measuredTokens[1]).toBeGreaterThanOrEqual(90_000)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "clears reported usage after a rewrite whose replacement call omits input usage", () => {
    let streamCalls = 0
    const measuredTokens: Array<number> = []
    const estimatedTokens: Array<number> = []
    return [
      Layer.mergeAll(
        modelLayer(() => {
          streamCalls += 1
          switch (streamCalls) {
            case 1:
              return Stream.make(
                toolCallPart("tool-call-before-rewrite", "echo", { text: "first" }),
                finishPart("stop", usage({ total: 90_000 }, { total: 1 })),
              )
            case 2:
              return Stream.make(
                toolCallPart("tool-call-replacement-without-usage", "echo", { text: "second" }),
                finishPart("stop", usage({}, { total: 1 })),
              )
            default:
              return Stream.make(textDelta("done"))
          }
        }),
        echoExecutor,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              measuredTokens.push(request.usage.contextTokens)
              estimatedTokens.push(estimatePromptTokens(Prompt.concat(request.history, request.prompt)))
              return measuredTokens.length === 2
                ? Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("replacement") })
                : Option.none()
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "replacement-without-usage-agent", toolkit: Toolkit.make(echoTool) }), {
            prompt: "original prompt",
            compaction: { contextWindow: 100_000 },
          }),
        )

        expect(streamCalls).toBe(3)
        expect(measuredTokens).toHaveLength(3)
        expect(measuredTokens[2]).toBe(estimatedTokens[2])
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "rechecks threshold usage after a rewritten context grows past a stale baseline", () => {
    let streamCalls = 0
    let toolCalls = 0
    let compactionCalls = 0
    const thresholdUsages: Array<number> = []
    return [
      Layer.mergeAll(
        modelLayer(() => {
          streamCalls += 1
          switch (streamCalls) {
            case 1:
              return Stream.make(
                toolCallPart("tool-call-stale-baseline-first", "echo", { text: "first" }),
                finishPart("stop", usage({ total: 10 }, { total: 1 })),
              )
            case 2:
              return Stream.make(
                toolCallPart("tool-call-stale-baseline-second", "echo", { text: "second" }),
                finishPart("stop", usage({}, { total: 1 })),
              )
            default:
              return Stream.make(textDelta("done"))
          }
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.sync(() => {
              toolCalls += 1
              const result = toolCalls === 1 ? "small" : "x".repeat(10_000)
              return { _tag: "Success", result, encodedResult: result }
            }),
        }),
        Compaction.layerTest({
          willCompact: ({ usage: measured }) => {
            thresholdUsages.push(measured.contextTokens)
            const baseline = thresholdUsages[0]
            return thresholdUsages.length < 3 || (baseline !== undefined && measured.contextTokens > baseline + 800)
          },
          maybeCompact: () =>
            Effect.sync(() => {
              compactionCalls += 1
              return compactionCalls === 2
                ? Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("replacement") })
                : Option.none()
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "stale-baseline-threshold-agent", toolkit: Toolkit.make(echoTool) }), {
            prompt: "a".repeat(4_000),
            compaction: { contextWindow: 100_000 },
          }),
        )

        expect(streamCalls).toBe(3)
        expect(compactionCalls).toBe(3)
        const baseline = thresholdUsages[0]
        const finalUsage = thresholdUsages[2]
        if (baseline === undefined || finalUsage === undefined) return yield* Effect.die("missing threshold usages")
        expect(finalUsage).toBeGreaterThan(baseline + 800)
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
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "default-compaction-agent", toolkit: Toolkit.make(echoTool) })
        const sessionId = "default-compaction"

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "old context", sessionId }))
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))

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
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "system-compaction-agent", toolkit: Toolkit.make(echoTool) })
        const sessionId = "system-compaction"

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "old context", system: "You are a careful test agent", sessionId }),
        )
        const completed = events.at(-1)

        expect(streamCalls).toBe(2)
        expect(secondPrompt).toContain("<conversation-checkpoint>")
        expect(secondPrompt).toContain("You are a careful test agent")
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          const path = yield* Effect.scoped(
            Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())),
          )
          expect(Json.stringify(Session.buildContext(path).content)).toBe(
            Json.stringify(conversation(completed.transcript)),
          )
        }
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints repeated mixed custom projections without duplicate or skipped Session entries", () => {
    let modelCalls = 0
    let compactions = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls < 5
            ? Stream.make(toolCallPart(`mixed-${modelCalls}`, "echo", { text: `turn-${modelCalls}` }))
            : Stream.make(textDelta("mixed complete"))
        }),
        echoExecutor,
        Session.layerMemory,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              compactions += 1
              const history = Prompt.fromMessages([
                Prompt.makeMessage("system", { content: "stable system" }),
                Prompt.makeMessage("user", {
                  content: [Prompt.makePart("text", { text: `projection-${compactions}` })],
                }),
              ])
              return Option.some(
                compactions % 2 === 0
                  ? { _tag: "Microcompact" as const, history, prompt: Prompt.empty }
                  : {
                      _tag: "Summarize" as const,
                      history,
                      prompt: Prompt.empty,
                      summary: `summary-${compactions}`,
                    },
              )
            }).pipe(Compaction.withLifecycle(request)),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "mixed-checkpoint-agent", toolkit: Toolkit.make(echoTool) })
        const sessionId = "mixed-checkpoint"

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "start mixed checkpoints", sessionId }))
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        const checkpoints = path.filter((entry) => entry._tag === "Compaction")
        const completed = events.at(-1)

        expect(modelCalls).toBe(5)
        expect(compactions).toBe(5)
        expect(checkpoints).toHaveLength(5)
        expect(new Set(checkpoints.map((entry) => entry.id)).size).toBe(5)
        expect(checkpoints.every((entry) => entry._tag === "Compaction")).toBe(true)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(Json.stringify(Session.buildContext(path).content)).toBe(
            Json.stringify(conversation(completed.transcript)),
          )
          expect(Json.stringify(completed.transcript.content)).toContain("projection-5")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints truncate projections with identical live and rebuilt history", () => {
    const tokenizer = Layer.succeed(
      Tokenizer.Tokenizer,
      Tokenizer.Tokenizer.of({
        tokenize: (input) => Effect.succeed(Prompt.make(input).content.map((_, index) => index)),
        truncate: (input, tokens) => Effect.succeed(Prompt.fromMessages(Prompt.make(input).content.slice(-tokens))),
      }),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("truncated"))),
        Session.layerMemory,
        Compaction.layerTest(Compaction.truncate(1)),
        tokenizer,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "truncate-checkpoint"
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "truncate-checkpoint-agent" }), {
            prompt: "newest prompt",
            history: Prompt.fromMessages([
              Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "old prompt" })] }),
            ]),
            compaction: { contextWindow: 1 },
            sessionId,
          }),
        )
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        const completed = events.at(-1)
        const checkpoint = path.find((entry) => entry._tag === "Compaction")
        const messages = path.filter((entry) => entry._tag === "Message")

        expect(checkpoint).toBeDefined()
        expect(messages).toHaveLength(3)
        expect(new Set(messages.map((entry) => entry.id)).size).toBe(3)
        expect(messages[0]?.id).toContain(":session-entry:root:0:user")
        expect(messages[1]?.id).toContain(`:session-entry:checkpoint:${checkpoint?.id ?? "missing"}:0:user`)
        expect(messages[1]?.parentId).toBe(checkpoint?.id)
        expect(Json.stringify(path)).toContain("old prompt")
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(Json.stringify(Session.buildContext(path).content)).toBe(
            Json.stringify(conversation(completed.transcript)),
          )
          expect(Json.stringify(completed.transcript.content)).toContain("newest prompt")
          expect(Json.stringify(completed.transcript.content)).not.toContain("old prompt")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a custom compaction projection with an orphan tool result", () => {
    const orphan = Prompt.makeMessage("tool", {
      content: [
        Prompt.makePart("tool-result", {
          id: "orphan",
          name: "echo",
          isFailure: false,
          providerExecuted: false,
          result: "orphaned",
        }),
      ],
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.die("invalid projection must fail before the model")),
        Session.layerMemory,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.fromMessages([orphan]),
                prompt: Prompt.empty,
              }),
            ).pipe(Compaction.withLifecycle(request)),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "orphan-checkpoint"
        const failure = yield* Agent.stream(Agent.make({ name: "orphan-checkpoint-agent" }), {
          prompt: "invalid",
          sessionId,
        }).pipe(Stream.runDrain, Effect.flip)

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(failure.message).toContain("orphan tool result")
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        expect(path.some((entry) => entry._tag === "Compaction")).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects duplicate unresolved tool calls in a custom compaction projection", () => {
    const duplicateCalls = Prompt.makeMessage("assistant", {
      content: [
        Prompt.makePart("tool-call", {
          id: "duplicate",
          name: "echo",
          params: { text: "first" },
          providerExecuted: false,
        }),
        Prompt.makePart("tool-call", {
          id: "duplicate",
          name: "echo",
          params: { text: "second" },
          providerExecuted: false,
        }),
        Prompt.makePart("tool-result", {
          id: "duplicate",
          name: "echo",
          isFailure: false,
          providerExecuted: false,
          result: "only one result",
        }),
      ],
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.die("invalid projection must fail before the model")),
        Session.layerMemory,
        Compaction.layerTest({
          maybeCompact: () =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact",
                history: Prompt.fromMessages([duplicateCalls]),
                prompt: Prompt.empty,
              }),
            ),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "duplicate-tool-checkpoint"
        const failure = yield* Agent.stream(Agent.make({ name: "duplicate-tool-checkpoint-agent" }), {
          prompt: "invalid",
          sessionId,
        }).pipe(Stream.runDrain, Effect.flip)
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(failure.message).toContain("duplicate tool call")
        expect(path.every((entry) => entry._tag !== "Compaction")).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints a provider-executed tool exchange without orphaning its result", () => {
    const reusedProviderCall = Prompt.makePart("tool-call", {
      id: "provider-reused",
      name: "provider-search",
      params: { query: "reused" },
      providerExecuted: true,
    })
    const providerCall = Prompt.makePart("tool-call", {
      id: "provider-checkpoint",
      name: "provider-search",
      params: { query: "TenetKit" },
      providerExecuted: true,
    })
    const providerResult = Prompt.makePart("tool-result", {
      id: "provider-checkpoint",
      name: "provider-search",
      isFailure: false,
      providerExecuted: true,
      result: { answer: "found" },
    })
    const projected = Prompt.fromMessages([
      Prompt.makeMessage("assistant", { content: [reusedProviderCall] }),
      Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "next response" })] }),
      Prompt.makeMessage("assistant", { content: [reusedProviderCall] }),
      Prompt.makeMessage("assistant", { content: [providerCall] }),
      Prompt.makeMessage("tool", { content: [providerResult] }),
    ])
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Session.layerMemory,
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact" as const,
                history: projected,
                prompt: Prompt.empty,
              }),
            ).pipe(Compaction.withLifecycle(request)),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "provider-checkpoint"
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "provider-checkpoint-agent" }), {
            prompt: "compact provider exchange",
            sessionId,
          }),
        )
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        const completed = events.at(-1)

        expect(path.some((entry) => entry._tag === "Compaction")).toBe(true)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          expect(Session.buildContext(path).content).toEqual(conversation(completed.transcript))
        }
      }),
    ] as const
  })

  ItLayer.make(it, "reconciles structurally equal Session messages with reordered object keys", () => {
    const toolMessage = (params: Readonly<Record<string, number>>) =>
      Prompt.makeMessage("assistant", {
        content: [
          Prompt.makePart("tool-call", {
            id: "reordered-session",
            name: "provider-search",
            params,
            providerExecuted: true,
          }),
        ],
      })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const sessionId = "structural-session"
        yield* Effect.scoped(
          Session.acquire(sessionId).pipe(
            Effect.flatMap((session) =>
              session.append({ _tag: "Message", message: toolMessage({ first: 1, second: 2 }) }),
            ),
          ),
        )

        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "structural-session-agent" }), {
            history: Prompt.fromMessages([toolMessage({ second: 2, first: 1 })]),
            prompt: "continue",
            sessionId,
          }),
        )
        const completed = events.at(-1)

        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") {
          const path = yield* Effect.scoped(
            Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())),
          )
          expect(Session.buildContext(path).content).toEqual(completed.transcript.content)
        }
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
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layer({ contextWindow: 20_000, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
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
    let reactiveInput = ""
    let retriedPrompt = ""
    return [
      Layer.mergeAll(
        overflowModelLayer((options) => {
          calls += 1
          if (calls === 1) return Stream.fail(contextOverflowError("maximum context length exceeded"))
          retriedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("recovered"))
        }),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              if (request.overflow) {
                overflowRequests += 1
                reactiveInput = Json.stringify(request.prompt.content)
              }
              return Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.empty,
                prompt: Prompt.make(request.overflow ? "after overflow" : "proactive projection"),
              })
            }).pipe(Compaction.withLifecycle(request)),
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reactive-compaction-agent", model: overflowSelection })
        const sessionId = "reactive-compaction"

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "too large", sessionId }))

        expect(calls).toBe(2)
        expect(overflowRequests).toBe(1)
        expect(reactiveInput).toContain("proactive projection")
        expect(reactiveInput).not.toContain("too large")
        expect(retriedPrompt).toContain("after overflow")
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        expect(Json.stringify(Session.buildContext(path).content)).toContain("after overflow")
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "reactively compacts a decode-failure overflow from a model without a classifier", () => {
    let calls = 0
    let overflowRequests = 0
    const decodeFailure = AiError.make({
      module: "OpenAiClient",
      method: "createResponseStream",
      reason: AiError.InvalidOutputError.make({
        description:
          'Invalid output: Missing key\n  at [0]["data"]["code"]\nExpected UnknownResponseStreamEvent, got {"type":"error","error":{"type":"invalid_request_error","code":"context_length_exceeded","message":"Your input exceeds the context window of this model.","param":"input"},"sequence_number":2}',
      }),
    })
    return [
      Layer.mergeAll(
        Layer.unwrap(
          ModelRegistry.registration({
            ...overflowSelection,
            layer: modelLayer(() => {
              calls += 1
              return calls === 1 ? Stream.fail(decodeFailure) : Stream.make(textDelta("recovered"))
            }),
          }).pipe(Effect.map((registration) => ModelRegistry.layer([Effect.succeed(registration)]))),
        ),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              if (request.overflow) overflowRequests += 1
              return Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.empty,
                prompt: Prompt.make(request.overflow ? "compacted after overflow" : "proactive projection"),
              })
            }).pipe(Compaction.withLifecycle(request)),
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "fallback-overflow-agent", model: overflowSelection })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "too large" }))

        expect(calls).toBe(2)
        expect(overflowRequests).toBe(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "reactively compacts an overflow delivered after response metadata", () => {
    let calls = 0
    let overflowRequests = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(
                Schema.encodeSync(Response.ResponseMetadataPart)(
                  Response.makePart("response-metadata", {
                    id: "overflow-response",
                    modelId: "overflow-model",
                    timestamp: undefined,
                    request: undefined,
                  }),
                ),
                Response.makePart("error", {
                  error: contextOverflowError("input exceeds the context window"),
                }),
              )
            : Stream.make(textDelta("recovered"))
        }),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              if (request.overflow) overflowRequests += 1
              return Option.some({
                _tag: "Microcompact" as const,
                history: Prompt.empty,
                prompt: Prompt.make(request.overflow ? "after overflow" : "proactive projection"),
              })
            }).pipe(Compaction.withLifecycle(request)),
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "error-part-overflow-agent", model: overflowSelection })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "too large" }))

        expect(calls).toBe(2)
        expect(overflowRequests).toBe(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "fails after one reactive compaction retry", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return Stream.fail(contextOverflowError("context window overflow"))
        }),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Microcompact",
                history: Prompt.empty,
                prompt: Prompt.make(request.overflow ? "overflow retry" : "proactive projection"),
              }),
            ),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reactive-compaction-fail-agent", model: overflowSelection })

        const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "too large" })))

        expect(calls).toBe(2)
        expect(error._tag).toBe("tenetkit/core/AgentError")
      }),
    ] as const
  })

  ItLayer.make(it, "does not retry overflow after partial emission", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return Stream.concat(
            Stream.make(textDelta("partial")),
            Stream.fail(contextOverflowError("context length exceeded")),
          )
        }),
        Compaction.layerTest({
          maybeCompact: () =>
            Effect.succeed(Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") })),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "partial-overflow-agent", model: overflowSelection })

        const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial" })))

        expect(calls).toBe(1)
        expect(error._tag).toBe("tenetkit/core/AgentError")
      }),
    ] as const
  })

  ItLayer.make(it, "does not replay after framework and provider tool-call parts escape", () => {
    let calls = 0
    let executions = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return Stream.fromIterable([
            toolCallPart("framework-before-overflow", "echo", { text: "framework" }),
            providerToolCallPart("provider-before-overflow", "echo", { text: "provider" }),
          ]).pipe(Stream.concat(Stream.fail(contextOverflowError("context length exceeded"))))
        }),
        Compaction.layerTest({
          maybeCompact: () =>
            Effect.succeed(Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") })),
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.sync(() => {
              executions += 1
              return { _tag: "Success" as const, result: "done", encodedResult: "done" }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "tool-call-overflow-agent",
          model: overflowSelection,
          toolkit: Toolkit.make(echoTool),
        })

        yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "tools" })))

        expect(calls).toBe(1)
        expect(executions).toBeLessThanOrEqual(1)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves the overflow failure when forced compaction does not change the projection", () => {
    const overflow = contextOverflowError("context length exceeded")
    let calls = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return Stream.fail(overflow)
        }),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(Option.some({ _tag: "Microcompact", history: request.history, prompt: request.prompt })),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "unchanged-overflow-agent", model: overflowSelection })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "unchanged" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") expect(failure.cause).toBe(overflow)
      }),
    ] as const
  })

  ItLayer.make(it, "keeps classified context overflow terminal to ModelResilience", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          calls += 1
          return Stream.fail(contextOverflowError("context length exceeded"))
        }),
        Compaction.layerTest({
          maybeCompact: () => Effect.succeed(Option.none()),
        }),
        ModelResilience.layer({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "terminal-overflow-agent", model: overflowSelection })

        yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "too large" })))

        expect(calls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "keeps same-Session concurrent Run inboxes isolated", () => {
    const prompts = { first: new Array<string>(), second: new Array<string>() }
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const prompt = Json.stringify(options.prompt.content)
          const run = prompt.includes("initial first") ? "first" : "second"
          prompts[run].push(prompt)
          return Stream.make(textDelta(`completed ${run}`))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.scoped(
        Effect.gen(function* () {
          const agent = Agent.make({ name: "same-session-steering-agent" })
          const first = yield* Agent.makeRun(agent, {
            prompt: "initial first",
            sessionId: "shared-conversation",
          })
          const second = yield* Agent.makeRun(agent, {
            prompt: "initial second",
            sessionId: "shared-conversation",
          })
          yield* first.steer({ prompt: "correction first only" })
          yield* second.steer({ prompt: "correction second only" })

          const [firstEvents, secondEvents] = yield* Effect.all(
            [Stream.runCollect(first.events), Stream.runCollect(second.events)],
            { concurrency: "unbounded" },
          )

          expect(first.runId).not.toBe(second.runId)
          expect(prompts.first).toHaveLength(2)
          expect(prompts.second).toHaveLength(2)
          expect(prompts.first[1]).toContain("correction first only")
          expect(prompts.first[1]).not.toContain("correction second only")
          expect(prompts.second[1]).toContain("correction second only")
          expect(prompts.second[1]).not.toContain("correction first only")
          expect(firstEvents.filter((event) => event._tag === "Completed")).toHaveLength(1)
          expect(secondEvents.filter((event) => event._tag === "Completed")).toHaveLength(1)
          expect(yield* first.steer({ prompt: "late first" }).pipe(Effect.flip)).toBeInstanceOf(Steering.RunClosed)
          expect(yield* second.steer({ prompt: "late second" }).pipe(Effect.flip)).toBeInstanceOf(Steering.RunClosed)
        }),
      ),
    ] as const
  })

  ItLayer.make(it, "admits a backpressured input after an exact FIFO drain", () => {
    let started: Deferred.Deferred<void> | undefined
    let release: Deferred.Deferred<void> | undefined
    let calls = 0
    const prompts: Array<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          prompts.push(Json.stringify(options.prompt.content))
          if (calls === 1) {
            if (started === undefined || release === undefined) return Stream.die("missing steering latch")
            return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.drain,
              Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
              Stream.concat(Stream.make(toolCallPart("tool-call-backpressure", "echo", { text: "from model" }))),
            )
          }
          return Stream.make(textDelta(`turn ${calls}`))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.scoped(
        Effect.gen(function* () {
          started = yield* Deferred.make<void>()
          release = yield* Deferred.make<void>()
          const agent = Agent.make({ name: "backpressured-steering-agent", toolkit: Toolkit.make(echoTool) })
          const run = yield* Agent.makeRun(agent, {
            prompt: "start",
            steering: { steering: { mode: "one-at-a-time", capacity: 1, onFull: "backpressure" } },
          })
          yield* run.steer({ prompt: "first correction" })
          const events = yield* Stream.runCollect(run.events).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          const duplicateExit = yield* Stream.runDrain(run.events).pipe(Effect.exit)
          expect(Exit.isFailure(duplicateExit)).toBe(true)
          const blocked = yield* run
            .steer({ prompt: "second correction" })
            .pipe(Effect.forkChild({ startImmediately: true }))
          yield* Effect.yieldNow
          expect(blocked.pollUnsafe()).toBeUndefined()

          yield* Deferred.succeed(release, undefined)
          const receipt = yield* Fiber.join(blocked)
          const completed = yield* Fiber.join(events)

          expect(receipt).toMatchObject({ runId: run.runId, queue: "steering", sequence: 1 })
          expect(calls).toBe(3)
          expect(prompts[1]).toContain("first correction")
          expect(prompts[1]).not.toContain("second correction")
          expect(prompts[2]).toContain("second correction")
          expect(completed.filter((event) => event._tag === "Completed")).toHaveLength(1)
        }),
      ),
    ] as const
  })

  ItLayer.make(it, "drains steering after checkpointed tool results", () => {
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "steering-agent", toolkit: Toolkit.make(echoTool) })
        const run = yield* Agent.makeRun(agent, { prompt: "use tool" })
        yield* run.steer({ prompt: "steer one" })
        yield* run.steer({ prompt: "steer two" })

        const events = yield* Stream.runCollect(run.events)

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
        expect(toolResultIndex).toBeGreaterThan(toolCallIndex)
        expect(steerOneIndex).toBeGreaterThan(toolResultIndex)
        expect(steerTwoIndex).toBeGreaterThan(steerOneIndex)
        const drained = events.find((event) => event._tag === "SteeringDrained")
        expect(drained).toMatchObject({ _tag: "SteeringDrained", turn: 0, queue: "steering", count: 2 })
        expect(events.at(-1)?._tag).toBe("Completed")
      }).pipe(Effect.scoped),
    ] as const
  })

  ItLayer.make(it, "steering one-at-a-time leaves later steering queued", () => {
    let calls = 0
    const prompts: Array<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-steering-one", "echo", { text: "from model" }))
          }
          prompts.push(Json.stringify(options.prompt.content))
          return Stream.make(textDelta("after first steering"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "steering-one-agent", toolkit: Toolkit.make(echoTool) })
        const run = yield* Agent.makeRun(agent, {
          prompt: "use tool",
          steering: { steering: { mode: "one-at-a-time" } },
        })
        yield* run.steer({ prompt: "first steer" })
        yield* run.steer({ prompt: "second steer" })

        yield* Stream.runDrain(run.events)

        expect(calls).toBe(3)
        expect(prompts[0]).toContain("first steer")
        expect(prompts[0]).not.toContain("second steer")
        expect(prompts[1]).toContain("second steer")
      }).pipe(Effect.scoped),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "follow-up-agent" })
        const run = yield* Agent.makeRun(agent, { prompt: "start" })
        yield* run.followUp({ prompt: "follow one" })
        yield* run.followUp({ prompt: "follow two" })

        const events = yield* Stream.runCollect(run.events)

        expect(calls).toBe(3)
        expect(prompts[1]).toContain("follow one")
        expect(prompts[2]).toContain("follow two")
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(3)
        expect(events.filter((event) => event._tag === "SteeringDrained" && event.queue === "followUp")).toHaveLength(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
      }).pipe(Effect.scoped),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "follow-up-all-agent" })
        const run = yield* Agent.makeRun(agent, {
          prompt: "start",
          steering: { followUp: { mode: "all" } },
        })
        yield* run.followUp({ prompt: "follow one" })
        yield* run.followUp({ prompt: "follow two" })

        const events = yield* Stream.runCollect(run.events)

        expect(calls).toBe(2)
        expect(secondPrompt).toContain("follow one")
        expect(secondPrompt).toContain("follow two")
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(2)
      }).pipe(Effect.scoped),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "follow-up-structured-agent" })
        const run = yield* Agent.makeRun(agent, { prompt: "start", output: { schema: objectSchema } })
        yield* run.followUp({ prompt: "follow before object" })

        const events = yield* Stream.runCollect(run.events)

        expect(calls).toBe(2)
        expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(2)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") expect(structured.turn).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
      }).pipe(Effect.scoped),
    ] as const
  })

  ItLayer.make(it, "rechecks completion after structured output without exposing a nonterminal value", () => {
    let structuredStarted: Deferred.Deferred<void> | undefined
    let releaseStructured: Deferred.Deferred<void> | undefined
    let streamCalls = 0
    let structuredCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(
          () => {
            streamCalls += 1
            return Stream.make(textDelta(`turn ${streamCalls}`))
          },
          () =>
            Effect.gen(function* () {
              structuredCalls += 1
              if (structuredCalls === 1) {
                if (structuredStarted === undefined || releaseStructured === undefined) {
                  return yield* Effect.die("missing structured steering latch")
                }
                yield* Deferred.succeed(structuredStarted, undefined)
                yield* Deferred.await(releaseStructured)
              }
              return [{ type: "text" as const, text: '{"ok":true}' }]
            }),
        ),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.scoped(
        Effect.gen(function* () {
          structuredStarted = yield* Deferred.make<void>()
          releaseStructured = yield* Deferred.make<void>()
          const agent = Agent.make({ name: "structured-completion-steering-agent" })
          const run = yield* Agent.makeRun(agent, { prompt: "start", output: { schema: objectSchema } })
          const fiber = yield* Stream.runCollect(run.events).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(structuredStarted)
          yield* run.followUp({ prompt: "late follow-up" })
          yield* Deferred.succeed(releaseStructured, undefined)

          const events = yield* Fiber.join(fiber)

          expect(streamCalls).toBe(2)
          expect(structuredCalls).toBe(2)
          expect(events.filter((event) => event._tag === "StructuredOutput")).toHaveLength(1)
          expect(events.filter((event) => event._tag === "Completed")).toHaveLength(1)
          expect(events.filter((event) => event._tag === "SteeringDrained" && event.queue === "followUp")).toHaveLength(
            1,
          )
          expect(yield* run.followUp({ prompt: "after completion" }).pipe(Effect.flip)).toBeInstanceOf(
            Steering.RunClosed,
          )
        }),
      ),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const currentStarted = yield* Deferred.make<void>()
        started = currentStarted
        const agent = Agent.make({ name: "interrupt-steering-agent" })
        const run = yield* Agent.makeRun(agent, { prompt: "never finish" })
        yield* run.steer({ prompt: "queued steering" })
        yield* run.followUp({ prompt: "queued follow-up" })
        const fiber = yield* Stream.runDrain(run.events).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(currentStarted)
        yield* Fiber.interrupt(fiber)

        const closed = yield* Effect.flip(run.steer({ prompt: "too late" }))
        expect(closed).toBeInstanceOf(Steering.RunClosed)
        expect(closed.runId).toBe(run.runId)
      }).pipe(Effect.scoped),
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "interrupting a run tears down an in-flight tool before the run settles", () => {
    let started!: Deferred.Deferred<void>
    let finalized!: Deferred.Deferred<void>
    let ticks!: Ref.Ref<number>
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          started = yield* Deferred.make<void>()
          finalized = yield* Deferred.make<void>()
          ticks = yield* Ref.make(0)
          return Layer.mergeAll(
            modelLayer(() => Stream.make(toolCallPart("tool-call-orphan", "echo", { text: "run" }))),
            ToolExecutor.layerTest({
              execute: () =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(started, undefined)
                  yield* Effect.uninterruptible(
                    Effect.forEach([1, 2, 3, 4, 5, 6, 7, 8], () => Ref.update(ticks, (n) => n + 1), {
                      discard: true,
                    }),
                  )
                  return { _tag: "Success", result: {}, encodedResult: {} } satisfies ToolExecutor.Outcome
                }).pipe(Effect.ensuring(Deferred.succeed(finalized, undefined))),
            }),
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "tool-orphan-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "run the tool" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        expect(yield* Deferred.isDone(finalized)).toBe(true)
        expect(yield* Ref.get(ticks)).toBe(8)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting a run tears a tool down promptly rather than waiting out the grace", () => {
    let started!: Deferred.Deferred<void>
    let cleanupDone!: Deferred.Deferred<void>
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          started = yield* Deferred.make<void>()
          cleanupDone = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => Stream.make(toolCallPart("tool-call-prompt", "echo", { text: "run" }))),
            ToolExecutor.layerTest({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  yield* context.emit({ toolCallId: "tool-call-prompt", message: "one" })
                  yield* Deferred.succeed(started, undefined)
                  return yield* Effect.never
                }).pipe(
                  // A real tool commits its cleanup uninterruptibly across an async boundary; the run must wait
                  // for that commit, and must not need the grace to expire to do so.
                  Effect.ensuring(
                    Effect.uninterruptible(
                      Effect.yieldNow.pipe(Effect.andThen(Deferred.succeed(cleanupDone, undefined))),
                    ),
                  ),
                ),
            }),
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "tool-prompt-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Stream.runDrain(
          Agent.stream(agent, { prompt: "run the tool", toolProgress: { _tag: "Backpressure", capacity: 1 } }),
        ).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        expect(yield* Deferred.isDone(cleanupDone)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting a run waits for supervised tool work to exit", () => {
    let started!: Deferred.Deferred<void>
    let release!: Deferred.Deferred<void>
    let childExited!: Deferred.Deferred<void>
    let finalized!: Deferred.Deferred<void>
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          started = yield* Deferred.make<void>()
          release = yield* Deferred.make<void>()
          childExited = yield* Deferred.make<void>()
          finalized = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() => Stream.make(toolCallPart("tool-call-wedge", "echo", { text: "run" }))),
            ToolExecutor.layerTest({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  yield* context.emit({ toolCallId: "tool-call-wedge", message: "one" })
                  yield* Effect.forkChild(
                    Deferred.await(release).pipe(
                      Effect.uninterruptible,
                      Effect.ensuring(Deferred.succeed(childExited, undefined)),
                    ),
                    { startImmediately: true },
                  )
                  yield* Deferred.succeed(started, undefined)
                  return yield* Effect.never
                }).pipe(Effect.ensuring(Deferred.succeed(finalized, undefined))),
            }),
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "tool-wedge-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Stream.runDrain(
          Agent.stream(agent, { prompt: "run the tool", toolProgress: { _tag: "Backpressure", capacity: 1 } }),
        ).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(started)
        const interrupted = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Effect.yieldNow
        expect(interrupted.pollUnsafe()).toBeUndefined()
        expect(yield* Deferred.isDone(childExited)).toBe(false)

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(interrupted)

        expect(yield* Deferred.isDone(childExited)).toBe(true)
        expect(yield* Deferred.isDone(finalized)).toBe(true)
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting a run tears down an in-flight approval before the run settles", () => {
    let started!: Deferred.Deferred<void>
    let release!: Deferred.Deferred<void>
    let finalized!: Deferred.Deferred<void>
    const orphanApprovalTool = Tool.make("waiting-approval", {
      description: "Requires waiting approval",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      needsApproval: () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(release).pipe(Effect.uninterruptible)
          return true
        }).pipe(Effect.ensuring(Deferred.succeed(finalized, undefined))),
    })
    return [
      Layer.unwrap(
        Effect.gen(function* () {
          started = yield* Deferred.make<void>()
          release = yield* Deferred.make<void>()
          finalized = yield* Deferred.make<void>()
          return Layer.mergeAll(
            modelLayer(() =>
              Stream.make(toolCallPart("tool-call-orphan-approval", "waiting-approval", { text: "wait" })),
            ),
            unusedExecutor,
            Approvals.layerAutoApprove,
            ModelMiddleware.layerIdentity,
          )
        }),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "approval-orphan-agent", toolkit: Toolkit.make(orphanApprovalTool) })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "needs approval" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(started)
        const interrupted = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Effect.yieldNow
        expect(interrupted.pollUnsafe()).toBeUndefined()
        expect(yield* Deferred.isDone(finalized)).toBe(false)

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(interrupted)

        expect(yield* Deferred.isDone(finalized)).toBe(true)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
              ToolExecutor.layerTest({
                execute: () =>
                  Effect.gen(function* () {
                    const context = yield* ToolContext.ToolContext
                    context.signal.addEventListener("abort", () => {
                      aborted = true
                    })
                    yield* Deferred.succeed(started, undefined)
                    return yield* Effect.never
                  }),
              }),
              Approvals.layerAutoApprove,
              ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "spills large successful tool results by default before re-feeding them", () => {
    let calls = 0
    let stored: { readonly toolCallId: string; readonly content: unknown } | undefined
    let journalOutcome: DurableDriver.OperationOutcome | undefined
    let secondPrompt = ""
    const order: Array<string> = []
    const largeOutput = "x".repeat(60 * 1024)
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
        ToolExecutor.layerTest({
          execute: () =>
            Effect.sync(() => {
              order.push("execute")
              return { _tag: "Success" as const, result: largeOutput, encodedResult: largeOutput }
            }),
        }),
        ToolOutput.layerTest({
          put: (toolCallId, content) => {
            order.push("spill")
            stored = { toolCallId, content }
            return Effect.succeed(Option.some(`mem:${toolCallId}`))
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "spill-agent", toolkit: Toolkit.make(echoTool) })
        const tracing = testTracer()
        const journal: DurableDriver.Journal = {
          onScheduled: () => Effect.void,
          onCompleted: (operation, outcome) =>
            operation.kind !== "tool"
              ? Effect.void
              : Effect.sync(() => {
                  order.push("journal")
                  journalOutcome = outcome
                }),
          onCheckpoint: () => Effect.void,
        }

        const events = yield* Agent.stream(agent, { prompt: "use big tool", sessionId: "spill-session" }).pipe(
          Stream.tap((event) =>
            event._tag === "ToolExecutionCompleted"
              ? Effect.sync(() => {
                  order.push("event")
                })
              : Effect.void,
          ),
          Stream.runCollect,
          Effect.provideService(DurableDriver.DriverJournal, journal),
          Effect.provideService(Tracer.Tracer, tracing.tracer),
        )

        const completed = events.find((event) => event._tag === "ToolExecutionCompleted")
        expect(stored).toEqual({
          toolCallId: "tool-call-spill",
          content: { result: largeOutput, encodedResult: largeOutput },
        })
        if (completed?._tag === "ToolExecutionCompleted") {
          expect(completed.result.encodedResult).toMatchObject({
            inline: { truncated: true, maxBytes: 50 * 1024 },
            outputPaths: ["mem:tool-call-spill"],
          })
          expect(Json.stringify(completed.result.encodedResult)).not.toContain(largeOutput)
        }
        expect(journalOutcome).toMatchObject({
          _tag: "Succeeded",
          value: {
            _tag: "Success",
            encodedResult: {
              inline: { truncated: true, maxBytes: 50 * 1024 },
              outputPaths: ["mem:tool-call-spill"],
            },
          },
        })
        expect(Json.stringify(journalOutcome)).not.toContain(largeOutput)
        expect(order).toEqual(["execute", "spill", "journal", "event"])
        const toolSpan = tracing.spans.find((span) => span.name === "TenetKit.Agent.tool")
        expect(toolSpan?.attributes.get("tenetkit.tool.output.original_bytes")).toBe(60 * 1024 + 2)
        expect(toolSpan?.attributes.get("tenetkit.tool.output.max_bytes")).toBe(50 * 1024)
        expect(toolSpan?.attributes.get("tenetkit.tool.output.truncated")).toBe(true)
        expect(toolSpan?.attributes.get("tenetkit.tool.output.spill")).toBe("stored")
        expect(toolSpan?.attributes.get("tenetkit.tool.output.path_count")).toBe(1)
        expect(toolSpan?.attributes.get("tenetkit.tool.output.digest")).toMatch(/^[0-9a-f]{64}$/)
        expect(toolSpan?.events.at(-1)?.[0]).toBe("tenetkit.tool.output.bound")
        expect(Json.stringify(toolSpan?.events.at(-1)?.[2])).not.toContain(largeOutput)
        expect(secondPrompt).toContain("mem:tool-call-spill")
        expect(secondPrompt).not.toContain(largeOutput)
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints ordered framework results before turn observers without re-appending", () => {
    let modelCalls = 0
    let nextModelPrompt: Prompt.Prompt | undefined
    let policyHistory: Prompt.Prompt | undefined
    let sessionAtPolicy: Prompt.Prompt | undefined
    const remembered: Array<Memory.RememberInput> = []
    const policy = Policy.make<Session.SessionDirectory>((info) =>
      Effect.sync(() => {
        policyHistory = info.history
        sessionAtPolicy = info.history
        return Policy.decision.continue()
      }),
    )

    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(
              toolCallPart("checkpoint-first", "echo", { text: "first" }),
              toolCallPart("checkpoint-second", "echo", { text: "second" }),
            )
          }
          nextModelPrompt = options.prompt
          return Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) => {
            const params = Schema.decodeUnknownSync(echoParamsSchema)(request.call.params)
            return Effect.succeed({
              _tag: "Success",
              result: `${params.text}-result-marker`,
              encodedResult: `${params.text}-result-marker`,
            })
          },
        }),
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: (input) =>
            Effect.sync(() => {
              remembered.push(input)
            }),
          forget: () => Effect.void,
        }),
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "tool-result-checkpoint-agent",
          toolkit: Toolkit.make(echoTool),
          policy,
        })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "checkpoint both tools",
            memory: { key: { agent: "tool-result-checkpoint-agent", subject: "issue-67" } },
            sessionId: "tool-result-checkpoint",
          }),
        )
        const turnCompleted = events.find((event) => event._tag === "TurnCompleted")

        expect(turnCompleted?._tag).toBe("TurnCompleted")
        if (turnCompleted?._tag !== "TurnCompleted") return expect.unreachable()
        expect(toolResultIds(turnCompleted.transcript)).toEqual(["checkpoint-first", "checkpoint-second"])
        expect(toolResultIds(policyHistory ?? Prompt.empty)).toEqual(["checkpoint-first", "checkpoint-second"])
        expect(toolResultIds(remembered[0]?.transcript ?? Prompt.empty)).toEqual([
          "checkpoint-first",
          "checkpoint-second",
        ])
        expect(toolResultIds(sessionAtPolicy ?? Prompt.empty)).toEqual(["checkpoint-first", "checkpoint-second"])
        expect(toolResultIds(nextModelPrompt ?? Prompt.empty)).toEqual(["checkpoint-first", "checkpoint-second"])
        expect(Json.stringify(nextModelPrompt?.content).match(/first-result-marker/g)).toHaveLength(1)
        expect(Json.stringify(nextModelPrompt?.content).match(/second-result-marker/g)).toHaveLength(1)
      }),
    ] as const
  })

  ItLayer.make(it, "runs sibling tool calls serially by default", () => {
    let active = 0
    let maximum = 0
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(
                toolCallPart("serial-first", "echo", { text: "first" }),
                toolCallPart("serial-second", "echo", { text: "second" }),
                toolCallPart("serial-third", "echo", { text: "third" }),
              )
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.acquireUseRelease(
              Effect.sync(() => {
                active += 1
                maximum = Math.max(maximum, active)
              }),
              () =>
                Effect.yieldNow.pipe(
                  Effect.as({ _tag: "Success" as const, result: request.call.id, encodedResult: request.call.id }),
                ),
              () => Effect.sync(() => active--),
            ),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        yield* Stream.runDrain(
          Agent.stream(Agent.make({ name: "serial-tools", toolkit: Toolkit.make(echoTool) }), { prompt: "run" }),
        )
        expect(maximum).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "bounds concurrent sibling tool calls and checkpoints results in provider order", () => {
    let active = 0
    let maximum = 0
    let modelCalls = 0
    const requests: Array<{
      readonly id: string
      readonly index: number
      readonly batch: ReadonlyArray<string>
    }> = []
    let allStarted: Deferred.Deferred<void> | undefined
    const releases = new Map<string, Deferred.Deferred<void>>()
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(
                toolCallPart("concurrent-first", "echo", { text: "first" }),
                toolCallPart("concurrent-second", "echo", { text: "second" }),
                toolCallPart("concurrent-third", "echo", { text: "third" }),
                toolCallPart("concurrent-fourth", "echo", { text: "fourth" }),
              )
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.acquireUseRelease(
              Effect.gen(function* () {
                requests.push({
                  id: request.call.id,
                  index: request.toolCallIndex,
                  batch: request.toolCallBatch.calls.map((call) => call.id),
                })
                active += 1
                maximum = Math.max(maximum, active)
                if (active === 3 && allStarted !== undefined) yield* Deferred.succeed(allStarted, undefined)
              }),
              () =>
                Effect.gen(function* () {
                  const release = releases.get(request.call.id)
                  if (release === undefined) return yield* Effect.die("missing release")
                  yield* Deferred.await(release)
                  return { _tag: "Success" as const, result: request.call.id, encodedResult: request.call.id }
                }),
              () => Effect.sync(() => active--),
            ),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        allStarted = yield* Deferred.make<void>()
        for (const id of ["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"])
          releases.set(id, yield* Deferred.make<void>())
        const agent = Agent.make({
          name: "concurrent-tools",
          toolkit: Toolkit.make(echoTool),
          toolScheduling: { maxConcurrency: 3, parallelSafe: ["echo"] },
        })
        const fiber = yield* Stream.runCollect(Agent.stream(agent, { prompt: "run" })).pipe(Effect.forkChild)
        yield* Deferred.await(allStarted)
        expect(maximum).toBe(3)
        yield* Deferred.succeed(releases.get("concurrent-third")!, undefined)
        yield* Deferred.succeed(releases.get("concurrent-second")!, undefined)
        yield* Deferred.succeed(releases.get("concurrent-first")!, undefined)
        yield* Effect.yieldNow
        yield* Deferred.succeed(releases.get("concurrent-fourth")!, undefined)
        const events = yield* Fiber.join(fiber)
        expect(
          events
            .filter((event) => event._tag === "ToolExecutionCompleted")
            .map((event) => event.call.id)
            .toSorted(),
        ).toEqual(["concurrent-first", "concurrent-fourth", "concurrent-second", "concurrent-third"])
        expect(requests).toEqual([
          {
            id: "concurrent-first",
            index: 0,
            batch: ["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"],
          },
          {
            id: "concurrent-second",
            index: 1,
            batch: ["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"],
          },
          {
            id: "concurrent-third",
            index: 2,
            batch: ["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"],
          },
          {
            id: "concurrent-fourth",
            index: 3,
            batch: ["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"],
          },
        ])
        expect(
          events
            .filter((event) => event._tag === "ModelPart" && event.part.type === "tool-call")
            .map((event) => (event._tag === "ModelPart" && event.part.type === "tool-call" ? event.part.id : "")),
        ).toEqual(["concurrent-first", "concurrent-second", "concurrent-third", "concurrent-fourth"])
        const completed = events.find((event) => event._tag === "TurnCompleted")
        expect(completed?._tag).toBe("TurnCompleted")
        if (completed?._tag === "TurnCompleted") {
          expect(toolResultIds(completed.transcript)).toEqual([
            "concurrent-first",
            "concurrent-second",
            "concurrent-third",
            "concurrent-fourth",
          ])
        }
      }),
    ] as const
  })

  ItLayer.make(it, "streams parallel lifecycle live and honors authored exclusive barriers", () => {
    let modelCalls = 0
    const started: Array<string> = []
    let firstPairStarted: Deferred.Deferred<void> | undefined
    let progressObserved: Deferred.Deferred<void> | undefined
    let exclusiveStarted: Deferred.Deferred<void> | undefined
    let followingStarted: Deferred.Deferred<void> | undefined
    let releaseParallel: Deferred.Deferred<void> | undefined
    let releaseExclusive: Deferred.Deferred<void> | undefined
    let releaseFollowing: Deferred.Deferred<void> | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(
                toolCallPart("parallel-first", "echo", { text: "first" }),
                toolCallPart("parallel-second", "echo", { text: "second" }),
                toolCallPart("exclusive", "gated", { text: "barrier" }),
                toolCallPart("parallel-following", "echo", { text: "following" }),
              )
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.gen(function* () {
              const id = request.call.id
              started.push(id)
              if (id === "parallel-first") {
                const context = yield* ToolContext.ToolContext
                yield* context.emit({ toolCallId: id, message: "live" })
              }
              if (started.length === 2) yield* Deferred.succeed(firstPairStarted!, undefined)
              if (id === "exclusive") yield* Deferred.succeed(exclusiveStarted!, undefined)
              if (id === "parallel-following") yield* Deferred.succeed(followingStarted!, undefined)
              let release = releaseParallel!
              if (id === "exclusive") release = releaseExclusive!
              if (id === "parallel-following") release = releaseFollowing!
              yield* Deferred.await(release)
              return { _tag: "Success", result: id, encodedResult: id }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        firstPairStarted = yield* Deferred.make<void>()
        progressObserved = yield* Deferred.make<void>()
        exclusiveStarted = yield* Deferred.make<void>()
        followingStarted = yield* Deferred.make<void>()
        releaseParallel = yield* Deferred.make<void>()
        releaseExclusive = yield* Deferred.make<void>()
        releaseFollowing = yield* Deferred.make<void>()
        const agent = Agent.make({
          name: "safe-scheduled-tools",
          toolkit: Toolkit.make(echoTool, gatedTool),
          toolScheduling: { maxConcurrency: 2, parallelSafe: ["echo"] },
        })
        const fiber = yield* Agent.stream(agent, { prompt: "run" }).pipe(
          Stream.tap((event) =>
            event._tag === "ToolProgress" && event.message === "live"
              ? Deferred.succeed(progressObserved!, undefined)
              : Effect.void,
          ),
          Stream.runCollect,
          Effect.forkChild,
        )

        yield* Deferred.await(firstPairStarted)
        const progressWasLive = yield* Deferred.await(progressObserved).pipe(
          Effect.as(true),
          Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.succeed(false) }),
        )
        expect(progressWasLive).toBe(true)
        expect(started).toEqual(["parallel-first", "parallel-second"])
        expect(Option.isNone(yield* Deferred.poll(exclusiveStarted))).toBe(true)

        yield* Deferred.succeed(releaseParallel, undefined)
        yield* Deferred.await(exclusiveStarted)
        expect(started).toEqual(["parallel-first", "parallel-second", "exclusive"])
        expect(Option.isNone(yield* Deferred.poll(followingStarted))).toBe(true)

        yield* Deferred.succeed(releaseExclusive, undefined)
        yield* Deferred.await(followingStarted)
        yield* Deferred.succeed(releaseFollowing, undefined)
        const events = yield* Fiber.join(fiber)
        const completed = events.find((event) => event._tag === "TurnCompleted")
        if (completed?._tag !== "TurnCompleted") return yield* Effect.die("missing completed turn")
        expect(toolResultIds(completed.transcript)).toEqual([
          "parallel-first",
          "parallel-second",
          "exclusive",
          "parallel-following",
        ])
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "make object",
            output: { schema: objectSchema },
            sessionId: "structured-output",
          }),
        )

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
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
          const path = yield* Effect.scoped(
            Session.acquire("structured-output").pipe(Effect.flatMap((session) => session.path())),
          )
          expect(Session.buildContext(path).content).toEqual(completed.transcript.content)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-span-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "make object", output: { schema: objectSchema } }),
        ).pipe(Effect.withTracer(tracer))

        const runSpan = spans.find((span) => span.name === "TenetKit.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "TenetKit.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("tenetkit.turn"))).toEqual([0, 1])
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
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-lazy-span-agent" })

        const events = yield* Agent.stream(agent, { prompt: "make object", output: { schema: objectSchema } }).pipe(
          Stream.take(10),
          Stream.runCollect,
          Effect.withTracer(tracer),
        )

        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
        ])
        expect(structuredCalled).toBe(false)
        const turnSpans = spans.filter((span) => span.name === "TenetKit.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("tenetkit.turn"))).toEqual([0])
        expect(turnSpans[0]?.status._tag).toBe("Ended")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "generate returns the typed structured value when schema is set",
    () =>
      [
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "generate-object-agent" })

          const result = yield* Agent.generate(agent, {
            prompt: "make typed object",
            output: { schema: objectSchema },
          })

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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-tool-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "use tool", output: { schema: objectSchema } }),
        ).pipe(Effect.withTracer(tracer))

        expect(streamCalls).toBe(2)
        expect(structuredPrompt).toContain("from model")
        expect(events.map((event) => event._tag)).toEqual([
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "ToolExecutionStarted",
          "ToolExecutionCompleted",
          "TurnCompleted",
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const runSpan = spans.find((span) => span.name === "TenetKit.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "TenetKit.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("tenetkit.turn"))).toEqual([0, 1, 2])
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-decode-agent" })

        const failure = yield* Effect.flip(
          Stream.runCollect(Agent.stream(agent, { prompt: "bad object", output: { schema: objectSchema } })).pipe(
            Effect.withTracer(tracer),
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") {
          expect(failure.turn).toBe(1)
          expect(AiError.isAiError(failure.cause)).toBe(true)
        }
        const structuredSpan = spans.find(
          (span) => span.name === "TenetKit.Agent.turn" && span.attributes.get("tenetkit.turn") === 1,
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "structured-defect-agent" })

        const exit = yield* Stream.runDrain(
          Agent.stream(agent, { prompt: "defect object", output: { schema: objectSchema } }),
        ).pipe(Effect.withTracer(tracer), Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
        const structuredSpan = spans.find(
          (span) => span.name === "TenetKit.Agent.turn" && span.attributes.get("tenetkit.turn") === 1,
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        structuredStarted = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "structured-interrupt-agent" })
        const fiber = yield* Stream.runDrain(
          Agent.stream(agent, { prompt: "interrupt object", output: { schema: objectSchema } }),
        ).pipe(Effect.withTracer(tracer), Effect.forkChild)

        yield* Deferred.await(structuredStarted)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
        const structuredSpan = spans.find(
          (span) => span.name === "TenetKit.Agent.turn" && span.attributes.get("tenetkit.turn") === 1,
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
    let executions = 0
    let sawResumedToolResult = false
    let checkpoint: Prompt.Prompt | undefined
    const { spans, tracer } = testTracer()
    return [
      Layer.mergeAll(
        modelLayer(
          (options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-resume-structured", "echo", { text: "resumed" }))
            }
            sawResumedToolResult = sawResumedToolResult || Json.stringify(options.prompt.content).includes("resumed")
            return Stream.make(textDelta("after resume"))
          },
          () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
        ),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return executions === 1
              ? Effect.succeed({ _tag: "Suspend", token: "structured-token" })
              : Effect.succeed({ _tag: "Success", result: "resumed", encodedResult: "resumed" })
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resume-structured-agent", toolkit: Toolkit.make(echoTool) })
        const suspension = yield* Agent.stream(agent, { prompt: "suspend before structured output" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing structured suspension checkpoint")
        }

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: {
              suspension,
              resolutions: [toolResultResolution(suspension, "tool-call-resume-structured", "resumed")],
            },
            output: { schema: objectSchema },
          }),
        ).pipe(Effect.withTracer(tracer))

        expect(calls).toBe(2)
        expect(sawResumedToolResult).toBe(true)
        expect(events.map((event) => event._tag)).toEqual([
          "ToolExecutionCompleted",
          "TurnCompleted",
          "TurnStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelPart",
          "ModelPart",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "ModelResponseCommitted",
          "TurnCompleted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptFirstOutput",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "StructuredOutput",
          "Completed",
        ])
        const runSpan = spans.find((span) => span.name === "TenetKit.Agent.run")
        const turnSpans = spans.filter((span) => span.name === "TenetKit.Agent.turn")
        expect(turnSpans.map((span) => span.attributes.get("tenetkit.turn"))).toEqual([0, 1, 2])
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
        Approvals.layerAutoApprove,
        retryTransientModelError,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resilient-structured-agent" })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "retry object", output: { schema: objectSchema } }),
        )

        expect(structuredCalls).toBe(2)
        const structured = events.find((event) => event._tag === "StructuredOutput")
        if (structured?._tag === "StructuredOutput") {
          expect(structured.value).toEqual({ ok: true })
          const successfulAttempt = events.findLast((event) => event._tag === "ModelAttemptCompleted")
          const structuredCall = events.findLast((event) => event._tag === "ModelCallStarted")
          expect(structured.modelCallId).toBe(
            successfulAttempt?._tag === "ModelAttemptCompleted" ? successfulAttempt.modelCallId : undefined,
          )
          expect(structured.modelAttemptId).toBe(
            successfulAttempt?._tag === "ModelAttemptCompleted" ? successfulAttempt.modelAttemptId : undefined,
          )
          expect(structuredCall?._tag === "ModelCallStarted" && structuredCall.purpose).toBe("structured-output")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "keeps selected structured context overflow terminal to ModelResilience", () => {
    const overflow = contextOverflowError("context length exceeded")
    let structuredCalls = 0
    return [
      Layer.mergeAll(
        overflowModelLayer(
          () => Stream.make(textDelta("normal answer")),
          () => {
            structuredCalls += 1
            return Effect.fail(overflow)
          },
        ),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelResilience.layer({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "terminal-structured-overflow-agent", model: overflowSelection })
        const seen: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Agent.stream(agent, { prompt: "large object", output: { schema: objectSchema } }).pipe(
            Stream.tap((event) => Effect.sync(() => seen.push(event))),
            Stream.runDrain,
          ),
        )

        expect(structuredCalls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") expect(failure.cause).toBe(overflow)
        expect(seen.some((event) => event._tag === "StructuredOutput")).toBe(false)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "error-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toContain("stream exploded")
        expect(failure._tag === "tenetkit/core/AgentError" && failure.turn).toBe(0)
        if (failure._tag === "tenetkit/core/AgentError") {
          expect(AiError.isAiError(failure.cause) && failure.cause.reason._tag).toBe("UnknownError")
        }
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "channel-error-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(failure._tag === "tenetkit/core/AgentError" && failure.message).toContain("stream channel exploded")
        expect(failure._tag === "tenetkit/core/AgentError" && failure.cause).toBe(streamFailure)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves a model stream defect after emitted events", () => {
    const cause = Cause.die(new Error("model defect"))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(cause)))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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
        Approvals.layerAutoApprove,
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

  ItLayer.make(it, "does not retry model failures when ModelResilience.none is provided", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.fail(transientModelError)
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelResilience.layerTest(ModelResilience.none),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "no-model-retry-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "retry disabled" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") expect(failure.cause).toBe(transientModelError)
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
        Approvals.layerAutoApprove,
        retryTransientModelError,
        ModelMiddleware.layerIdentity,
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
        Approvals.layerAutoApprove,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(3),
          classify: () => {
            classifications += 1
            return "terminal"
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-terminal-failure-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "terminal model" })))

        expect(calls).toBe(1)
        expect(classifications).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") expect(failure.cause).toBe(transientModelError)
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
        Approvals.layerAutoApprove,
        ModelResilience.layer({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-partial-failure-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial model" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        if (failure._tag === "tenetkit/core/AgentError") expect(failure.cause).toBe(transientModelError)
      }),
    ] as const
  })

  ItLayer.make(it, "retries in-band model error parts before output", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(Response.makePart("error", { error: transientModelError }))
            : Stream.make(textDelta("after in-band retry"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        retryTransientModelError,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "model-in-band-error-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "in-band error" }))

        expect(calls).toBe(2)
        const completed = events.at(-1)
        if (completed?._tag === "Completed") expect(completed.text).toBe("after in-band retry")
      }),
    ] as const
  })

  ItLayer.make(it, "wraps per-turn model overrides with ModelResilience", () => {
    let ambientCalls = 0
    let overrideCalls = 0
    let overflowCompactions = 0
    const overrideFailure = contextOverflowError("upstream connection reset")
    const overrideModel = modelLayer(() => {
      overrideCalls += 1
      return overrideCalls === 1 ? Stream.fail(overrideFailure) : Stream.make(textDelta("override ok"))
    })
    return [
      Layer.mergeAll(
        overflowModelLayer(() => {
          ambientCalls += 1
          return Stream.make(toolCallPart("tool-call-override-model", "echo", { text: "from model" }))
        }),
        Compaction.layerTest({
          maybeCompact: (request) => {
            if (request.overflow) overflowCompactions += 1
            return Effect.succeed(Option.none())
          },
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(1),
          classify: (error) => (error === overrideFailure ? "transient" : "terminal"),
        }),
        ModelMiddleware.layerIdentity,
        unusedModelLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "override-model-retry-agent",
          model: overflowSelection,
          toolkit: Toolkit.make(echoTool),
          policy: Policy.make(() => Effect.succeed(Policy.decision.continue({ model: overrideModel }))),
        })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool then override" }))

        expect(ambientCalls).toBe(1)
        expect(overrideCalls).toBe(2)
        expect(overflowCompactions).toBe(0)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "policy-stop-agent",
          toolkit: Toolkit.make(echoTool),
          policy: Policy.recurs(0),
        })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "loop forever" })))

        expect(calls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/TurnLimitExceeded")
        if (failure._tag === "tenetkit/core/TurnLimitExceeded") {
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
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
    ),
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "ordered-policy-stop-agent",
        toolkit: Toolkit.make(echoTool),
        policy: Policy.recurs(0),
        toolScheduling: { maxConcurrency: 2, parallelSafe: ["echo"] },
      })
      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "call twice" })))
      expect(failure._tag).toBe("tenetkit/core/TurnLimitExceeded")
      if (failure._tag === "tenetkit/core/TurnLimitExceeded") {
        expect(failure.pending).toEqual([
          { tool_call_id: "tool-call-first", tool_name: "echo" },
          { tool_call_id: "tool-call-second", tool_name: "echo" },
        ])
      }
    }),
  ])

  ItLayer.make(it, "default policy continues past eight follow-up turns while tool results are pending", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls <= 12
            ? Stream.make(toolCallPart(`tool-call-${calls}`, "echo", { text: `call ${calls}` }))
            : Stream.make(textDelta("done after twelve follow-ups"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const defaultPolicyAgent = Agent.make({ name: "default-policy-agent", toolkit: Toolkit.make(echoTool) })
        const requirementProof: Assert<
          IsAssignable<
            LanguageModel.LanguageModel | Tool.HandlersFor<{ echo: typeof echoTool }>,
            Agent.Requirements<typeof defaultPolicyAgent>
          >
        > = true
        expect(requirementProof).toBe(true)

        const events = yield* Stream.runCollect(Agent.stream(defaultPolicyAgent, { prompt: "loop until done" }))

        expect(calls).toBe(13)
        const completed = events.at(-1)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") expect(completed.text).toBe("done after twelve follow-ups")
      }),
    ] as const
  })

  ItLayer.make(it, "default policy completes naturally when a turn leaves no pending tool results", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("plain answer"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "natural-completion-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "answer once" }))

        expect(calls).toBe(1)
        const completed = events.at(-1)
        expect(completed?._tag).toBe("Completed")
        if (completed?._tag === "Completed") expect(completed.text).toBe("plain answer")
      }),
    ] as const
  })

  ItLayer.make(it, "interrupting an indefinitely continuing default-policy loop exits interrupted", () => {
    let deepTurns: Deferred.Deferred<void> | undefined
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.fromEffect(
            calls < 10 || deepTurns === undefined ? Effect.void : Deferred.succeed(deepTurns, undefined),
          ).pipe(Stream.drain, Stream.concat(Stream.make(toolCallPart(`tool-call-${calls}`, "echo", { text: "go" }))))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const currentDeepTurns = yield* Deferred.make<void>()
        deepTurns = currentDeepTurns
        const agent = Agent.make({ name: "interrupt-forever-agent", toolkit: Toolkit.make(echoTool) })
        const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "loop forever" })).pipe(
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(currentDeepTurns)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.hasInterrupts(exit)).toBe(true)
        expect(Exit.isSuccess(exit)).toBe(false)
        expect(calls).toBeGreaterThanOrEqual(10)
      }),
    ] as const
  })

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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        budgetLayer,
      ),
      Effect.gen(function* () {
        const policy = Policy.make<Budget>((info) =>
          Effect.gen(function* () {
            const budget = yield* Budget
            return budget.remaining(info.turn) === 0
              ? Policy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
              : Policy.decision.continue()
          }),
        )
        const agent = Agent.make({ name: "budget-policy-agent", toolkit: Toolkit.make(echoTool), policy })
        const run = Agent.stream(agent, { prompt: "use budget" })
        const requirementProof: Budget extends StreamServices<typeof run> ? true : false = true

        const failure = yield* Effect.flip(Stream.runCollect(run))

        expect(requirementProof).toBe(true)
        expect(calls).toBe(1)
        expect(failure._tag).toBe("tenetkit/core/PolicyStopped")
        if (failure._tag === "tenetkit/core/PolicyStopped") {
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const reasons: ReadonlyArray<Exclude<Policy.StopReason, { readonly _tag: "TurnLimit" }>> = [
          { _tag: "GoalSatisfied" },
          { _tag: "BudgetExhausted", budget: "requests" },
          { _tag: "Policy", detail: "operator requested stop" },
        ]

        for (const reason of reasons) {
          const agent = Agent.make({
            name: `stop-reason-${reason._tag}`,
            toolkit: Toolkit.make(echoTool),
            policy: Policy.make(() => Effect.succeed(Policy.decision.stop(reason))),
          })
          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "stop" })))
          expect(failure._tag).toBe("tenetkit/core/PolicyStopped")
          if (failure._tag === "tenetkit/core/PolicyStopped") expect(failure.reason).toEqual(reason)
        }

        expect(calls).toBe(reasons.length)
      }),
    ] as const
  })

  ItLayer.make(it, "surfaces a policy evaluation failure without erasing its cause", () => {
    const policyCause = { system: "budget-service", status: "offline" }
    const policyFailure = Policy.Error.make({ message: "budget unavailable", cause: policyCause })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-policy-failure", "echo", { text: "call" }))),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "policy-failure-agent",
          toolkit: Toolkit.make(echoTool),
          policy: Policy.make(() => Effect.fail(policyFailure)),
        })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use policy" })))

        expect(failure).toBe(policyFailure)
        expect(failure.cause).toBe(policyCause)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when a policy returns a reasonless Stop", () => {
    const policy = Policy.recurs(0)
    Reflect.set(policy, "decide", () => Effect.succeed({ _tag: "Stop" }))
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("tool-call-stale-policy", "echo", { text: "call" }))),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "stale-policy-agent", toolkit: Toolkit.make(echoTool), policy })
        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use stale policy" })))
        expect(failure._tag).toBe("tenetkit/core/TurnPolicyError")
        if (failure._tag === "tenetkit/core/TurnPolicyError") {
          expect(failure.message).toContain("Stop decisions must include a reason")
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "override-agent",
          toolkit: Toolkit.make(echoTool),
          policy: Policy.make(() =>
            Effect.succeed(Policy.decision.continue({ instructions: "injected system content" })),
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
          if (modelCalls === 2) secondTurnTools = modelToolNames(options.tools)
          return modelCalls < 3
            ? Stream.make(toolCallPart(`active-tool-${modelCalls}`, "echo", { text: "hidden" }))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
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
          policy: Policy.make(() => Effect.succeed(Policy.decision.continue({ activeTools: [] }))),
        })

        const failure = yield* Agent.stream(agent, { prompt: "use then hide echo" }).pipe(Stream.runDrain, Effect.flip)

        expect(failure._tag).toBe("tenetkit/core/AgentError")
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
          ToolExecutor.layerTest({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "suspend-agent",
            toolkit: Toolkit.make(echoTool),
          })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "wait please" })))

          expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
          if (failure._tag === "tenetkit/core/AgentSuspended") {
            expect(failure.waits[0]?.token).toBe("wait-1")
            expect(failure.waits[0]?.reason).toBe("tool-wait")
            expect(failure.waits[0]?.call.id).toBe("tool-call-wait")
            expect(failure.waits[0]?.call.name).toBe("echo")
            expect(failure.waits[0]?.call.params).toEqual({ text: "hold" })
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "resumes a suspended tool call with provider metadata", () => {
    let checkpoint: Prompt.Prompt | undefined
    let executions = 0
    let modelCalls = 0
    let resumedMetadata: unknown
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(
              Response.makePart("tool-call", {
                id: "provider-metadata-wait",
                name: "echo",
                params: { text: "wait" },
                providerExecuted: false,
                metadata: { openai: { itemId: "fc_provider_metadata_wait" } },
              }),
            )
          }
          resumedMetadata = options.prompt.content
            .flatMap((message) => (message.role === "assistant" ? message.content : []))
            .find((part) => part.type === "tool-call" && part.id === "provider-metadata-wait")?.options
          return Stream.make(textDelta("resumed"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return executions === 1
              ? Effect.succeed({ _tag: "Suspend", token: "provider-metadata-token" })
              : Effect.succeed({ _tag: "Success", result: "done", encodedResult: "done" })
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "provider-metadata-resume-agent", toolkit: Toolkit.make(echoTool) })
        const suspension = yield* Agent.stream(agent, { prompt: "wait" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing provider metadata suspension checkpoint")
        }
        const metadata = { openai: { itemId: "fc_provider_metadata_wait" } }
        expect(suspension.checkpoint.calls[0]?.call.metadata).toEqual(metadata)
        expect(suspension.waits[0]?.call.metadata).toEqual(metadata)
        expect(
          checkpoint.content
            .flatMap((message) => (message.role === "assistant" ? message.content : []))
            .find((part) => part.type === "tool-call" && part.id === "provider-metadata-wait")?.options,
        ).toEqual(metadata)

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: {
              suspension,
              resolutions: [toolResultResolution(suspension, "provider-metadata-wait", "done")],
            },
          }),
        )

        expect(events.at(-1)?._tag).toBe("Completed")
        expect(executions).toBe(1)
        expect(modelCalls).toBe(2)
        expect(resumedMetadata).toEqual(metadata)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a denial targeted to a tool wait before side effects", () => {
    let checkpoint: Prompt.Prompt | undefined
    let executions = 0
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(toolCallPart("tool-wait-denial", "echo", { text: "wait" }))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return Effect.succeed({ _tag: "Suspend", token: "tool-wait-denial-token" })
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "tool-wait-denial-agent", toolkit: Toolkit.make(echoTool) })
        const suspension = yield* Agent.stream(agent, { prompt: "wait" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing tool-wait suspension")
        }
        const failure = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: checkpoint,
          resume: {
            suspension,
            resolutions: [{ waitId: suspension.waits[0]!.waitId, resolution: { _tag: "Denied" } }],
          },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(failure._tag).toBe("tenetkit/core/ResumeMismatch")
        expect(executions).toBe(1)
        expect(modelCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints completed sibling tool results before suspension and preserves them on resume", () => {
    let suspendedTranscript: Prompt.Prompt | undefined
    let ordinaryExecutions = 0
    let suspendedExecutions = 0
    let laterExecutions = 0
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
        "tool-call-later",
      ])
      const resultIds: Array<string> = []
      for (const message of prompt.content.slice(assistantIndex + 1)) {
        if (message.role !== "tool") break
        resultIds.push(...message.content.filter((part) => part.type === "tool-result").map((part) => part.id))
      }
      expect(resultIds).toEqual(expectedResultIds)
    }
    const executor = ToolExecutor.layerTest({
      execute: (request) => {
        if (request.call.id === "tool-call-ordinary") {
          ordinaryExecutions += 1
          return Effect.succeed({
            _tag: "Success" as const,
            result: { text: "README.md" },
            encodedResult: { text: "README.md" },
          })
        }
        if (request.call.id === "tool-call-later") {
          laterExecutions += 1
          return Effect.succeed({
            _tag: "Success" as const,
            result: { text: "later complete" },
            encodedResult: { text: "later complete" },
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
              toolCallPart("tool-call-later", "echo", { text: "later" }),
            ])
          }
          assertExchange(options.prompt, ["tool-call-ordinary", "tool-call-child", "tool-call-later"])
          resumedPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("completed after resume"))
        }),
        executor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "sibling-suspend-agent",
          toolkit: Toolkit.make(echoTool),
          toolScheduling: { maxConcurrency: 2, parallelSafe: ["echo"] },
        })
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

        expect(suspension._tag).toBe("tenetkit/core/AgentSuspended")
        expect(suspendedTranscript).toBeDefined()
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || suspendedTranscript === undefined) {
          return yield* Effect.die("missing suspension checkpoint")
        }
        assertExchange(suspendedTranscript, ["tool-call-ordinary"])
        const checkpoint = Json.stringify(suspendedTranscript?.content)
        expect(checkpoint).toContain("tool-call-ordinary")
        expect(checkpoint).toContain("README.md")
        expect(checkpoint).toContain("tool-call-child")
        expect(checkpoint).toContain("tool-call-later")
        expect(checkpoint).not.toContain("child complete")
        expect(checkpoint).not.toContain("later complete")

        const resumed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: suspendedTranscript,
            resume: {
              suspension,
              resolutions: [toolResultResolution(suspension, "tool-call-child", { text: "child complete" })],
            },
          }),
        )

        expect(resumed.at(-1)?._tag).toBe("Completed")
        expect(ordinaryExecutions).toBe(1)
        expect(suspendedExecutions).toBe(1)
        expect(laterExecutions).toBe(1)
        expect(resumedPrompt.match(/tool-call-ordinary/g)).toHaveLength(2)
        expect(resumedPrompt.match(/README\.md/g)).toHaveLength(1)
        expect(resumedPrompt.match(/tool-call-child/g)).toHaveLength(2)
        expect(resumedPrompt.match(/child complete/g)).toHaveLength(1)
      }),
    ] as const
  })

  ItLayer.make(it, "resolves simultaneous authored-order waits without replaying siblings", () => {
    const callIds = ["delegation-first", "delegation-second", "delegation-third"] as const
    const executions = new Map<string, number>()
    let allStarted: Deferred.Deferred<void> | undefined
    let checkpoint: Prompt.Prompt | undefined
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.fromIterable(callIds.map((id) => toolCallPart(id, "echo", { text: id })))
            : Stream.make(textDelta("all delegations completed"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.gen(function* () {
              const id = request.call.id
              executions.set(id, (executions.get(id) ?? 0) + 1)
              if (executions.size === callIds.length && allStarted !== undefined) {
                yield* Deferred.succeed(allStarted, undefined)
              }
              if (allStarted === undefined) return yield* Effect.die("missing delegation barrier")
              yield* Deferred.await(allStarted)
              return { _tag: "Suspend" as const, token: `wait-${id}` }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        Session.layerMemory,
      ),
      Effect.gen(function* () {
        allStarted = yield* Deferred.make<void>()
        const agent = Agent.make({
          name: "concurrent-suspending-delegations",
          toolkit: Toolkit.make(echoTool),
          toolScheduling: { maxConcurrency: 3, parallelSafe: ["echo"] },
        })
        const sessionId = "concurrent-delegation"
        const suspension = yield* Agent.stream(agent, { prompt: "delegate concurrently", sessionId }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing concurrent suspension checkpoint")
        }
        expect([...executions.keys()]).toEqual(callIds)
        expect(suspension.waits.map((wait) => wait.call.id)).toEqual(callIds)
        expect(modelCalls).toBe(1)

        let checkpointAfterFirst: Prompt.Prompt | undefined
        const afterFirst = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: checkpoint,
          resume: {
            suspension,
            resolutions: [toolResultResolution(suspension, "delegation-first", "delegation-first")],
          },
          sessionId,
        }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpointAfterFirst = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (afterFirst._tag !== "tenetkit/core/AgentSuspended" || checkpointAfterFirst === undefined) {
          return yield* Effect.die("missing first partial suspension checkpoint")
        }
        expect(afterFirst.waits.map((wait) => wait.call.id)).toEqual(["delegation-second", "delegation-third"])
        expect(toolResultIds(checkpointAfterFirst)).toEqual(["delegation-first"])
        expect(executions).toEqual(
          new Map([
            ["delegation-first", 1],
            ["delegation-second", 1],
            ["delegation-third", 1],
          ]),
        )
        expect(modelCalls).toBe(1)

        let checkpointAfterThird: Prompt.Prompt = checkpointAfterFirst
        const afterThird = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: checkpointAfterFirst,
          resume: {
            suspension: afterFirst,
            resolutions: [toolResultResolution(afterFirst, "delegation-third", "delegation-third")],
          },
          sessionId,
        }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpointAfterThird = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (afterThird._tag !== "tenetkit/core/AgentSuspended") {
          return yield* Effect.die(
            `missing second partial suspension checkpoint: ${afterThird._tag} ${"message" in afterThird ? afterThird.message : ""}`,
          )
        }
        expect(afterThird.waits.map((wait) => wait.call.id)).toEqual(["delegation-second"])
        expect(toolResultIds(checkpointAfterThird)).toEqual(["delegation-first"])
        expect(executions).toEqual(
          new Map([
            ["delegation-first", 1],
            ["delegation-second", 1],
            ["delegation-third", 1],
          ]),
        )
        expect(modelCalls).toBe(1)

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpointAfterThird,
            resume: {
              suspension: afterThird,
              resolutions: [toolResultResolution(afterThird, "delegation-second", "delegation-second")],
            },
            sessionId,
          }),
        )

        expect(events.at(-1)?._tag).toBe("Completed")
        expect(executions).toEqual(
          new Map([
            ["delegation-first", 1],
            ["delegation-second", 1],
            ["delegation-third", 1],
          ]),
        )
        const completed = events.at(-1)
        if (completed?._tag !== "Completed") return yield* Effect.die("missing completed transcript")
        expect(toolResultIds(completed.transcript)).toEqual(callIds)
        const path = yield* Effect.scoped(Session.acquire(sessionId).pipe(Effect.flatMap((session) => session.path())))
        expect(Session.buildContext(path).content).toEqual(completed.transcript.content)
        expect(modelCalls).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "settles two approvals and one tool wait before crossing a later exclusive barrier", () => {
    const exclusiveTool = Tool.make("exclusive", {
      description: "Exclusive barrier",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
    })
    const executions = new Map<string, number>()
    let checkpoint: Prompt.Prompt | undefined
    let modelCalls = 0
    const execute = (id: string) => executions.set(id, (executions.get(id) ?? 0) + 1)
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable([
              toolCallPart("approval-first", "gated", { text: "first" }),
              toolCallPart("tool-wait-second", "echo", { text: "second" }),
              toolCallPart("approval-third", "gated", { text: "third" }),
              toolCallPart("exclusive-fourth", "exclusive", { text: "fourth" }),
            ])
          }
          expect(toolResultIds(options.prompt)).toEqual([
            "approval-first",
            "tool-wait-second",
            "approval-third",
            "exclusive-fourth",
          ])
          return Stream.make(textDelta("mixed waits completed"))
        }),
        ToolExecutor.layerTest({
          execute: (request) => {
            execute(request.call.id)
            return request.call.id === "tool-wait-second"
              ? Effect.succeed({ _tag: "Suspend", token: "tool-wait-token" })
              : Effect.succeed({
                  _tag: "Success",
                  result: request.call.id,
                  encodedResult: request.call.id,
                })
          },
        }),
        Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "mixed-authored-waits",
          toolkit: Toolkit.make(gatedTool, echoTool, exclusiveTool),
          toolScheduling: { maxConcurrency: 3, parallelSafe: ["gated", "echo"] },
        })
        const first = yield* Agent.stream(agent, { prompt: "run mixed waits" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (first._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing mixed-wait suspension")
        }
        expect(first.waits.map((wait) => [wait.call.id, wait.reason])).toEqual([
          ["approval-first", "approval"],
          ["tool-wait-second", "tool-wait"],
          ["approval-third", "approval"],
        ])
        expect(executions).toEqual(new Map([["tool-wait-second", 1]]))
        expect(modelCalls).toBe(1)

        let checkpointAfterPartial: Prompt.Prompt | undefined
        const approvalFirst = first.waits.find((wait) => wait.call.id === "approval-first")!
        const afterPartial = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: checkpoint,
          resume: {
            suspension: first,
            resolutions: [
              { waitId: approvalFirst.waitId, resolution: { _tag: "Approved" } },
              toolResultResolution(first, "tool-wait-second", "tool-wait-second"),
            ],
          },
        }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpointAfterPartial = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (afterPartial._tag !== "tenetkit/core/AgentSuspended" || checkpointAfterPartial === undefined) {
          return yield* Effect.die("missing partial mixed-wait suspension")
        }
        expect(afterPartial.waits.map((wait) => wait.call.id)).toEqual(["approval-third"])
        expect(toolResultIds(checkpointAfterPartial)).toEqual(["approval-first", "tool-wait-second"])
        expect(executions).toEqual(
          new Map([
            ["tool-wait-second", 1],
            ["approval-first", 1],
          ]),
        )
        expect(executions.has("exclusive-fourth")).toBe(false)
        expect(modelCalls).toBe(1)

        const approvalThird = afterPartial.waits[0]!
        const completed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpointAfterPartial,
            resume: {
              suspension: afterPartial,
              resolutions: [{ waitId: approvalThird.waitId, resolution: { _tag: "Approved" } }],
            },
          }),
        )
        expect(completed.at(-1)?._tag).toBe("Completed")
        expect(executions).toEqual(
          new Map([
            ["tool-wait-second", 1],
            ["approval-first", 1],
            ["approval-third", 1],
            ["exclusive-fourth", 1],
          ]),
        )
        expect(modelCalls).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a resume token that differs from the authoritative suspension checkpoint", () => {
    let checkpoint: Prompt.Prompt | undefined
    let executions = 0
    const executor = ToolExecutor.layerTest({
      execute: () => {
        executions += 1
        return executions === 1
          ? Effect.succeed({ _tag: "Suspend" as const, token: "authoritative-token" })
          : Effect.succeed({ _tag: "Success" as const, result: "executed", encodedResult: "executed" })
      },
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("bound-resume", "echo", { text: "original" }))),
        executor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "bound-resume-token-agent", toolkit: Toolkit.make(echoTool) })
        const suspension = yield* Agent.stream(agent, { prompt: "suspend" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing suspension checkpoint")
        }

        const received = AgentEvent.AgentSuspended.make({
          checkpoint: suspension.checkpoint,
          waits: suspension.waits.map((wait, index) => (index === 0 ? { ...wait, token: "fabricated-token" } : wait)),
        })
        const mismatch = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: checkpoint,
          resume: {
            suspension: received,
          },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(mismatch._tag).toBe("tenetkit/core/ResumeMismatch")
        expect(executions).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "resumes an authorization suspension with its active-tool snapshot", () => {
    let modelCalls = 0
    let approvalResolutions = 0
    let executions = 0
    let checkpoint: Prompt.Prompt | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("authorization-resume", "gated", { text: "resume" }))
            : Stream.make(textDelta("after authorization resume"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return Effect.succeed({ _tag: "Success", result: "resumed", encodedResult: "resumed" })
          },
        }),
        Permissions.layerTest({
          evaluate: () => Effect.succeed({ _tag: "Ask", token: "authorization-token" }),
        }),
        Approvals.layerTest({
          resolve: (pending) => {
            approvalResolutions += 1
            return Effect.succeed(approvalResolutions === 1 ? pending : { _tag: "Approved" as const })
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "authorization-resume-agent", toolkit: Toolkit.make(gatedTool) })
        const failure = yield* Agent.stream(agent, { prompt: "suspend authorization" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (failure._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return expect.unreachable()
        }

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: {
              suspension: failure,
              resolutions: [{ waitId: failure.waits[0]!.waitId, resolution: { _tag: "Approved" } }],
            },
          }),
        )

        expect(failure.checkpoint.activeTools).toEqual(["gated"])
        expect(approvalResolutions).toBe(1)
        expect(executions).toBe(1)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects substituted resume call identity before model or tool side effects", () => {
    let modelCalls = 0
    let executorCalls = 0
    let checkpoint: Prompt.Prompt | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(toolCallPart("authoritative-call", "echo", { text: "original" }))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executorCalls += 1
            return Effect.succeed({ _tag: "Suspend", token: "authoritative-token" })
          },
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "substituted-resume-agent",
          toolkit: Toolkit.make(echoTool),
        })
        const suspension = yield* Agent.stream(agent, { prompt: "suspend" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspension._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing suspension checkpoint")
        }

        const mismatches = [
          replaceSuspension(suspension, { tool_call_id: "substituted-call" }),
          replaceSuspension(suspension, { tool_name: "gated" }),
          replaceSuspension(suspension, { tool_params: { text: "substituted" } }),
          replaceSuspension(suspension, {
            tool_call_batch: suspension.checkpoint.calls.map(({ call }) =>
              Response.makePart("tool-call", {
                id: call.id,
                name: call.name,
                params: call.params,
                providerExecuted: call.providerExecuted,
                metadata: { openai: { itemId: "fc_substituted" } },
              }),
            ),
          }),
        ]
        for (const received of mismatches) {
          const failure = yield* Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: { suspension: received },
          }).pipe(Stream.runDrain, Effect.flip)
          expect(failure).toMatchObject({
            _tag: "tenetkit/core/ResumeMismatch",
            reason: "checkpoint-not-found",
            received,
          })
        }

        expect(modelCalls).toBe(1)
        expect(executorCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects resume when the current transcript has no suspension checkpoint", () => {
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("must not run"))
        }),
        ToolExecutor.layerTest({ execute: () => Effect.die("missing checkpoint must not execute") }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const staleCall = toolCallPart("stale-call", "echo", { text: "stale" })
        const received = suspendedCall(staleCall, "stale-token")
        const agent = Agent.make({ name: "missing-resume-agent", toolkit: Toolkit.make(echoTool) })
        const failure = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: [{ role: "user", content: [{ type: "text", text: "completed" }] }],
          resume: { suspension: received },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(failure).toMatchObject({
          _tag: "tenetkit/core/ResumeMismatch",
          reason: "checkpoint-not-found",
          received,
        })
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "normalizes custom authorization tokens to the attempted call snapshot",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("actual-call", "gated", { text: "actual" }))),
          ToolExecutor.layerTest({ execute: () => Effect.die("suspended call must not execute") }),
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "normalized-suspension-agent",
            toolkit: Toolkit.make(gatedTool),
            authorization: { authorize: () => Effect.succeed({ _tag: "Suspend" as const, token: "custom-token" }) },
          })

          const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, { prompt: "suspend" })))

          expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
          if (failure._tag !== "tenetkit/core/AgentSuspended") return expect.unreachable()
          expect(failure.waits[0]?.token).toBe("custom-token")
          expect(failure.waits[0]?.call.id).toBe("actual-call")
          expect(failure.waits[0]?.call.name).toBe("gated")
          expect(failure.waits[0]?.call.params).toEqual({ text: "actual" })
          expect(failure.checkpoint.activeTools).toEqual(["gated"])
          expect(failure.checkpoint.activatedSkills).toEqual([])
        }),
      ] as const,
  )

  ItLayer.make(it, "rejects an authorization resume whose params differ from the checkpoint", () => {
    let checkpoint: Prompt.Prompt | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("bound-call", "gated", { text: "original" }))),
        ToolExecutor.layerTest({ execute: () => Effect.die("substituted params must not execute") }),
        Permissions.layerRuleset({ rules: [], fallback: "ask" }),
        Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "bound-resume-agent", toolkit: Toolkit.make(gatedTool) })
        const failure = yield* Agent.stream(agent, { prompt: "suspend" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (failure._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return yield* Effect.die("missing authorization checkpoint")
        }

        const resumeFailure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(agent, {
              prompt: "ignored",
              history: checkpoint,
              resume: {
                suspension: replaceSuspension(failure, {
                  tool_params: { text: "substituted" },
                }),
              },
            }),
          ),
        )

        expect(resumeFailure._tag).toBe("tenetkit/core/ResumeMismatch")
      }),
    ] as const
  })

  ItLayer.make(it, "rehydrates activated skill tools when resuming authorization", () => {
    let modelCalls = 0
    let approvalChecks = 0
    let executions = 0
    let checkpoint: Prompt.Prompt | undefined
    const reviewTool = Tool.make("resumable_review", {
      parameters: Schema.Struct({ target: Schema.String }),
      success: Schema.Unknown,
      needsApproval: true,
    })
    const review: SkillCatalog.Skill = {
      ...testSkill("resumable-review", "Review with resumable approval.", "RESUMABLE REVIEW BODY"),
      tools: [reviewTool],
    }
    const policy = Policy.make(() =>
      Effect.succeed(Policy.decision.continue({ activeTools: ["activate_skill", "resumable_review"] })),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(toolCallPart("activate-resumable", "activate_skill", { name: "resumable-review" }))
          }
          if (modelCalls === 2) {
            return Stream.make(toolCallPart("resumable-review-call", "resumable_review", { target: "src" }))
          }
          return Stream.make(textDelta("after resumed skill"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return Effect.succeed({ _tag: "Success", result: "reviewed", encodedResult: "reviewed" })
          },
        }),
        Approvals.layerTest({
          resolve: (pending) => {
            approvalChecks += 1
            return Effect.succeed(approvalChecks === 1 ? { ...pending, token: "skill-approval" } : { _tag: "Approved" })
          },
        }),
        SkillCatalog.layerSkills([review]),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "resumable-skill-agent", policy })
        const failure = yield* Agent.stream(agent, { prompt: "review" }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (failure._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) return expect.unreachable()

        yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: {
              suspension: failure,
              resolutions: [{ waitId: failure.waits[0]!.waitId, resolution: { _tag: "Approved" } }],
            },
          }),
        )

        expect(failure.checkpoint.activatedSkills).toEqual(["resumable-review"])
        expect(executions).toBe(1)
        expect(modelCalls).toBe(3)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "passes provider-executed tool calls through without local gating or execution",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() =>
            Stream.make(
              providerToolCallPart("provider-call", "gated", { text: "done upstream" }),
              textDelta("upstream handled it"),
            ),
          ),
          unusedExecutor,
          Approvals.layerTest({ resolve: () => Effect.die("approvals must not be consulted") }),
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "provider-tool-agent",
            toolkit: Toolkit.make(gatedTool),
          })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "provider already handled it" }))

          expect(events.map((event) => event._tag)).toEqual([
            "TurnStarted",
            "ModelCallStarted",
            "ModelAttemptStarted",
            "ModelAttemptFirstOutput",
            "ModelPart",
            "ModelAttemptFirstOutput",
            "ModelPart",
            "ModelPart",
            "ModelAttemptCompleted",
            "ModelCallCompleted",
            "ModelResponseCommitted",
            "TurnCompleted",
            "Completed",
          ])
          expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
          expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
          const modelPart = events.find((event) => event._tag === "ModelPart")
          if (modelPart?._tag === "ModelPart" && modelPart.part.type === "tool-call") {
            expect(modelPart.part.providerExecuted).toBe(true)
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "resumes a framework call that reuses a provider-executed call id", () => {
    let modelCalls = 0
    let approvalChecks = 0
    let executions = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(
              providerToolCallPart("reused-call", "gated", { text: "provider" }),
              textDelta("provider handled it"),
            )
          }
          if (modelCalls === 2) {
            return Stream.make(toolCallPart("reused-call", "gated", { text: "framework" }))
          }
          return Stream.make(textDelta("resumed"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return Effect.succeed({ _tag: "Success", result: "done", encodedResult: "done" })
          },
        }),
        Approvals.layerTest({
          resolve: (pending) => {
            approvalChecks += 1
            return Effect.succeed(
              approvalChecks === 1 ? { ...pending, token: "reused-call-token" } : { _tag: "Approved" },
            )
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "reused-provider-call-agent", toolkit: Toolkit.make(gatedTool) })
        const first = yield* Stream.runCollect(Agent.stream(agent, { prompt: "provider call" }))
        const firstTurn = first.find((event) => event._tag === "TurnCompleted")
        if (firstTurn?._tag !== "TurnCompleted") return expect.unreachable()

        let checkpoint: Prompt.Prompt | undefined
        const suspended = yield* Agent.stream(agent, { prompt: "framework call", history: firstTurn.transcript }).pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (event._tag === "TurnCompleted") checkpoint = event.transcript
            }),
          ),
          Stream.runDrain,
          Effect.flip,
        )
        if (suspended._tag !== "tenetkit/core/AgentSuspended" || checkpoint === undefined) {
          return expect.unreachable()
        }

        const resumed = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            history: checkpoint,
            resume: {
              suspension: suspended,
              resolutions: [{ waitId: suspended.waits[0]!.waitId, resolution: { _tag: "Approved" } }],
            },
          }),
        )

        const resumedTurn = resumed.find((event) => event._tag === "TurnCompleted")
        if (resumedTurn?._tag !== "TurnCompleted") return expect.unreachable()
        const duplicate = yield* Agent.stream(agent, {
          prompt: "ignored",
          history: resumedTurn.transcript,
          resume: { suspension: suspended },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(duplicate).toMatchObject({
          _tag: "tenetkit/core/ResumeMismatch",
          reason: "checkpoint-not-found",
          received: suspended,
        })
        expect(executions).toBe(1)
        expect(approvalChecks).toBe(1)
        expect(modelCalls).toBe(3)
      }),
    ] as const
  })

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
        ToolExecutor.layerTest({
          execute: () => {
            executed += 1
            return Effect.succeed({ _tag: "Success", result: { ok: true }, encodedResult: { ok: true } })
          },
        }),
        Approvals.layerTest({ resolve: () => Effect.die("approvals must not be consulted") }),
        ModelMiddleware.layerIdentity,
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
        Approvals.layerTest({
          resolve: () => {
            approvals += 1
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "dynamic-gated-agent", toolkit: Toolkit.make(dynamicTool) })
        const events: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "large amount" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(approvals).toBe(1)
        expect(failure).toMatchObject({ stage: "authorization", tool: "dynamic-gated" })
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
      }),
    ] as const
  })

  ItLayer.make(it, "fails closed when needsApproval functions throw or fail", () => {
    let approvals = 0
    let calls = 0
    const amountParameters = Schema.Struct({ amount: Schema.Finite })
    const failingNeedsApproval: Tool.NeedsApprovalFunction<typeof amountParameters> = () =>
      Effect.die("approval predicate failed")
    const throwingTool = Tool.make("throwing-approval", {
      description: "Throwing approval test tool",
      parameters: amountParameters,
      success: Schema.Unknown,
      needsApproval: () => {
        throw new Error("approval predicate exploded")
      },
    })
    const failingTool = Tool.make("failing-approval", {
      description: "Failing approval test tool",
      parameters: amountParameters,
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
        Approvals.layerTest({
          resolve: () => {
            approvals += 1
            return Effect.succeed({ _tag: "Denied" })
          },
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "fail-closed-agent",
          toolkit: Toolkit.make(throwingTool, failingTool),
        })

        const events: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "needs approval fail closed" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(approvals).toBe(1)
        expect(failure).toMatchObject({ stage: "authorization", tool: "throwing-approval" })
        expect(events.filter((event) => event._tag === "ApprovalRequested")).toHaveLength(1)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
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
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "fails with authorization evidence when approvals deny", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          if (calls === 1) {
            return Stream.make(toolCallPart("tool-call-denied", "gated", { text: "please" }))
          }
          return Stream.make(textDelta("saw denial"))
        }),
        unusedExecutor,
        Approvals.layerDenyAll,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({
          name: "denied-agent",
          toolkit: Toolkit.make(gatedTool),
        })

        const events: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Stream.runForEach(Agent.stream(agent, { prompt: "use the gated tool" }), (event) =>
            Effect.sync(() => events.push(event)),
          ),
        )

        expect(failure).toMatchObject({ stage: "authorization", tool: "gated" })
        expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
        expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(false)
        expect(calls).toBe(1)
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
          Approvals.layerTest({
            resolve: (pending) => Effect.succeed({ ...pending, token: "approval-1" }),
          }),
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "pending-agent",
            toolkit: Toolkit.make(gatedTool),
          })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" })))

          expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
          if (failure._tag === "tenetkit/core/AgentSuspended") {
            expect(failure.waits[0]?.token).toBe("approval:tool-call-pending")
            expect(failure.waits[0]?.reason).toBe("approval")
            expect(failure.waits[0]?.call.name).toBe("gated")
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
        Approvals.layerTest({ resolve: () => Effect.die("approvals must not be consulted") }),
        ModelMiddleware.layerIdentity,
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

  ItLayer.make(it, "restores the next model identity from a durable checkpoint", () => [
    Layer.mergeAll(
      modelLayer(() => Stream.make(textDelta("done"), finishPart("stop", usage({ total: 2 }, { total: 1 })))),
      ModelMiddleware.layerIdentity,
    ),
    Effect.gen(function* () {
      const agent = Agent.make({ name: "checkpoint-identity-agent" })
      const executable = ExecutableManifest.makeTest("checkpoint-identity-agent", undefined)
      const budget = RunBudget.make({})
      const checkpoint: DurableDriver.DriverCheckpoint = {
        driverVersion: DurableDriver.currentDriverVersion,
        executable: executable.ref,
        turn: 0,
        budget,
        state: {
          logicalOperationId: "operation:restored",
          sessionId: "session:restored",
          modelCallOrdinal: 9,
          modelCallOrdinalStart: 0,
        },
      }
      const events = yield* Stream.runCollect(
        Agent.stream(agent, {
          prompt: "continue",
          logicalOperationId: "operation:restored",
          executableRef: executable.ref,
          driverCheckpoint: checkpoint,
        }),
      )
      const call = events.find((event) => event._tag === "ModelCallStarted")
      const attempt = events.find((event) => event._tag === "ModelAttemptStarted")
      expect(call?._tag === "ModelCallStarted" ? call.modelCallId : undefined).toBe(
        "operation:restored:model-call:9:conversation",
      )
      expect(attempt?._tag === "ModelAttemptStarted" ? attempt.modelAttemptId : undefined).toBe(
        "operation:restored:model-call:9:conversation:attempt:0",
      )
    }),
  ])

  ItLayer.make(it, "reconciles a turn-12 pending model operation with the same identity after restart", () => {
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          const turn = modelCalls++
          return turn < 12
            ? Stream.make(
                toolCallPart(`journal-echo-${turn}`, "echo", { text: String(turn) }),
                finishPart("tool-calls", usage({ total: 2 }, { total: 1 })),
              )
            : Stream.make(textDelta("done"), finishPart("stop", usage({ total: 2 }, { total: 1 })))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Session.layerMemory,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "journal-restart-agent", toolkit: Toolkit.make(echoTool) })
        const executable = ExecutableManifest.makeTest("journal-restart-agent", undefined)
        const pendingKey = "journal-restart:model:12:52:conversation"
        let pending: DurableDriver.DriverCheckpoint | undefined
        const crashingJournal: DurableDriver.Journal = {
          onScheduled: (operation, checkpoint) => {
            if (operation.key !== pendingKey) return Effect.void
            return Effect.sync(() => {
              pending = checkpoint
            }).pipe(Effect.andThen(Effect.interrupt))
          },
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        }
        yield* Agent.stream(agent, {
          prompt: "continue",
          logicalOperationId: "journal-restart",
          executableRef: executable.ref,
          modelCallOrdinalStart: 40,
          sessionId: "journal-restart",
        }).pipe(Stream.runDrain, Effect.provideService(DurableDriver.DriverJournal, crashingJournal), Effect.exit)
        expect(modelCalls).toBe(12)
        expect(pending).toBeDefined()
        expect(pending?.turn).toBe(12)
        expect(pending?.state).toMatchObject({
          modelCallOrdinal: 53,
          pending: { key: pendingKey, input: { turn: 12, modelCallOrdinal: 52 } },
        })

        const scheduled: Array<string> = []
        let safeCheckpoint: DurableDriver.DriverCheckpoint | undefined
        const resumedJournal: DurableDriver.Journal = {
          onScheduled: (operation) =>
            Effect.sync(() => {
              scheduled.push(operation.key)
            }).pipe(Effect.as(undefined)),
          onCompleted: (_operation, _outcome, checkpoint) =>
            Effect.sync(() => {
              safeCheckpoint = checkpoint
            }),
          onCheckpoint: (checkpoint) =>
            Effect.sync(() => {
              safeCheckpoint = checkpoint
            }),
        }
        const events = yield* Agent.stream(agent, {
          prompt: Prompt.empty,
          logicalOperationId: "journal-restart",
          executableRef: executable.ref,
          driverCheckpoint: pending!,
          sessionId: "journal-restart",
        }).pipe(Stream.runCollect, Effect.provideService(DurableDriver.DriverJournal, resumedJournal))
        expect(scheduled.find((key) => key.includes(":model:"))).toBe(pendingKey)
        const turnStarted = events.find((event) => event._tag === "TurnStarted")
        const call = events.find((event) => event._tag === "ModelCallStarted")
        const attempt = events.find((event) => event._tag === "ModelAttemptStarted")
        expect(turnStarted).toMatchObject({ _tag: "TurnStarted", turn: 12 })
        expect(call).toMatchObject({
          _tag: "ModelCallStarted",
          turn: 12,
          modelCallId: "journal-restart:model-call:52:conversation",
        })
        expect(attempt).toMatchObject({
          _tag: "ModelAttemptStarted",
          modelAttemptId: "journal-restart:model-call:52:conversation:attempt:0",
        })
        expect(modelCalls).toBe(13)
        expect(safeCheckpoint?.turn).toBe(12)
        const safeState = yield* Schema.decodeUnknownEffect(checkpointStateSchema)(safeCheckpoint?.state)
        expect(safeState.pending).toBeUndefined()

        const overrideScheduled: Array<{ readonly key: string; readonly turn: number }> = []
        const overrideJournal: DurableDriver.Journal = {
          onScheduled: (operation, checkpoint) =>
            Effect.sync(() => {
              overrideScheduled.push({ key: operation.key, turn: checkpoint.turn })
            }).pipe(Effect.as(undefined)),
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        }
        const overrideEvents = yield* Agent.stream(agent, {
          prompt: Prompt.empty,
          logicalOperationId: "journal-restart",
          executableRef: executable.ref,
          driverCheckpoint: safeCheckpoint!,
          sessionId: "journal-restart",
          turnStart: 13,
        }).pipe(Stream.runCollect, Effect.provideService(DurableDriver.DriverJournal, overrideJournal))
        expect(overrideScheduled.every(({ turn }) => turn >= 12)).toBe(true)
        expect(overrideScheduled.find(({ key }) => key.includes(":model:"))?.key).toBe(
          "journal-restart:model:13:53:conversation",
        )
        const overrideTurnStarted = overrideEvents.find((event) => event._tag === "TurnStarted")
        const overrideCall = overrideEvents.find((event) => event._tag === "ModelCallStarted")
        expect(overrideTurnStarted?._tag === "TurnStarted" ? overrideTurnStarted.turn : undefined).toBe(13)
        expect(overrideCall?._tag === "ModelCallStarted" ? overrideCall.turn : undefined).toBe(13)
        expect(modelCalls).toBe(14)
      }),
    ]
  })

  ItLayer.make(it, "joins model telemetry and ModelPart identity across a tool-call run", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(
                toolCallPart("tool-call-telemetry", "echo", { text: "observe" }),
                finishPart("tool-calls", usage({ total: 10 }, { total: 2 })),
              )
            : Stream.make(textDelta("done"), finishPart("stop", usage({ total: 12 }, { total: 3 })))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "telemetry-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "use the echo tool",
            logicalOperationId: "operation:telemetry-offset",
            modelCallOrdinalStart: 7,
          }),
        )

        const callsStarted = events.filter((event) => event._tag === "ModelCallStarted")
        const attemptsStarted = events.filter((event) => event._tag === "ModelAttemptStarted")
        const callsCompleted = events.filter((event) => event._tag === "ModelCallCompleted")
        const modelParts = events.filter((event) => event._tag === "ModelPart")

        expect(callsStarted.map((event) => event.turn)).toEqual([0, 1])
        expect(callsStarted.every((event) => event.purpose === "conversation")).toBe(true)
        expect(callsStarted.map((event) => event.modelCallId)).toEqual([
          "operation:telemetry-offset:model-call:7:conversation",
          "operation:telemetry-offset:model-call:8:conversation",
        ])
        expect(callsCompleted.map((event) => event.attempts)).toEqual([1, 1])
        expect(callsCompleted.map((event) => event.usage?.outputTokens.total)).toEqual([2, 3])
        expect(modelParts.length).toBeGreaterThan(0)
        for (const part of modelParts) {
          const call = callsStarted.find((event) => event.turn === part.turn)
          const attempt = attemptsStarted.find((event) => event.turn === part.turn)
          expect(part.modelCallId).toBe(call?.modelCallId)
          expect(part.modelAttemptId).toBe(attempt?.modelAttemptId)
          expect(part.attempt).toBe(0)
        }
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "delivers durable telemetry in ordered immutable batches matching live delivery IDs", () => {
    const batches: Array<ReadonlyArray<ModelTelemetry.Event>> = []
    const sink = Layer.succeed(
      ModelTelemetry.Sink,
      ModelTelemetry.Sink.of({
        deliver: (batch) =>
          Effect.sync(() => {
            expect(batch.sessionId).toBe("delivery-session")
            batches.push(batch.events)
          }),
      }),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"), finishPart("stop", usage({ total: 2 }, { total: 1 })))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        sink,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "delivery-agent" }), { prompt: "go", sessionId: "delivery-session" }),
        )
        const live = events.filter((event): event is ModelTelemetry.Event => "deliveryId" in event)
        const delivered = batches.flat()

        expect(batches.length).toBeGreaterThan(0)
        expect(batches.every(Object.isFrozen)).toBe(true)
        expect(() =>
          Object.defineProperty(batches[0], batches[0]!.length, { value: delivered[0], configurable: true }),
        ).toThrow()
        expect(delivered.map((event) => event.deliveryId)).toEqual(live.map((event) => event.deliveryId))
        expect(new Set(delivered.map((event) => event.deliveryId)).size).toBe(delivered.length)
      }),
    ] as const
  })

  ItLayer.make(it, "fails typed when durable telemetry delivery rejects an exact stable batch", () => {
    const attempted: Array<ReadonlyArray<ModelTelemetry.Event>> = []
    const sink = Layer.succeed(
      ModelTelemetry.Sink,
      ModelTelemetry.Sink.of({
        deliver: (batch) => {
          attempted.push(batch.events)
          return Effect.fail(ModelTelemetry.SinkFailed.make({ message: "sink unavailable" }))
        },
      }),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("not visible"))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        sink,
      ),
      Effect.gen(function* () {
        const seen: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(Agent.make({ name: "delivery-failure-agent" }), { prompt: "go" }).pipe(
              Stream.tap((event) => Effect.sync(() => seen.push(event))),
            ),
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/SinkFailed")
        expect(attempted).toHaveLength(1)
        expect(Object.isFrozen(attempted[0])).toBe(true)
        const attemptedIds = attempted[0]!.map((event) => event.deliveryId)
        expect(attemptedIds).toEqual([...attemptedIds])
        expect(seen.filter((event) => "deliveryId" in event)).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "interrupts hanging durable telemetry delivery without emitting the in-flight batch", () => {
    const entered = Deferred.makeUnsafe<void>()
    const attempted: Array<ReadonlyArray<ModelTelemetry.Event>> = []
    const sink = Layer.succeed(
      ModelTelemetry.Sink,
      ModelTelemetry.Sink.of({
        deliver: (batch) =>
          Effect.sync(() => attempted.push(batch.events)).pipe(
            Effect.andThen(Deferred.succeed(entered, undefined)),
            Effect.andThen(Effect.never),
          ),
      }),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("not visible"))),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        sink,
      ),
      Effect.gen(function* () {
        const seen: Array<AgentEvent.Event> = []
        const fiber = yield* Stream.runDrain(
          Agent.stream(Agent.make({ name: "hanging-delivery-agent" }), { prompt: "go" }).pipe(
            Stream.tap((event) => Effect.sync(() => seen.push(event))),
          ),
        ).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
        expect(attempted).toHaveLength(1)
        expect(seen.filter((event) => "deliveryId" in event)).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "streams the retry lifecycle and stamps parts with the retried attempt", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1 ? Stream.fail(transientModelError) : Stream.make(textDelta("recovered"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        retryTransientModelError,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "retry-telemetry-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "retry stream" }))

        const attemptsStarted = events.filter((event) => event._tag === "ModelAttemptStarted")
        const attemptFailed = events.filter((event) => event._tag === "ModelAttemptFailed")
        const retries = events.filter((event) => event._tag === "ModelRetryScheduled")
        const modelParts = events.filter((event) => event._tag === "ModelPart")

        expect(calls).toBe(2)
        expect(attemptsStarted.map((event) => event.attempt)).toEqual([0, 1])
        expect(attemptFailed.map((event) => event.category)).toEqual(["rate-limit"])
        expect(attemptFailed.map((event) => event.classification)).toEqual(["transient"])
        expect(retries.map((event) => event.attempt)).toEqual([0])
        expect(retries.map((event) => event.reason)).toEqual(["provider-resilience"])
        expect(modelParts.every((event) => event.attempt === 1)).toBe(true)
        expect(modelParts.every((event) => event.modelAttemptId === attemptsStarted[1]?.modelAttemptId)).toBe(true)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "marks the terminal structured turn as a structured-output call",
    () =>
      [
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "structured-telemetry-agent" })

          const events = yield* Stream.runCollect(
            Agent.stream(agent, { prompt: "object", output: { schema: objectSchema } }),
          )

          const purposes = events
            .filter((event) => event._tag === "ModelCallStarted")
            .map((event) => [event.turn, event.purpose])
          expect(purposes).toEqual([
            [0, "conversation"],
            [1, "structured-output"],
          ])
        }),
      ] as const,
  )

  ItLayer.make(it, "surfaces run failure after emitting the failed call telemetry", () => {
    const terminalStreamError = AiError.make({
      module: "AgentTestLanguageModel",
      method: "streamText",
      reason: AiError.AuthenticationError.make({ kind: "InvalidKey" }),
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fail(terminalStreamError)),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "failing-telemetry-agent" })
        const seen: Array<AgentEvent.Event> = []

        const failure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(agent, { prompt: "fail" }).pipe(
              Stream.tap((event) =>
                Effect.sync(() => {
                  seen.push(event)
                }),
              ),
            ),
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        const attemptFailed = seen.filter((event) => event._tag === "ModelAttemptFailed")
        const callFailed = seen.filter((event) => event._tag === "ModelCallFailed")
        expect(attemptFailed.map((event) => event.category)).toEqual(["authentication"])
        expect(callFailed.map((event) => event.category)).toEqual(["authentication"])
      }),
    ] as const
  })

  it.effect("interrupts a hanging instrumented model stream immediately", () =>
    Effect.gen(function* () {
      const sawPart = yield* Deferred.make<void>()
      const providedModelLayer = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.never)),
        }),
      )
      const agent = Agent.make({ name: "telemetry-interrupt-agent" })
      const seen: Array<AgentEvent.Event> = []
      const run = Agent.stream(agent, { prompt: "hang" }).pipe(
        Stream.provide(providedModelLayer),
        Stream.tap((event) =>
          Effect.sync(() => {
            seen.push(event)
          }).pipe(Effect.andThen(event._tag === "ModelPart" ? Deferred.succeed(sawPart, undefined) : Effect.void)),
        ),
        Stream.runDrain,
      )

      const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(sawPart)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
      expect(seen.map((event) => event._tag)).toEqual([
        "TurnStarted",
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelPart",
      ])
    }),
  )

  ItLayer.make(it, "does not threshold-compact a large inline image by encoded byte length", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return Stream.make(textDelta("image understood"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layer({ contextWindow: 100_000, reserveTokens: 10_000, keepRecentTokens: 20_000 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const prompt = Prompt.fromMessages([
          Prompt.makeMessage("user", {
            content: [
              Prompt.makePart("text", { text: "Describe this image" }),
              Prompt.makePart("file", {
                mediaType: "image/png",
                data: `data:image/png;base64,${"A".repeat(1_000_000)}`,
              }),
            ],
          }),
        ])

        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "inline-image-compaction-agent" }), { prompt }),
        )

        expect(calls).toBe(1)
        expect(events.filter((event) => event._tag === "CompactionStarted")).toHaveLength(0)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "links compaction lifecycle to the summary model call", () => {
    let streamCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(
          () => {
            streamCalls += 1
            return streamCalls === 1
              ? Stream.make(
                  toolCallPart("tool-call-compaction-telemetry", "echo", { text: "needs summary" }),
                  finishPart("stop", usage({ total: 100 }, { total: 1 })),
                )
              : Stream.make(textDelta("after compaction"))
          },
          () => Effect.succeed([{ type: "text", text: "checkpoint summary" }]),
        ),
        echoExecutor,
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "compaction-telemetry-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(
          Agent.stream(agent, { prompt: "old context", sessionId: "compaction-telemetry" }),
        )

        const compactionStarted = events.filter((event) => event._tag === "CompactionStarted")
        const compactionSkipped = events.filter((event) => event._tag === "CompactionSkipped")
        const compactionCompleted = events.filter((event) => event._tag === "CompactionApplied")
        const summaryCalls = events.filter(
          (event) => event._tag === "ModelCallStarted" && event.purpose === "compaction-summary",
        )

        expect(compactionStarted).toHaveLength(2)
        expect(compactionSkipped).toHaveLength(1)
        expect(compactionSkipped[0]?.compactionId).toBe(compactionStarted[0]?.compactionId)
        expect(compactionStarted.every((event) => event.trigger === "threshold")).toBe(true)
        expect(compactionStarted.every((event) => (event.contextTokensBefore ?? 0) > 0)).toBe(true)
        expect(compactionCompleted.map((event) => event.kind)).toEqual(["summarize"])
        expect(compactionStarted.map((event) => event.compactionId)).toContain(compactionCompleted[0]?.compactionId)
        const summarize = compactionCompleted[0]
        expect(summaryCalls).toHaveLength(1)
        expect(summaryCalls[0]?._tag === "ModelCallStarted" && summaryCalls[0].compactionId).toBe(
          summarize?.compactionId,
        )
        expect(summarize?._tag === "CompactionApplied" && summarize.commit.summaryModelCallId).toBe(
          summaryCalls[0]?._tag === "ModelCallStarted" ? summaryCalls[0].modelCallId : undefined,
        )
        const summaryCompleted = events.find(
          (event) =>
            event._tag === "ModelCallCompleted" &&
            summaryCalls[0]?._tag === "ModelCallStarted" &&
            event.modelCallId === summaryCalls[0].modelCallId,
        )
        expect(summaryCompleted?._tag).toBe("ModelCallCompleted")
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "atomically checkpoints durable telemetry and compaction commitment before live flush", () => {
    let streamCalls = 0
    const prepared: Array<Session.PreparedCheckpoint> = []
    const recordingSession = Layer.effect(
      Session.SessionDirectory,
      Session.SessionDirectory.pipe(
        Effect.map((delegate) =>
          Session.SessionDirectory.of({
            acquire: (sessionId) =>
              delegate.acquire(sessionId).pipe(
                Effect.map((store) => ({
                  ...store,
                  appendCheckpoint: (checkpoint) =>
                    Effect.sync(() => prepared.push(checkpoint)).pipe(
                      Effect.andThen(store.appendCheckpoint(checkpoint)),
                    ),
                })),
              ),
          }),
        ),
      ),
    ).pipe(Layer.provide(Session.layerMemory))
    return [
      Layer.mergeAll(
        modelLayer(
          () => {
            streamCalls += 1
            return streamCalls === 1
              ? Stream.make(
                  toolCallPart("tool-call-durable-compaction", "echo", { text: "needs summary" }),
                  finishPart("stop", usage({ total: 100 }, { total: 1 })),
                )
              : Stream.make(textDelta("after compaction"))
          },
          () => Effect.succeed([{ type: "text", text: "durable checkpoint summary" }]),
        ),
        echoExecutor,
        Approvals.layerAutoApprove,
        recordingSession,
        Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "durable-compaction-agent", toolkit: Toolkit.make(echoTool) }), {
            prompt: "old context",
            sessionId: "durable-compaction",
          }),
        )
        const checkpoint = prepared.find((item) => item.compactionCommit?.summaryModelCallId !== undefined)
        expect(checkpoint).toBeDefined()
        if (checkpoint === undefined || checkpoint.compactionCommit === undefined) return
        const tags = checkpoint.telemetry
          .filter(
            (event) =>
              ("compactionId" in event && event.compactionId === checkpoint.compactionCommit?.compactionId) ||
              ("modelCallId" in event && event.modelCallId === checkpoint.compactionCommit?.summaryModelCallId),
          )
          .map((event) => event._tag)
          .filter((tag) => tag !== "ModelAttemptFirstOutput")
        expect(tags).toEqual([
          "CompactionStarted",
          "ModelCallStarted",
          "ModelAttemptStarted",
          "ModelAttemptCompleted",
          "ModelCallCompleted",
          "CompactionApplied",
        ])
        for (const durable of checkpoint.telemetry) {
          expect(events.find((event) => "deliveryId" in event && event.deliveryId === durable.deliveryId)).toEqual(
            durable,
          )
        }
        const commit = checkpoint.compactionCommit
        const started = checkpoint.telemetry.find(
          (event) => event._tag === "CompactionStarted" && event.compactionId === commit.compactionId,
        )
        const summaryStarted = checkpoint.telemetry.find(
          (event) => event._tag === "ModelCallStarted" && event.modelCallId === commit.summaryModelCallId,
        )
        const completed = events.find(
          (event) => event._tag === "CompactionApplied" && event.compactionId === commit.compactionId,
        )
        expect(commit.compactionId).toBe(started?._tag === "CompactionStarted" ? started.compactionId : undefined)
        expect(commit.compactionId).toBe(completed?._tag === "CompactionApplied" ? completed.compactionId : undefined)
        expect(commit.compactionId).toBe(
          summaryStarted?._tag === "ModelCallStarted" ? summaryStarted.compactionId : undefined,
        )
        expect(commit.summaryModelCallId).toBe(
          summaryStarted?._tag === "ModelCallStarted" ? summaryStarted.modelCallId : undefined,
        )
        expect(commit.checkpointId).toBe(checkpoint.id)
        for (const measurement of [
          commit.contextTokensBefore,
          commit.contextTokensAfter,
          commit.entriesBefore,
          commit.entriesAfter,
        ]) {
          expect(measurement).toBeDefined()
          expect(measurement).toBeGreaterThanOrEqual(0)
        }
        expect(commit.entriesAfter).toBe(checkpoint.projectedHistory.content.length)
      }),
    ] as const
  })

  ItLayer.make(it, "commits changed compaction without a summary model call", () => {
    let calls = 0
    const prepared: Array<Session.PreparedCheckpoint> = []
    const recordingSession = Layer.effect(
      Session.SessionDirectory,
      Session.SessionDirectory.pipe(
        Effect.map((delegate) =>
          Session.SessionDirectory.of({
            acquire: (sessionId) =>
              delegate.acquire(sessionId).pipe(
                Effect.map((store) => ({
                  ...store,
                  appendCheckpoint: (checkpoint) =>
                    Effect.sync(() => prepared.push(checkpoint)).pipe(
                      Effect.andThen(store.appendCheckpoint(checkpoint)),
                    ),
                })),
              ),
          }),
        ),
      ),
    ).pipe(Layer.provide(Session.layerMemory))
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-microcompact", "echo", { text: "x".repeat(200) }))
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        recordingSession,
        Compaction.layer({
          strategy: Compaction.strategy([Compaction.toolOutputBound({ maxBytes: 8 })]),
          contextWindow: 1,
          reserveTokens: 0,
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(Agent.make({ name: "microcompact-commit-agent", toolkit: Toolkit.make(echoTool) }), {
            prompt: "compact",
            sessionId: "microcompact-commit",
          }),
        )
        const checkpoint = prepared.find((item) => item.compactionCommit !== undefined)
        expect(checkpoint).toBeDefined()
        if (checkpoint?.compactionCommit === undefined) return
        expect(checkpoint.compactionCommit.summaryModelCallId).toBeUndefined()
        expect(checkpoint.compactionCommit.contextTokensBefore).toBeGreaterThanOrEqual(0)
        expect(checkpoint.compactionCommit.contextTokensAfter).toBeGreaterThanOrEqual(0)
        expect(checkpoint.compactionCommit.entriesBefore).toBeGreaterThanOrEqual(0)
        expect(checkpoint.compactionCommit.entriesAfter).toBe(checkpoint.projectedHistory.content.length)
        const completed = events.find(
          (event) =>
            event._tag === "CompactionApplied" && event.compactionId === checkpoint.compactionCommit?.compactionId,
        )
        expect(completed?._tag === "CompactionApplied" && completed.kind).toBe("microcompact")
      }),
    ] as const
  })

  ItLayer.make(it, "emits one terminal failure when started compaction work fails", () => [
    Layer.mergeAll(
      modelLayer(() => Stream.make(textDelta("unreachable"))),
      Layer.succeed(
        Compaction.Compaction,
        Compaction.Compaction.of({
          willCompact: () => true,
          maybeCompact: (request) =>
            Effect.fail(Compaction.CompactionError.make({ message: "compaction work failed" })).pipe(
              Compaction.withLifecycle(request),
            ),
        }),
      ),
      ModelMiddleware.layerIdentity,
    ),
    Effect.gen(function* () {
      const seen: Array<AgentEvent.Event> = []
      const failure = yield* Agent.stream(Agent.make({ name: "failed-compaction-work-agent" }), {
        prompt: "compact",
      }).pipe(
        Stream.tap((event) => Effect.sync(() => seen.push(event))),
        Stream.runDrain,
        Effect.flip,
      )
      expect(failure._tag).toBe("tenetkit/core/AgentError")
      expect(seen.filter((event) => event._tag === "CompactionStarted")).toHaveLength(1)
      expect(seen.filter((event) => event._tag === "CompactionFailed")).toHaveLength(1)
    }),
  ])

  ItLayer.make(it, "does not apply compaction when checkpoint append fails", () => {
    let calls = 0
    const successfulCheckpoints = 0
    const failingSession = Layer.effect(
      Session.SessionDirectory,
      Session.SessionDirectory.pipe(
        Effect.map((delegate) =>
          Session.SessionDirectory.of({
            acquire: (sessionId) =>
              delegate.acquire(sessionId).pipe(
                Effect.map((store) => ({
                  ...store,
                  appendCheckpoint: () => Effect.fail(Session.SessionStoreError.make({ message: "checkpoint failed" })),
                })),
              ),
          }),
        ),
      ),
    ).pipe(Layer.provide(Session.layerMemory))
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-failed-checkpoint", "echo", { text: "x".repeat(200) }))
            : Stream.make(textDelta("unreachable"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        failingSession,
        Compaction.layer({
          strategy: Compaction.strategy([Compaction.toolOutputBound({ maxBytes: 8 })]),
          contextWindow: 1,
          reserveTokens: 0,
        }),
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const seen: Array<AgentEvent.Event> = []
        const failure = yield* Agent.stream(
          Agent.make({ name: "failed-compaction-checkpoint-agent", toolkit: Toolkit.make(echoTool) }),
          { prompt: "compact", sessionId: "failed-compaction-checkpoint" },
        ).pipe(
          Stream.tap((event) => Effect.sync(() => seen.push(event))),
          Stream.runDrain,
          Effect.flip,
        )
        expect(failure._tag).toBe("tenetkit/core/AgentError")
        const completedIndex = seen.findIndex((event) => event._tag === "CompactionApplied")
        expect(completedIndex).toBe(-1)
        expect(seen.filter((event) => event._tag === "CompactionFailed")).toHaveLength(1)
        expect(successfulCheckpoints).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "keeps tool-owned model calls out of run telemetry", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-tool-owned", "echo", { text: "ask the model" }))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.gen(function* () {
              const model = yield* Effect.serviceOption(LanguageModel.LanguageModel)
              expect(Option.isSome(model)).toBe(true)
              if (Option.isSome(model)) {
                yield* Stream.runDrain(model.value.streamText({ prompt: "tool-owned model call" })).pipe(Effect.orDie)
              }
              return {
                _tag: "Success",
                result: { echoed: true },
                encodedResult: { echoed: true },
              }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "tool-owned-model-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

        const callsStarted = events.filter((event) => event._tag === "ModelCallStarted")
        const attemptsStarted = events.filter((event) => event._tag === "ModelAttemptStarted")
        expect(callsStarted.map((event) => event.turn)).toEqual([0, 1])
        expect(attemptsStarted.map((event) => event.turn)).toEqual([0, 1])
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "resets inherited compaction telemetry context at the run boundary", () => [
    Layer.mergeAll(
      modelLayer(() => Stream.make(textDelta("plain"))),
      unusedExecutor,
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
    ),
    Effect.gen(function* () {
      const agent = Agent.make({ name: "reset-telemetry-agent" })
      const outerCell: ModelTelemetry.SummaryCallCell = { current: undefined }

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "nested run inside a summarizer" }).pipe(
          Stream.provideService(ModelTelemetry.CurrentPurpose, "compaction-summary"),
          Stream.provideService(ModelTelemetry.CurrentCompactionId, "outer-compaction"),
          Stream.provideService(ModelTelemetry.CurrentSummaryCall, outerCell),
        ),
      )

      const started = events.filter((event) => event._tag === "ModelCallStarted")
      expect(started).toHaveLength(1)
      expect(started[0]?.purpose).toBe("conversation")
      expect(started[0]?.compactionId).toBeUndefined()
      expect(outerCell.current).toBeUndefined()
      expect(events.at(-1)?._tag).toBe("Completed")
    }),
  ])
})
