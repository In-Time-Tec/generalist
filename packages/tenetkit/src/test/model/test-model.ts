import { Duration, Effect, Function, Layer, Option, Schema, Stream, SubscriptionRef } from "effect"
import { AiError, LanguageModel, ModelRegistry, Prompt, Response, Tool } from "tenetkit"
import { compile, type CompiledStream } from "./test-model-compile.js"

/** @experimental */
export interface TextPart {
  readonly _tag: "Text"
  readonly text: string
}

/** @experimental */
export interface ReasoningPart {
  readonly _tag: "Reasoning"
  readonly text: string
}

/** @experimental */
export interface ToolCallPart {
  readonly _tag: "ToolCall"
  readonly name: string
  readonly params: unknown
  readonly id?: string
  readonly providerExecuted: boolean
}

/** @experimental */
export type Part = TextPart | ReasoningPart | ToolCallPart

/** @experimental */
export interface StepOptions {
  readonly finishReason?: Response.FinishReason
  readonly usage?: Response.Usage
  readonly delay?: Duration.Input
  readonly streamPartDelay?: Duration.Input
}

/** @experimental */
export interface TurnStep extends StepOptions {
  readonly _tag: "Turn"
  readonly parts: ReadonlyArray<Part>
}

/**
 * @experimental Where a truncated step stops emitting. The stream always ends
 * without a `finish` part, reproducing a provider body that reached EOF without
 * its terminal event.
 */
export type TruncationPoint = "reasoning-delta" | "text-delta" | "tool-params-delta" | "response-metadata"

/** @experimental A provider stream that ends mid-content and never emits `finish`. */
export interface TruncatedStep {
  readonly _tag: "Truncated"
  readonly parts: ReadonlyArray<Part>
  readonly stopAfter: TruncationPoint
  readonly delay?: Duration.Input
  readonly streamPartDelay?: Duration.Input
}

/** @experimental */
export interface ObjectStep extends StepOptions {
  readonly _tag: "Object"
  readonly value: unknown
}

/** @experimental */
export interface FailureStep {
  readonly _tag: "Failure"
  readonly error: AiError.AiError
  readonly delay?: Duration.Input
}

/** @experimental */
export type Step = Part | TurnStep | ObjectStep | FailureStep | TruncatedStep

/** @experimental */
export interface ToolCallOptions {
  readonly id?: string
  readonly providerExecuted?: boolean
}

/** @experimental */
export interface MakeOptions {
  readonly provider?: string
  readonly model?: string
  readonly registrationKey?: string
  readonly metadata?: ModelRegistry.Metadata
}

/** @experimental */
export type Operation = "streamText" | "generateText" | "generateObject"

/** @experimental */
export interface Request {
  readonly index: number
  readonly operation: Operation
  readonly prompt: Prompt.Prompt
  readonly tools: ReadonlyArray<Tool.Any>
  readonly toolChoice: LanguageModel.ProviderOptions["toolChoice"]
  readonly responseFormat: LanguageModel.ProviderOptions["responseFormat"]
  readonly previousResponseId: string | undefined
  readonly incrementalPrompt: Prompt.Prompt | undefined
}

/** @experimental */
export interface Fixture {
  readonly layer: Layer.Layer<LanguageModel.LanguageModel>
  readonly selection: ModelRegistry.ModelSelection
  readonly registration: ModelRegistry.Registration
  readonly registryLayer: Layer.Layer<ModelRegistry.ModelRegistry>
  readonly requests: Effect.Effect<ReadonlyArray<Request>>
  readonly prompts: Effect.Effect<ReadonlyArray<Prompt.Prompt>>
  readonly remaining: Effect.Effect<number>
  readonly awaitRequests: (count: number) => Effect.Effect<ReadonlyArray<Request>>
}

interface State {
  readonly cursor: number
  readonly requests: ReadonlyArray<Request>
}

type ClaimedStep = TurnStep | ObjectStep | FailureStep | TruncatedStep

interface Claimed {
  readonly step: ClaimedStep | undefined
  readonly request: Request
}

const invalidRequest = (method: Operation, description: string): AiError.AiError =>
  AiError.make({
    module: "tenetkit/test/TestModel",
    method,
    reason: AiError.InvalidRequestError.make({ description }),
  })

const normalizeStep = (step: Step): ClaimedStep =>
  step._tag === "Text" || step._tag === "Reasoning" || step._tag === "ToolCall" ? { _tag: "Turn", parts: [step] } : step

const operation = (method: "streamText" | "generateText", options: LanguageModel.ProviderOptions): Operation =>
  method === "generateText" && options.responseFormat.type === "json" ? "generateObject" : method

const captureRequest = (
  index: number,
  method: "streamText" | "generateText",
  options: LanguageModel.ProviderOptions,
): Request => ({
  index,
  operation: operation(method, options),
  prompt: options.prompt,
  tools: options.tools,
  toolChoice: options.toolChoice,
  responseFormat: options.responseFormat,
  previousResponseId: options.previousResponseId,
  incrementalPrompt: options.incrementalPrompt,
})

const applyDelay = (step: ClaimedStep): Effect.Effect<void> =>
  step.delay === undefined ? Effect.void : Effect.sleep(step.delay)

const claim = (
  state: SubscriptionRef.SubscriptionRef<State>,
  script: ReadonlyArray<Step>,
  method: "streamText" | "generateText",
  options: LanguageModel.ProviderOptions,
): Effect.Effect<Claimed> =>
  SubscriptionRef.modify(state, (current) => {
    const request = captureRequest(current.requests.length, method, options)
    const available = current.cursor < script.length
    const step = available ? normalizeStep(script[current.cursor] as Step) : undefined
    return [
      { step, request },
      {
        cursor: available ? current.cursor + 1 : current.cursor,
        requests: [...current.requests, request],
      },
    ]
  })

const executeGenerate = (
  state: SubscriptionRef.SubscriptionRef<State>,
  script: ReadonlyArray<Step>,
  options: LanguageModel.ProviderOptions,
): Effect.Effect<Array<Response.PartEncoded>, AiError.AiError> =>
  Effect.gen(function* () {
    const claimed = yield* claim(state, script, "generateText", options)
    const step = claimed.step
    if (step === undefined) {
      return yield* invalidRequest(claimed.request.operation, "TestModel script exhausted")
    }
    yield* applyDelay(step)
    if (step._tag === "Failure") return yield* step.error
    if (step._tag === "Truncated") {
      return yield* invalidRequest(claimed.request.operation, "Truncated step requires streamText")
    }
    if (step._tag === "Object") {
      if (options.responseFormat.type !== "json") {
        return yield* invalidRequest(claimed.request.operation, "Object step requires generateObject")
      }
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(step.value).pipe(
        Effect.mapError(() => invalidRequest(claimed.request.operation, "Object step is not JSON serializable")),
      )
      return [
        { type: "text", text: encoded },
        compile.finish(step.finishReason ?? "stop", step.usage ?? compile.emptyUsage()),
      ]
    }
    if (options.responseFormat.type === "json") {
      return yield* invalidRequest(claimed.request.operation, "generateObject requires an Object step")
    }
    return compile.compileGenerate(step, claimed.request.index)
  })

const executeStream = (
  state: SubscriptionRef.SubscriptionRef<State>,
  script: ReadonlyArray<Step>,
  options: LanguageModel.ProviderOptions,
): Effect.Effect<CompiledStream, AiError.AiError> =>
  Effect.gen(function* () {
    const claimed = yield* claim(state, script, "streamText", options)
    const step = claimed.step
    if (step === undefined) {
      return yield* invalidRequest(claimed.request.operation, "TestModel script exhausted")
    }
    yield* applyDelay(step)
    if (step._tag === "Failure") return yield* step.error
    if (step._tag === "Object") {
      return yield* invalidRequest(claimed.request.operation, "Object step requires generateObject")
    }
    const compiled = compile.compileStreamFor(step, claimed.request.index)
    if (AiError.isAiError(compiled)) return yield* compiled
    return compiled
  })

/** @experimental */
export const text = (value: string): TextPart => ({ _tag: "Text", text: value })

/** @experimental */
export const reasoning = (value: string): ReasoningPart => ({ _tag: "Reasoning", text: value })

/** @experimental */
export const toolCall: {
  (params: unknown, options?: ToolCallOptions): (name: string) => ToolCallPart
  (name: string, params: unknown, options?: ToolCallOptions): ToolCallPart
} = Function.dual(
  (args) => typeof args[0] === "string",
  (name: string, params: unknown, options: ToolCallOptions = {}) => ({
    _tag: "ToolCall",
    name,
    params,
    ...(options.id === undefined ? {} : { id: options.id }),
    providerExecuted: options.providerExecuted ?? false,
  }),
)

/** @experimental */
export const turn: {
  (options?: StepOptions): (parts: ReadonlyArray<Part>) => TurnStep
  (parts: ReadonlyArray<Part>, options?: StepOptions): TurnStep
} = Function.dual(
  (args) => Array.isArray(args[0]),
  (parts: ReadonlyArray<Part>, options: StepOptions = {}) => ({
    _tag: "Turn",
    parts,
    ...options,
  }),
)

/**
 * @experimental A turn whose provider stream ends without a `finish` part.
 * `stopAfter: "tool-params-delta"` emits `tool-params-start` and unclosed
 * parameter JSON but never the closing `tool-call`.
 */
export const truncated: {
  (options: {
    readonly stopAfter: TruncationPoint
    readonly delay?: Duration.Input
    readonly streamPartDelay?: Duration.Input
  }): (parts: ReadonlyArray<Part>) => TruncatedStep
  (
    parts: ReadonlyArray<Part>,
    options: {
      readonly stopAfter: TruncationPoint
      readonly delay?: Duration.Input
      readonly streamPartDelay?: Duration.Input
    },
  ): TruncatedStep
} = Function.dual(
  (args) => Array.isArray(args[0]),
  (
    parts: ReadonlyArray<Part>,
    options: {
      readonly stopAfter: TruncationPoint
      readonly delay?: Duration.Input
      readonly streamPartDelay?: Duration.Input
    },
  ) => ({
    _tag: "Truncated",
    parts,
    ...options,
  }),
)

const isStepOptionsLike = (value: unknown): value is StepOptions =>
  typeof value === "object" &&
  value !== null &&
  ("finishReason" in value || "usage" in value || "delay" in value || "streamPartDelay" in value)

/** @experimental */
export const object: {
  (options?: StepOptions): (value: unknown) => ObjectStep
  (value: unknown, options?: StepOptions): ObjectStep
} = Function.dual(
  (args) => args.length > 0 && !isStepOptionsLike(args[0]),
  (value: unknown, options: StepOptions = {}) => ({
    _tag: "Object",
    value,
    ...options,
  }),
)

/** @experimental */
export const failure: {
  (options?: { readonly delay?: Duration.Input }): (error: AiError.AiError) => FailureStep
  (error: AiError.AiError, options?: { readonly delay?: Duration.Input }): FailureStep
} = Function.dual(
  (args) => AiError.isAiError(args[0]),
  (error: AiError.AiError, options: { readonly delay?: Duration.Input } = {}) => ({
    _tag: "Failure",
    error,
    ...options,
  }),
)

/** @experimental */
export const make: {
  (options?: MakeOptions): (script: ReadonlyArray<Step>) => Effect.Effect<Fixture>
  (script: ReadonlyArray<Step>, options?: MakeOptions): Effect.Effect<Fixture>
} = Function.dual(
  (args) => Array.isArray(args[0]),
  (script: ReadonlyArray<Step>, options: MakeOptions = {}) =>
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.make<State>({ cursor: 0, requests: [] })
      const service = yield* LanguageModel.make({
        generateText: (providerOptions) => executeGenerate(state, script, providerOptions),
        streamText: (providerOptions) =>
          Stream.unwrap(
            executeStream(state, script, providerOptions).pipe(
              Effect.map(({ parts, partDelay }) =>
                partDelay === undefined ? Stream.fromIterable(parts) : compile.paceParts(parts, partDelay),
              ),
            ),
          ),
      })
      const modelLayer = Layer.succeed(LanguageModel.LanguageModel, service)
      const selection: ModelRegistry.ModelSelection = {
        provider: options.provider ?? "test",
        model: options.model ?? "scripted",
        ...(options.registrationKey === undefined ? {} : { registrationKey: options.registrationKey }),
      }
      const registration = yield* ModelRegistry.registration({
        ...selection,
        layer: modelLayer,
        ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
      })
      const requests = SubscriptionRef.get(state).pipe(Effect.map((current) => current.requests))
      return {
        layer: modelLayer,
        selection,
        registration,
        registryLayer: ModelRegistry.layer([Effect.succeed(registration)]),
        requests,
        prompts: requests.pipe(Effect.map((items) => items.map((request) => request.prompt))),
        remaining: SubscriptionRef.get(state).pipe(
          Effect.map((current) => Math.max(0, script.length - current.cursor)),
        ),
        awaitRequests: (count: number) => {
          if (!Number.isSafeInteger(count) || count < 0) {
            return Effect.die(new TypeError("count must be a non-negative safe integer"))
          }
          return SubscriptionRef.changes(state).pipe(
            Stream.filter((current) => current.requests.length >= count),
            Stream.runHead,
            Effect.map(Option.match({ onNone: () => [], onSome: (current) => current.requests })),
          )
        },
      }
    }),
)

/** @experimental */
export const layer: {
  (options?: MakeOptions): (script: ReadonlyArray<Step>) => Layer.Layer<LanguageModel.LanguageModel>
  (script: ReadonlyArray<Step>, options?: MakeOptions): Layer.Layer<LanguageModel.LanguageModel>
} = Function.dual(
  (args) => Array.isArray(args[0]),
  (script: ReadonlyArray<Step>, options: MakeOptions = {}) =>
    Layer.unwrap(make(script, options).pipe(Effect.map((fixture) => fixture.layer))),
)

/** @experimental */
export const layerRegistry: {
  (
    governance?: ModelRegistry.GovernanceOptions,
  ): (fixtures: ReadonlyArray<Fixture>) => Layer.Layer<ModelRegistry.ModelRegistry>
  (
    fixtures: ReadonlyArray<Fixture>,
    governance?: ModelRegistry.GovernanceOptions,
  ): Layer.Layer<ModelRegistry.ModelRegistry>
} = Function.dual(
  (args) => Array.isArray(args[0]),
  (fixtures: ReadonlyArray<Fixture>, governance?: ModelRegistry.GovernanceOptions) =>
    ModelRegistry.layer(
      fixtures.map((fixture) => Effect.succeed(fixture.registration)),
      governance,
    ),
)
