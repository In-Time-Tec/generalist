import { Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool, type Toolkit } from "effect/unstable/ai"
import { CurrentModelCallOrdinal } from "../../core/durable/operation-context.js"
import { Exhausted } from "../../core/durable/run-budget.js"
import { adapt, type BroadTool, type BroadTools } from "../../core/model/service.js"
import { Operations, layerDirect, run } from "../../core/tools/nested-operation.js"
import { ToolContext, type Service } from "../../core/tools/tool-context.js"
import { markerKey } from "./offload.js"
import { exec, type Pool, prepare, type PreparedSandbox } from "./sandbox.js"

const ExecParameters = Schema.Struct({ code: Schema.String.check(Schema.isMaxLength(65_536)) })
const QueryParameters = Schema.Struct({ prompt: Schema.String })
const SubCallResult = Schema.Struct({ text: Schema.String, usage: Response.Usage })
const SubCallFailure = Schema.Union([AiError.AiError, Exhausted])

const execTool = Tool.make("exec", {
  description:
    "Run TypeScript in the RLM Sandbox. The original prompt is `prompt`; compacted history is `offloadedContext`.",
  parameters: ExecParameters,
  success: Schema.String,
  failure: AiError.AiError,
}).addDependency(ToolContext)
const queryTool = Tool.make("llm_query", {
  description: "Ask the leaf language model about one focused slice or question derived from the prompt.",
  parameters: QueryParameters,
  success: Schema.String,
  failure: SubCallFailure,
}).addDependency(ToolContext)

export interface Configuration {
  readonly root: LanguageModel.Service
  readonly leaf: LanguageModel.Service
  readonly maxDepth: number
  readonly maxSubCalls: number
  readonly pool: Pool
}

interface State extends Configuration {
  readonly subCalls: Ref.Ref<number>
}

interface LevelResult {
  readonly content: Array<Response.Part<RlmTools>>
  readonly usage: Response.Usage
}

type RlmTool = BroadTool | typeof execTool | typeof queryTool
interface RlmTools {
  readonly [name: string]: RlmTool
}

const aiFailure = (method: string, description: string): AiError.AiError =>
  AiError.make({
    module: "generalist/unstable/rlm",
    method,
    reason: AiError.InvalidRequestError.make({ description }),
  })

const sum = (left: number | undefined, right: number | undefined): number | undefined => {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left + right, Number.MAX_SAFE_INTEGER)
}

const addUsage = (left: Response.Usage, right: Response.Usage): Response.Usage =>
  Response.Usage.make({
    inputTokens: {
      uncached: sum(left.inputTokens.uncached, right.inputTokens.uncached),
      total: sum(left.inputTokens.total, right.inputTokens.total),
      cacheRead: sum(left.inputTokens.cacheRead, right.inputTokens.cacheRead),
      cacheWrite: sum(left.inputTokens.cacheWrite, right.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum(left.outputTokens.total, right.outputTokens.total),
      text: sum(left.outputTokens.text, right.outputTokens.text),
      reasoning: sum(left.outputTokens.reasoning, right.outputTokens.reasoning),
    },
  })

const emptyUsage = (): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  })

const toolRecord = (tools: ReadonlyArray<RlmTool>): RlmTools => {
  const record: Record<string, RlmTool> = {}
  for (const tool of tools) record[tool.name] = tool
  return record
}

const toolkit = (tools: ReadonlyArray<RlmTool>): Toolkit.WithHandler<RlmTools> => ({
  tools: toolRecord(tools),
  handle: () => Effect.die("RLM resolves internal tools and returns caller tools without handler dispatch"),
})

const instructions = (structured: boolean): string => {
  const final = structured
    ? "Your final response must be only the JSON object requested by the caller."
    : "Return the final answer directly when analysis is complete."
  return [
    "You are the root of a Recursive Language Model.",
    "Use `exec` to inspect and transform the full prompt through the `prompt` variable instead of asking to copy it into chat.",
    "Use `llm_query` for focused questions about selected context. You may call it repeatedly and recursively.",
    "Caller tools are for the final answer and are returned to the caller; do not mix them with `exec` or `llm_query` in one response.",
    final,
  ].join(" ")
}

const finalContent = (
  content: Array<Response.Part<RlmTools, true>>,
  usage: Response.Usage,
): Array<Response.Part<RlmTools>> => {
  let finished = false
  const result = content.map((part) => {
    if (part.type !== "finish") return part
    finished = true
    return Response.makePart("finish", { reason: part.reason, usage, response: part.response, metadata: part.metadata })
  })
  if (!finished) result.push(Response.makePart("finish", { reason: "unknown", usage, response: undefined }))
  return result
}

const appendResults = (
  prompt: Prompt.Prompt,
  response: LanguageModel.GenerateTextResponse<RlmTools, true>,
  results: ReadonlyArray<Response.ToolResultPart<string, string, never>>,
): Prompt.Prompt => Prompt.concat(prompt, Prompt.fromResponseParts([...response.toolCalls, ...results]))

const admitSubCall = (state: State): Effect.Effect<void, Exhausted> =>
  Ref.modify(state.subCalls, (used) => {
    if (used >= state.maxSubCalls) return [false, used] as const
    return [true, used + 1] as const
  }).pipe(
    Effect.flatMap((admitted) =>
      admitted ? Effect.void : Effect.fail(Exhausted.make({ budget: "toolCalls", requested: 1, remaining: 0 })),
    ),
  )

const responseText = (content: Array<Response.Part<RlmTools>>): string =>
  content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

const toBroadContent = (content: ReadonlyArray<Response.Part<RlmTools>>): Array<Response.Part<BroadTools>> =>
  content.map((part) => {
    if (part.type === "tool-call") {
      return Response.toolCallPart({
        id: part.id,
        name: part.name,
        params: part.params,
        providerExecuted: part.providerExecuted,
        metadata: part.metadata,
      })
    }
    if (part.type === "tool-result") {
      const fields = {
        id: part.id,
        name: part.name,
        result: part.result,
        encodedResult: part.encodedResult,
        providerExecuted: part.providerExecuted,
        preliminary: part.preliminary,
        metadata: part.metadata,
      }
      return part.isFailure
        ? Response.toolResultPart({ ...fields, isFailure: true })
        : Response.toolResultPart({ ...fields, isFailure: false })
    }
    return part
  })

const query = (
  state: State,
  depth: number,
  prompt: string,
): Effect.Effect<
  { readonly text: string; readonly usage: Response.Usage },
  AiError.AiError | Exhausted,
  Operations | ToolContext
> =>
  Effect.gen(function* () {
    yield* admitSubCall(state)
    return yield* run(
      {
        kind: "rlm.llm_query",
        payload: { depth, prompt },
        replayPolicy: "never",
        success: SubCallResult,
        failure: SubCallFailure,
      },
      runLevel(state, depth + 1, Prompt.make(prompt), [], false).pipe(
        Effect.map((result) => ({ text: responseText(result.content), usage: result.usage })),
      ),
    ).pipe(
      Effect.mapError((error) => {
        if (AiError.isAiError(error) || Schema.is(Exhausted)(error)) return error
        return aiFailure("llm_query", String(error))
      }),
    )
  })

const internalResults = (
  state: State,
  depth: number,
  prepared: PreparedSandbox,
  calls: ReadonlyArray<Response.ToolCallPart<string, unknown>>,
): Effect.Effect<
  { readonly results: Array<Response.ToolResultPart<string, string, never>>; readonly usage: Response.Usage },
  AiError.AiError | Exhausted,
  Operations | ToolContext
> =>
  Effect.gen(function* () {
    const results: Array<Response.ToolResultPart<string, string, never>> = []
    let usage = emptyUsage()
    for (const call of calls) {
      let value: string
      if (call.name === execTool.name) {
        const params = yield* Schema.decodeUnknownEffect(ExecParameters)(call.params).pipe(
          Effect.mapError((error) => aiFailure("exec", error.message)),
        )
        value = yield* exec({ pool: state.pool, prepared, code: params.code })
      } else {
        const params = yield* Schema.decodeUnknownEffect(QueryParameters)(call.params).pipe(
          Effect.mapError((error) => aiFailure("llm_query", error.message)),
        )
        const subCall = yield* query(state, depth, params.prompt)
        value = subCall.text
        usage = addUsage(usage, subCall.usage)
      }
      results.push(
        Response.toolResultPart({
          id: call.id,
          name: call.name,
          result: value,
          encodedResult: value,
          isFailure: false,
          providerExecuted: false,
          preliminary: false,
        }),
      )
    }
    return { results, usage }
  })

function runLevel(
  state: State,
  depth: number,
  original: Prompt.Prompt,
  callerTools: ReadonlyArray<BroadTool>,
  structured: boolean,
): Effect.Effect<LevelResult, AiError.AiError | Exhausted, Operations | ToolContext> {
  return Effect.gen(function* () {
    const prepared = yield* prepare({ pool: state.pool, prompt: original, key: markerKey(original) })
    const internal: ReadonlyArray<RlmTool> = depth < state.maxDepth ? [execTool, queryTool] : [execTool]
    const collisions = callerTools.filter((tool) => internal.some((candidate) => candidate.name === tool.name))
    if (collisions.length > 0) {
      return yield* aiFailure(
        "tools",
        `Caller tool names collide with RLM tools: ${collisions.map((tool) => tool.name).join(", ")}`,
      )
    }
    const available = [...callerTools, ...internal]
    const selected = depth === 0 ? state.root : state.leaf
    let prompt = Prompt.prependSystem(original, instructions(structured))
    let usage = emptyUsage()
    while (true) {
      const response = yield* selected.generateText({
        prompt,
        toolkit: toolkit(available),
        toolChoice: "auto",
        disableToolCallResolution: true,
      })
      usage = addUsage(usage, response.usage)
      const internalCalls = response.toolCalls.filter((call) => call.name === "exec" || call.name === "llm_query")
      const callerCalls = response.toolCalls.filter((call) => call.name !== "exec" && call.name !== "llm_query")
      if (internalCalls.length === 0) return { content: finalContent(response.content, usage), usage }
      if (callerCalls.length > 0) {
        return yield* aiFailure("tools", "A root response cannot mix RLM internal tools with caller tools")
      }
      const executed = yield* internalResults(state, depth, prepared, internalCalls)
      usage = addUsage(usage, executed.usage)
      prompt = appendResults(prompt, response, executed.results)
    }
  })
}

const resolveToolkit = <R>(
  input: LanguageModel.ToolkitOption<BroadTools, never, R> | undefined,
): Effect.Effect<Toolkit.WithHandler<BroadTools>, never, R> => {
  if (input === undefined) {
    return Effect.succeed({
      tools: {},
      handle: () => Effect.die("RLM returns caller tools without handler dispatch"),
    })
  }
  return Effect.isEffect(input) ? input : Effect.succeed(input)
}

const syntheticContext = (ordinal: number | undefined, invocation: number): Service => ({
  signal: new AbortController().signal,
  emit: () => Effect.succeed(true),
  sessionId: "rlm",
  operationKey: `rlm:model:${ordinal ?? invocation}`,
})

const withOperations = <A, E>(
  effect: Effect.Effect<A, E, Operations | ToolContext>,
  context: Service,
): Effect.Effect<A, E> =>
  Effect.serviceOption(Operations).pipe(
    Effect.flatMap((operations) => {
      const withContext = effect.pipe(Effect.provideService(ToolContext, context))
      if (Option.isSome(operations)) return withContext.pipe(Effect.provideService(Operations, operations.value))
      return Effect.scoped(
        Layer.build(layerDirect).pipe(Effect.flatMap((services) => withContext.pipe(Effect.provide(services)))),
      )
    }),
  )

const streamParts = (
  content: ReadonlyArray<Response.Part<BroadTools>>,
): ReadonlyArray<Response.StreamPart<BroadTools>> => {
  const parts: Array<Response.StreamPart<BroadTools>> = []
  for (const [index, part] of content.entries()) {
    if (part.type === "text") {
      const id = `rlm-text-${index}`
      parts.push(Response.makePart("text-start", { id }))
      parts.push(Response.makePart("text-delta", { id, delta: part.text }))
      parts.push(Response.makePart("text-end", { id }))
    } else if (part.type === "reasoning") {
      const id = `rlm-reasoning-${index}`
      parts.push(Response.makePart("reasoning-start", { id }))
      parts.push(Response.makePart("reasoning-delta", { id, delta: part.text }))
      parts.push(Response.makePart("reasoning-end", { id }))
    } else {
      parts.push(part)
    }
  }
  return parts
}

export const make = (configuration: Configuration): Effect.Effect<LanguageModel.Service> =>
  Effect.gen(function* () {
    const invocations = yield* Ref.make(0)
    const executeRlm = Effect.fnUntraced(function* (
      prompt: Prompt.Prompt,
      callerTools: ReadonlyArray<BroadTool>,
      structured: boolean,
    ) {
      const state: State = { ...configuration, subCalls: yield* Ref.make(0) }
      const ordinal = yield* CurrentModelCallOrdinal
      const invocation = yield* Ref.updateAndGet(invocations, (value) => value + 1)
      return yield* withOperations(
        runLevel(state, 0, prompt, callerTools, structured),
        syntheticContext(ordinal, invocation),
      )
    })
    return adapt(configuration.root, {
      generateText: (options) =>
        Effect.gen(function* () {
          const callerToolkit = yield* resolveToolkit<ToolContext>(options.toolkit)
          const result = yield* executeRlm(Prompt.make(options.prompt), Object.values(callerToolkit.tools), false)
          return new LanguageModel.GenerateTextResponse(toBroadContent(result.content))
        }),
      generateObject: (options) =>
        Effect.gen(function* () {
          const callerToolkit = yield* resolveToolkit<ToolContext>(options.toolkit)
          const result = yield* executeRlm(Prompt.make(options.prompt), Object.values(callerToolkit.tools), true)
          const content = toBroadContent(result.content)
          const response = new LanguageModel.GenerateTextResponse(content)
          const value = yield* Schema.decodeEffect(Schema.fromJsonString(options.schema))(response.text).pipe(
            Effect.mapError((error) =>
              AiError.make({
                module: "generalist/unstable/rlm",
                method: "generateObject",
                reason: AiError.InvalidOutputError.fromSchemaError(error),
              }),
            ),
          )
          return new LanguageModel.GenerateObjectResponse(value, content)
        }),
      streamText: (options) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const callerToolkit = yield* resolveToolkit(options.toolkit)
            const result = yield* executeRlm(Prompt.make(options.prompt), Object.values(callerToolkit.tools), false)
            return Stream.fromIterable(streamParts(toBroadContent(result.content)))
          }),
        ),
    })
  })
