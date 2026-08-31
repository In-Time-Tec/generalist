import { Effect, Function, Layer, Option, Schema } from "effect"
import { LanguageModel, Prompt, Toolkit } from "effect/unstable/ai"
import { ContextRevision } from "./compaction-context-revision.js"
import { safeCutIndex } from "./compaction-cut.js"
import { summaryLanguageModel, withCompactionLifecycle } from "./compaction-telemetry.js"
import { make as makeThresholdState } from "./compaction-threshold-state.js"
import { estimatePromptTokens } from "./prompt-token-estimate.js"
import { type Entry, buildContext } from "../context/session.js"
import { make as makeSummaryModelProvider } from "../model/result/summary-model.js"
import type { Success } from "../tools/tool-executor.js"
import { bound } from "../tools/tool-output.js"
import {
  Compaction,
  CompactionError,
  microcompactResult,
  type Plan,
  type Request,
  Result,
  type Service,
  type Usage,
} from "./compaction-service.js"

export { Compaction, CompactionError, Result, withLifecycle } from "./compaction-service.js"
export type { MicrocompactResult, Plan, Request, Service, SummarizeResult, Usage } from "./compaction-service.js"
export { layerTruncate, layerTruncateEstimated } from "./compaction-truncate.js"

/** @experimental Default headroom kept for the next model response. */
export const defaultReserveTokens = 16_384
/** @experimental Default recent-session suffix target kept verbatim. */
export const defaultKeepRecentTokens = 20_000
/** @experimental Fixed prompt used for dedicated summary calls. */
export const summaryTemplate = `Summarize the conversation so another agent can continue seamlessly.

Use Markdown with these sections:

## Goal
## Constraints
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context

Do not mention that context was compacted.`

/** @experimental Structured checkpoint schema used by structuredSummary. */
export const AgentSummary = Schema.Struct({
  goal: Schema.String,
  facts: Schema.Array(Schema.String),
  decisions: Schema.Array(Schema.String),
  openQuestions: Schema.Array(Schema.String),
  toolFindings: Schema.Array(Schema.String),
})

/** @experimental */
export type AgentSummary = typeof AgentSummary.Type

/** @experimental Compaction strategy: decide, cut, summarize. */
export interface Strategy {
  readonly shouldCompact: (usage: Usage) => boolean
  readonly cut: (entries: ReadonlyArray<Entry>, keepRecentTokens: number) => Option.Option<Plan>
  readonly summarize: (
    plan: Plan,
    request: Request,
  ) => Effect.Effect<string, CompactionError, LanguageModel.LanguageModel>
  readonly toolOutputMaxBytes?: number
  readonly keepRecentTokens?: number
}

/** @experimental One independently composable compaction capability. */
export interface StrategyPart {
  readonly shouldCompact?: Strategy["shouldCompact"]
  readonly cut?: Strategy["cut"]
  readonly summarize?: Strategy["summarize"]
  readonly toolOutputMaxBytes?: number
  readonly keepRecentTokens?: number
}

/** @experimental Options for the default compaction implementation. */
export interface DefaultOptions {
  readonly reserveTokens?: number
  readonly keepRecentTokens?: number
  readonly contextWindow?: number
  readonly summaryModel?: Layer.Layer<LanguageModel.LanguageModel>
  readonly summaryPrompt?: string
}

/** @experimental Options accepted by the Compaction layer. */
export interface LayerOptions extends DefaultOptions {
  readonly strategy?: Strategy
}

/** @experimental Options for lossless tool-output bounding. */
export interface OutputBoundOptions {
  readonly maxBytes: number
}

/** @experimental Options for token-denominated recent retention. */
export interface KeepRecentOptions {
  readonly tokens: number
}

/** @experimental Options for schema-validated structured summaries. */
export interface StructuredSummaryOptions {
  readonly objectName?: string
  readonly summaryModel?: Layer.Layer<LanguageModel.LanguageModel>
  readonly summaryPrompt?: string
}

const serialized = (value: Prompt.Prompt["content"]): string => {
  const json = JSON.stringify(value)
  return json ?? ""
}

const safeNonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`)
  return value
}

const markdownList = (items: ReadonlyArray<string>): string =>
  items.length === 0 ? "- None" : items.map((item) => `- ${item}`).join("\n")

const renderAgentSummary = (summary: AgentSummary): string =>
  [
    `## Goal\n${summary.goal}`,
    `## Facts\n${markdownList(summary.facts)}`,
    `## Decisions\n${markdownList(summary.decisions)}`,
    `## Open Questions\n${markdownList(summary.openQuestions)}`,
    `## Tool Findings\n${markdownList(summary.toolFindings)}`,
  ].join("\n\n")

const fits = (history: Prompt.Prompt, prompt: Prompt.Prompt, usage: Usage): boolean =>
  Number.isFinite(usage.contextWindow) &&
  estimatePromptTokens(Prompt.concat(history, prompt)) <= usage.contextWindow - usage.reserveTokens

const isPromptToolResult = (part: Prompt.Part): part is Prompt.ToolResultPart => part.type === "tool-result"

const compactToolPart = (
  part: Prompt.ToolResultPart,
  maxBytes: number,
): Effect.Effect<readonly [Prompt.ToolResultPart, boolean], CompactionError> =>
  Effect.gen(function* () {
    if (part.isFailure) return [part, false] as const
    const success: Success = { _tag: "Success", result: part.result, encodedResult: part.result }
    const bounded = yield* bound(success, { toolCallId: part.id, maxBytes })
    if (bounded.encodedResult === success.encodedResult) return [part, false] as const
    return [
      Prompt.makePart("tool-result", {
        id: part.id,
        name: part.name,
        isFailure: false,
        result: bounded.encodedResult,
        providerExecuted: false,
      }),
      true,
    ] as const
  })

const microcompactPrompt = (
  prompt: Prompt.Prompt,
  maxBytes: number,
): Effect.Effect<readonly [Prompt.Prompt, boolean], CompactionError> =>
  Effect.gen(function* () {
    let changed = false
    const messages: Array<Prompt.Message> = []
    for (const message of prompt.content) {
      if (Schema.is(Schema.String)(message.content)) {
        messages.push(message)
      } else {
        let messageChanged = false
        const content: Array<Prompt.Part> = []
        for (const part of message.content) {
          if (!isPromptToolResult(part)) {
            content.push(part)
          } else {
            const [compacted, didCompact] = yield* compactToolPart(part, maxBytes)
            changed = changed || didCompact
            messageChanged = messageChanged || didCompact
            content.push(compacted)
          }
        }
        if (messageChanged) {
          const encoded = yield* Schema.encodeEffect(Prompt.Message)(message).pipe(
            Effect.mapError((cause) => CompactionError.make({ message: String(cause), cause })),
          )
          const rebuilt = yield* Schema.decodeEffect(Prompt.Message)(Object.assign(encoded, { content })).pipe(
            Effect.mapError((cause) => CompactionError.make({ message: String(cause), cause })),
          )
          messages.push(rebuilt)
        } else {
          messages.push(message)
        }
      }
    }
    return [changed ? Prompt.fromMessages(messages) : prompt, changed] as const
  })

const checkpointMessage = (summary: string): Prompt.Message =>
  Prompt.makeMessage("user", {
    content: [Prompt.makePart("text", { text: `<conversation-checkpoint>\n${summary}\n</conversation-checkpoint>` })],
  })

const summaryPrompt = (template: string, prompt: Prompt.Prompt): Prompt.Prompt =>
  Prompt.make(`${template}\n\nConversation to summarize:\n${serialized(prompt.content)}`)

const systemMessages = (entries: ReadonlyArray<Entry>): ReadonlyArray<Prompt.Message> =>
  entries.flatMap((entry) => (entry._tag === "Message" && entry.message.role === "system" ? [entry.message] : []))

const compactedHistory = (summary: string, head: ReadonlyArray<Entry>, recent: Prompt.Prompt): Prompt.Prompt =>
  Prompt.concat(Prompt.fromMessages([...systemMessages(head), checkpointMessage(summary)]), recent)

const normalizeUsage = (usage: Usage, options: DefaultOptions): Usage => ({
  contextTokens: Number.isFinite(usage.contextTokens) ? usage.contextTokens : 0,
  contextWindow: Number.isFinite(usage.contextWindow)
    ? usage.contextWindow
    : (options.contextWindow ?? Number.POSITIVE_INFINITY),
  reserveTokens:
    options.reserveTokens ?? (Number.isFinite(usage.reserveTokens) ? usage.reserveTokens : defaultReserveTokens),
})

/** @experimental The default two-stage compaction strategy. */
export const defaultStrategy = (options: DefaultOptions = {}): Strategy => {
  const provideSummaryModel =
    options.summaryModel === undefined ? undefined : makeSummaryModelProvider(options.summaryModel)
  return {
    shouldCompact: (usage) =>
      Number.isFinite(usage.contextWindow) && usage.contextTokens > usage.contextWindow - usage.reserveTokens,
    cut: (entries, keepRecentTokens) => {
      const index = safeCutIndex(entries, keepRecentTokens)
      if (index <= 0 || index >= entries.length) return Option.none()
      const recent = entries.slice(index)
      const first = recent[0]
      return first === undefined ? Option.none() : Option.some({ head: entries.slice(0, index), recent })
    },
    summarize: (plan, request) => {
      const effect = Effect.gen(function* () {
        const head = buildContext(plan.head)
        const [compactedHead] =
          request.toolOutputMaxBytes === undefined
            ? ([head, false] as const)
            : yield* microcompactPrompt(head, request.toolOutputMaxBytes)
        const prompt = summaryPrompt(options.summaryPrompt ?? summaryTemplate, compactedHead)
        const model = yield* summaryLanguageModel
        return yield* model.generateText({ prompt, toolkit: Toolkit.empty, toolChoice: "none" }).pipe(
          Effect.map((response) => response.text),
          Effect.mapError((error) => CompactionError.make({ message: String(error), cause: error })),
        )
      })
      return provideSummaryModel === undefined ? effect : provideSummaryModel(effect)
    },
  }
}

/** @experimental Compile ordered strategy parts onto a complete strategy. */
export const strategy: {
  (base?: Strategy): (parts: ReadonlyArray<StrategyPart>) => Strategy
  (parts: ReadonlyArray<StrategyPart>, base?: Strategy): Strategy
} = Function.dual(
  (args) => args.length !== 1 || Array.isArray(args[0]),
  (parts: ReadonlyArray<StrategyPart>, base: Strategy = defaultStrategy()): Strategy =>
    parts.reduce<Strategy>((current, part) => {
      const required = {
        shouldCompact: part.shouldCompact ?? current.shouldCompact,
        cut: part.cut ?? current.cut,
        summarize: part.summarize ?? current.summarize,
      }
      const toolOutputMaxBytes = part.toolOutputMaxBytes ?? current.toolOutputMaxBytes
      const keepRecentTokens = part.keepRecentTokens ?? current.keepRecentTokens
      const withOutput = toolOutputMaxBytes === undefined ? required : { ...required, toolOutputMaxBytes }
      return keepRecentTokens === undefined ? withOutput : { ...withOutput, keepRecentTokens }
    }, base),
)

/** @experimental Configure lossless successful-tool-result bounding. */
export const toolOutputBound = (options: OutputBoundOptions): StrategyPart => ({
  toolOutputMaxBytes: safeNonNegativeInteger("OutputBoundOptions.maxBytes", options.maxBytes),
})

/** @experimental Configure the token target retained verbatim after a summary cut. */
export const keepRecent = (options: KeepRecentOptions): StrategyPart => ({
  keepRecentTokens: safeNonNegativeInteger("KeepRecentOptions.tokens", options.tokens),
})

/** @experimental Summarize through Effect AI structured output and render a string checkpoint. */
export const structuredSummary = (options: StructuredSummaryOptions = {}): StrategyPart => {
  const provideSummaryModel =
    options.summaryModel === undefined ? undefined : makeSummaryModelProvider(options.summaryModel)
  return {
    summarize: (plan, request) => {
      const effect = Effect.gen(function* () {
        const head = buildContext(plan.head)
        const [compactedHead] =
          request.toolOutputMaxBytes === undefined
            ? ([head, false] as const)
            : yield* microcompactPrompt(head, request.toolOutputMaxBytes)
        const prompt = summaryPrompt(options.summaryPrompt ?? summaryTemplate, compactedHead)
        const model = yield* summaryLanguageModel
        return yield* model
          .generateObject({
            prompt,
            schema: AgentSummary,
            objectName: options.objectName ?? "AgentSummary",
            toolChoice: "none",
          })
          .pipe(
            Effect.map((response) => renderAgentSummary(response.value)),
            Effect.mapError((error) => CompactionError.make({ message: String(error), cause: error })),
          )
      })
      return provideSummaryModel === undefined ? effect : provideSummaryModel(effect)
    },
  }
}

/** @experimental Build a compaction service from a strategy. */
export const make: {
  (options?: DefaultOptions): (compactionStrategy: Strategy) => Service
  (compactionStrategy: Strategy, options?: DefaultOptions): Service
} = Function.dual(
  (args) => args.length !== 1 || "shouldCompact" in args[0],
  (compactionStrategy: Strategy, options: DefaultOptions = {}): Service => {
    const thresholds = makeThresholdState()
    const thresholdId = (input: Request) => input.runId ?? input.sessionId
    return {
      willCompact: ({ usage, overflow }) =>
        overflow || compactionStrategy.shouldCompact(normalizeUsage(usage, options)),
      maybeCompact: (input) =>
        Effect.suspend(() => {
          const usage = normalizeUsage(input.usage, options)
          const shouldCompact = input.overflow || compactionStrategy.shouldCompact(usage)
          if (!shouldCompact) {
            thresholds.clear(thresholdId(input))
            return Effect.succeed(Option.none<Result>())
          }
          const revision = ContextRevision.make(
            input.path?.at(-1)?.id ?? null,
            input.history.content,
            input.prompt.content,
          )
          if (revision !== undefined && !input.overflow && thresholds.isUnchanged(thresholdId(input), usage, revision))
            return Effect.succeed(Option.none())
          const pass = withCompactionLifecycle(compact(compactionStrategy, input, usage, options), input, usage)
          if (input.overflow) return pass.pipe(Effect.ensuring(Effect.sync(() => thresholds.clear(thresholdId(input)))))
          return pass.pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                if (revision !== undefined && Option.isNone(result))
                  thresholds.recordUnchanged(thresholdId(input), usage, revision)
                else thresholds.clear(thresholdId(input))
              }),
            ),
          )
        }),
    }
  },
)

const compact = (
  compactionStrategy: Strategy,
  input: Request,
  usage: Usage,
  options: DefaultOptions,
): Effect.Effect<Option.Option<Result>, CompactionError, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    let history = input.history
    let prompt = input.prompt
    let changed = false
    const toolOutputMaxBytes = input.toolOutputMaxBytes ?? compactionStrategy.toolOutputMaxBytes

    if (toolOutputMaxBytes !== undefined) {
      const [compactedHistoryPrompt, historyChanged] = yield* microcompactPrompt(history, toolOutputMaxBytes)
      const [compactedPrompt, promptChanged] = yield* microcompactPrompt(prompt, toolOutputMaxBytes)
      history = compactedHistoryPrompt
      prompt = compactedPrompt
      changed = historyChanged || promptChanged
      if (changed && fits(history, prompt, usage)) return Option.some(microcompactResult({ history, prompt }))
    }

    const plan = compactionStrategy.cut(
      input.path ?? [],
      compactionStrategy.keepRecentTokens ?? options.keepRecentTokens ?? defaultKeepRecentTokens,
    )
    if (Option.isNone(plan))
      return changed ? Option.some(microcompactResult({ history, prompt })) : Option.none<Result>()

    const summaryRequest: Request = {
      ...input,
      history,
      prompt,
      usage,
    }
    const summary = yield* compactionStrategy.summarize(
      plan.value,
      toolOutputMaxBytes === undefined ? summaryRequest : { ...summaryRequest, toolOutputMaxBytes },
    )
    const recent = buildContext(plan.value.recent)
    const [compactedRecent] =
      toolOutputMaxBytes === undefined
        ? ([recent, false] as const)
        : yield* microcompactPrompt(recent, toolOutputMaxBytes)
    return Option.some<Result>({
      _tag: "Summarize",
      history: compactedHistory(summary, plan.value.head, compactedRecent),
      prompt,
      summary,
    })
  })

/** @experimental Layer wiring the default or provided strategy. */
export const layer: {
  (providedStrategy?: Strategy): (options?: LayerOptions) => Layer.Layer<Compaction>
  (options?: LayerOptions, providedStrategy?: Strategy): Layer.Layer<Compaction>
} = Function.dual(
  (args) => args.length !== 1 || !("shouldCompact" in args[0]),
  (
    options: LayerOptions = {},
    providedStrategy: Strategy = options.strategy ?? defaultStrategy(options),
  ): Layer.Layer<Compaction> => Layer.succeed(Compaction, Compaction.of(make(providedStrategy, options))),
)

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<Compaction> =>
  Layer.succeed(Compaction, Compaction.of(implementation))
