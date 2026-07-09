import { Duration, Effect, Layer, Option, Stream, SubscriptionRef } from "effect"
import { AiError, LanguageModel, ModelRegistry, Prompt, Response, Tool } from "@batonfx/core"

/** @experimental */
export interface TextPart {
  readonly _tag: "Text"
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
export type Part = TextPart | ToolCallPart

/** @experimental */
export interface StepOptions {
  readonly finishReason?: Response.FinishReason
  readonly usage?: Response.Usage
  readonly delay?: Duration.Input
}

/** @experimental */
export interface TurnStep extends StepOptions {
  readonly _tag: "Turn"
  readonly parts: ReadonlyArray<Part>
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
export type Step = Part | TurnStep | ObjectStep | FailureStep

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
  readonly registryLayer: Layer.Layer<ModelRegistry.Service>
  readonly requests: Effect.Effect<ReadonlyArray<Request>>
  readonly prompts: Effect.Effect<ReadonlyArray<Prompt.Prompt>>
  readonly remaining: Effect.Effect<number>
  readonly awaitRequests: (count: number) => Effect.Effect<ReadonlyArray<Request>>
}

interface State {
  readonly cursor: number
  readonly requests: ReadonlyArray<Request>
}

interface Claimed {
  readonly step: TurnStep | ObjectStep | FailureStep | undefined
  readonly request: Request
}

const emptyUsage = (): Response.Usage =>
  new Response.Usage({
    inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  })

const invalidRequest = (method: Operation, description: string): AiError.AiError =>
  AiError.make({
    module: "@batonfx/test/TestModel",
    method,
    reason: new AiError.InvalidRequestError({ description }),
  })

const normalizeStep = (step: Step): TurnStep | ObjectStep | FailureStep =>
  step._tag === "Text" || step._tag === "ToolCall" ? { _tag: "Turn", parts: [step] } : step

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

const finishReason = (step: TurnStep): Response.FinishReason =>
  step.finishReason ?? (step.parts.some((part) => part._tag === "ToolCall") ? "tool-calls" : "stop")

const finish = (reason: Response.FinishReason, usage: Response.Usage): Response.FinishPartEncoded => ({
  type: "finish",
  reason,
  usage,
  response: undefined,
})

const compileToolCall = (
  part: ToolCallPart,
  requestIndex: number,
  partIndex: number,
): Response.ToolCallPartEncoded => ({
  type: "tool-call",
  id: part.id ?? `test-call-${requestIndex}-${partIndex}`,
  name: part.name,
  params: part.params,
  providerExecuted: part.providerExecuted,
})

const compileGenerate = (step: TurnStep, requestIndex: number): Array<Response.PartEncoded> => [
  ...step.parts.map(
    (part, partIndex): Response.PartEncoded =>
      part._tag === "Text" ? { type: "text", text: part.text } : compileToolCall(part, requestIndex, partIndex),
  ),
  finish(finishReason(step), step.usage ?? emptyUsage()),
]

const compileStream = (step: TurnStep, requestIndex: number): Array<Response.StreamPartEncoded> => {
  const output: Array<Response.StreamPartEncoded> = []
  for (let partIndex = 0; partIndex < step.parts.length; partIndex += 1) {
    const part = step.parts[partIndex] as Part
    if (part._tag === "ToolCall") {
      output.push(compileToolCall(part, requestIndex, partIndex))
      continue
    }
    const id = `test-text-${requestIndex}-${partIndex}`
    output.push({ type: "text-start", id })
    output.push({ type: "text-delta", id, delta: part.text })
    output.push({ type: "text-end", id })
  }
  output.push(finish(finishReason(step), step.usage ?? emptyUsage()))
  return output
}

const applyDelay = (step: TurnStep | ObjectStep | FailureStep): Effect.Effect<void> =>
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
      return yield* Effect.fail(invalidRequest(claimed.request.operation, "TestModel script exhausted"))
    }
    yield* applyDelay(step)
    if (step._tag === "Failure") return yield* Effect.fail(step.error)
    if (step._tag === "Object") {
      if (options.responseFormat.type !== "json") {
        return yield* Effect.fail(invalidRequest(claimed.request.operation, "Object step requires generateObject"))
      }
      const encoded = yield* Effect.try({
        try: () => JSON.stringify(step.value),
        catch: () => invalidRequest(claimed.request.operation, "Object step is not JSON serializable"),
      })
      if (encoded === undefined) {
        return yield* Effect.fail(invalidRequest(claimed.request.operation, "Object step is not JSON serializable"))
      }
      return [{ type: "text", text: encoded }, finish(step.finishReason ?? "stop", step.usage ?? emptyUsage())]
    }
    if (options.responseFormat.type === "json") {
      return yield* Effect.fail(invalidRequest(claimed.request.operation, "generateObject requires an Object step"))
    }
    return compileGenerate(step, claimed.request.index)
  })

const executeStream = (
  state: SubscriptionRef.SubscriptionRef<State>,
  script: ReadonlyArray<Step>,
  options: LanguageModel.ProviderOptions,
): Effect.Effect<Array<Response.StreamPartEncoded>, AiError.AiError> =>
  Effect.gen(function* () {
    const claimed = yield* claim(state, script, "streamText", options)
    const step = claimed.step
    if (step === undefined) {
      return yield* Effect.fail(invalidRequest(claimed.request.operation, "TestModel script exhausted"))
    }
    yield* applyDelay(step)
    if (step._tag === "Failure") return yield* Effect.fail(step.error)
    if (step._tag === "Object") {
      return yield* Effect.fail(invalidRequest(claimed.request.operation, "Object step requires generateObject"))
    }
    return compileStream(step, claimed.request.index)
  })

/** @experimental */
export const text = (value: string): TextPart => ({ _tag: "Text", text: value })

/** @experimental */
export const toolCall = (name: string, params: unknown, options: ToolCallOptions = {}): ToolCallPart => ({
  _tag: "ToolCall",
  name,
  params,
  ...(options.id === undefined ? {} : { id: options.id }),
  providerExecuted: options.providerExecuted ?? false,
})

/** @experimental */
export const turn = (parts: ReadonlyArray<Part>, options: StepOptions = {}): TurnStep => ({
  _tag: "Turn",
  parts,
  ...options,
})

/** @experimental */
export const object = (value: unknown, options: StepOptions = {}): ObjectStep => ({
  _tag: "Object",
  value,
  ...options,
})

/** @experimental */
export const failure = (error: AiError.AiError, options: { readonly delay?: Duration.Input } = {}): FailureStep => ({
  _tag: "Failure",
  error,
  ...options,
})

/** @experimental */
export const make = (script: ReadonlyArray<Step>, options: MakeOptions = {}): Effect.Effect<Fixture> =>
  Effect.gen(function* () {
    const state = yield* SubscriptionRef.make<State>({ cursor: 0, requests: [] })
    const service = yield* LanguageModel.make({
      generateText: (providerOptions) => executeGenerate(state, script, providerOptions),
      streamText: (providerOptions) =>
        Stream.unwrap(
          executeStream(state, script, providerOptions).pipe(Effect.map((parts) => Stream.fromIterable(parts))),
        ),
    })
    const modelLayer = Layer.succeed(LanguageModel.LanguageModel, service)
    const selection: ModelRegistry.ModelSelection = {
      provider: options.provider ?? "test",
      model: options.model ?? "scripted",
      ...(options.registrationKey === undefined ? {} : { registrationKey: options.registrationKey }),
    }
    const registration = yield* ModelRegistry.registrationFromLayer({
      ...selection,
      layer: modelLayer,
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    })
    const requests = SubscriptionRef.get(state).pipe(Effect.map((current) => current.requests))
    return {
      layer: modelLayer,
      selection,
      registration,
      registryLayer: ModelRegistry.memoryLayer([registration]),
      requests,
      prompts: requests.pipe(Effect.map((items) => items.map((request) => request.prompt))),
      remaining: SubscriptionRef.get(state).pipe(Effect.map((current) => Math.max(0, script.length - current.cursor))),
      awaitRequests: (count) => {
        if (!Number.isSafeInteger(count) || count < 0) return Effect.die("count must be a non-negative safe integer")
        return SubscriptionRef.changes(state).pipe(
          Stream.filter((current) => current.requests.length >= count),
          Stream.runHead,
          Effect.map(Option.match({ onNone: () => [], onSome: (current) => current.requests })),
        )
      },
    }
  })

/** @experimental */
export const layer = (
  script: ReadonlyArray<Step>,
  options: MakeOptions = {},
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.unwrap(make(script, options).pipe(Effect.map((fixture) => fixture.layer)))

/** @experimental */
export const registryLayer = (
  fixtures: ReadonlyArray<Fixture>,
  governance?: ModelRegistry.GovernanceOptions,
): Layer.Layer<ModelRegistry.Service> =>
  ModelRegistry.memoryLayer(
    fixtures.map((fixture) => fixture.registration),
    governance,
  )
