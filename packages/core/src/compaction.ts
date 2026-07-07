import { Context, Effect, Layer, Option, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import * as Session from "./session"
import * as ToolExecutor from "./tool-executor"
import * as ToolOutput from "./tool-output"

/** @experimental Default headroom kept for the next model response. */
export const DEFAULT_RESERVE_TOKENS = 16_384

/** @experimental Default recent-session suffix target kept verbatim. */
export const DEFAULT_KEEP_RECENT_TOKENS = 20_000

/** @experimental Fixed prompt used for dedicated summary calls. */
export const SUMMARY_TEMPLATE = `Summarize the conversation so another agent can continue seamlessly.

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

/** @experimental Token accounting for a compaction decision. */
export interface Usage {
  readonly contextTokens: number
  readonly contextWindow: number
  readonly reserveTokens: number
}

/** @experimental What to keep verbatim and what the summary replaces. */
export interface Plan {
  readonly firstKeptEntryId: Session.EntryId
  readonly head: ReadonlyArray<Session.Entry>
  readonly recent: ReadonlyArray<Session.Entry>
}

/** @experimental Request passed to a compaction implementation. */
export interface Request {
  readonly agentName: string
  readonly sessionId: string
  readonly turn: number
  readonly history: Ai.Prompt.Prompt
  readonly prompt: Ai.Prompt.Prompt
  readonly path?: ReadonlyArray<Session.Entry>
  readonly usage: Usage
  readonly overflow: boolean
  readonly toolOutputMaxBytes?: number
}

/** @experimental Result from tool-output microcompaction. */
export interface MicrocompactResult {
  readonly _tag: "Microcompact"
  readonly history: Ai.Prompt.Prompt
  readonly prompt: Ai.Prompt.Prompt
}

/** @experimental Result from summary checkpointing. */
export interface SummarizeResult {
  readonly _tag: "Summarize"
  readonly history: Ai.Prompt.Prompt
  readonly prompt: Ai.Prompt.Prompt
  readonly summary: string
  readonly firstKeptEntryId: Session.EntryId
}

/** @experimental Compaction result applied by the agent loop. */
export type Result = MicrocompactResult | SummarizeResult

/** @experimental Compaction strategy: decide, cut, summarize. */
export interface Strategy {
  readonly shouldCompact: (usage: Usage) => boolean
  readonly cut: (entries: ReadonlyArray<Session.Entry>, keepRecentTokens: number) => Option.Option<Plan>
  readonly summarize: (
    plan: Plan,
    request: Request,
  ) => Effect.Effect<string, CompactionError, Ai.LanguageModel.LanguageModel>
}

/** @experimental Compaction service boundary consulted by the loop. */
export interface Interface {
  readonly maybeCompact: (
    request: Request,
  ) => Effect.Effect<Option.Option<Result>, CompactionError, Ai.LanguageModel.LanguageModel>
}

/** @experimental Compaction service failure. */
export class CompactionError extends Schema.TaggedErrorClass<CompactionError>()("@batonfx/core/CompactionError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental */
export class Compaction extends Context.Service<Compaction, Interface>()("@batonfx/core/Compaction") {}

/** @experimental Options for the default compaction implementation. */
export interface DefaultOptions {
  readonly reserveTokens?: number
  readonly keepRecentTokens?: number
  readonly contextWindow?: number
  readonly summaryModel?: Layer.Layer<Ai.LanguageModel.LanguageModel>
  readonly summaryPrompt?: string
}

const serialized = (value: unknown): string => {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

const APPROX_CHARS_PER_TOKEN = 4

const estimateTokens = (text: string): number => Math.ceil(text.length / APPROX_CHARS_PER_TOKEN)

const estimateEntryTokens = (entry: Session.Entry): number => estimateTokens(serialized(entry))

const estimatePromptTokens = (prompt: Ai.Prompt.Prompt): number => estimateTokens(serialized(prompt.content))

const fits = (history: Ai.Prompt.Prompt, prompt: Ai.Prompt.Prompt, usage: Usage): boolean =>
  Number.isFinite(usage.contextWindow) &&
  estimatePromptTokens(Ai.Prompt.concat(history, prompt)) <= usage.contextWindow - usage.reserveTokens

const isPromptToolResult = (part: Ai.Prompt.Part): part is Ai.Prompt.ToolResultPart => part.type === "tool-result"

const messageHasToolCall = (message: Ai.Prompt.Message): boolean =>
  typeof message.content !== "string" && message.content.some((part) => part.type === "tool-call")

const isToolMessage = (entry: Session.Entry | undefined): boolean =>
  entry?._tag === "Message" && entry.message.role === "tool"

const isAssistantToolCallEntry = (entry: Session.Entry | undefined): boolean =>
  entry?._tag === "Message" && entry.message.role === "assistant" && messageHasToolCall(entry.message)

const compactToolPart = (
  part: Ai.Prompt.ToolResultPart,
  maxBytes: number,
): Effect.Effect<readonly [Ai.Prompt.ToolResultPart, boolean], CompactionError> =>
  Effect.gen(function* () {
    if (part.isFailure) return [part, false] as const
    const success: ToolExecutor.Success = { _tag: "Success", result: part.result, encodedResult: part.result }
    const bounded = yield* ToolOutput.bound(success, { toolCallId: part.id, maxBytes }).pipe(
      Effect.mapError((error) => new CompactionError({ message: error.message, cause: error })),
    )
    if (bounded === success) return [part, false] as const
    return [
      Ai.Prompt.makePart("tool-result", {
        id: part.id,
        name: part.name,
        isFailure: false,
        result: bounded.encodedResult,
      }),
      true,
    ] as const
  })

const microcompactPrompt = (
  prompt: Ai.Prompt.Prompt,
  maxBytes: number,
): Effect.Effect<readonly [Ai.Prompt.Prompt, boolean], CompactionError> =>
  Effect.gen(function* () {
    let changed = false
    const messages: Array<Ai.Prompt.Message> = []
    for (const message of prompt.content) {
      if (typeof message.content === "string") {
        messages.push(message)
      } else {
        let messageChanged = false
        const content: Array<Ai.Prompt.Part> = []
        for (const part of message.content as ReadonlyArray<Ai.Prompt.Part>) {
          if (!isPromptToolResult(part)) {
            content.push(part)
          } else {
            const [compacted, didCompact] = yield* compactToolPart(part, maxBytes)
            changed = changed || didCompact
            messageChanged = messageChanged || didCompact
            content.push(compacted)
          }
        }
        messages.push(messageChanged ? ({ ...message, content } as Ai.Prompt.Message) : message)
      }
    }
    return [changed ? Ai.Prompt.fromMessages(messages) : prompt, changed] as const
  })

const checkpointMessage = (summary: string): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("user", {
    content: [
      Ai.Prompt.makePart("text", { text: `<conversation-checkpoint>\n${summary}\n</conversation-checkpoint>` }),
    ],
  })

const summaryPrompt = (template: string, prompt: Ai.Prompt.Prompt): Ai.Prompt.Prompt =>
  Ai.Prompt.make(`${template}\n\nConversation to summarize:\n${serialized(prompt.content)}`)

const systemMessages = (entries: ReadonlyArray<Session.Entry>): ReadonlyArray<Ai.Prompt.Message> =>
  entries.flatMap((entry) => (entry._tag === "Message" && entry.message.role === "system" ? [entry.message] : []))

const compactedHistory = (
  summary: string,
  head: ReadonlyArray<Session.Entry>,
  recent: ReadonlyArray<Session.Entry>,
): Ai.Prompt.Prompt =>
  Ai.Prompt.concat(
    Ai.Prompt.fromMessages([...systemMessages(head), checkpointMessage(summary)]),
    Session.buildContext(recent),
  )

const normalizeUsage = (usage: Usage, options: DefaultOptions): Usage => ({
  contextTokens: Number.isFinite(usage.contextTokens) ? usage.contextTokens : 0,
  contextWindow: Number.isFinite(usage.contextWindow)
    ? usage.contextWindow
    : (options.contextWindow ?? Number.POSITIVE_INFINITY),
  reserveTokens:
    options.reserveTokens ?? (Number.isFinite(usage.reserveTokens) ? usage.reserveTokens : DEFAULT_RESERVE_TOKENS),
})

const makeMicrocompact = (history: Ai.Prompt.Prompt, prompt: Ai.Prompt.Prompt): MicrocompactResult => ({
  _tag: "Microcompact",
  history,
  prompt,
})

const safeCutIndex = (entries: ReadonlyArray<Session.Entry>, keepRecentTokens: number): number => {
  let total = 0
  let index = entries.length
  while (index > 0 && total < keepRecentTokens) {
    index -= 1
    total += estimateEntryTokens(entries[index] as Session.Entry)
  }
  while (index > 0 && (isToolMessage(entries[index]) || isAssistantToolCallEntry(entries[index - 1]))) {
    index -= 1
  }
  return index
}

/** @experimental The default two-stage compaction strategy. */
export const defaultStrategy = (options: DefaultOptions = {}): Strategy => ({
  shouldCompact: (usage) =>
    Number.isFinite(usage.contextWindow) && usage.contextTokens > usage.contextWindow - usage.reserveTokens,
  cut: (entries, keepRecentTokens) => {
    const index = safeCutIndex(entries, keepRecentTokens)
    if (index <= 0 || index >= entries.length) return Option.none()
    const recent = entries.slice(index)
    const first = recent[0]
    return first === undefined
      ? Option.none()
      : Option.some({ firstKeptEntryId: first.id, head: entries.slice(0, index), recent })
  },
  summarize: (plan, request) => {
    const effect = Effect.gen(function* () {
      const head = Session.buildContext(plan.head)
      const [compactedHead] =
        request.toolOutputMaxBytes === undefined
          ? ([head, false] as const)
          : yield* microcompactPrompt(head, request.toolOutputMaxBytes)
      const prompt = summaryPrompt(options.summaryPrompt ?? SUMMARY_TEMPLATE, compactedHead)
      const model = yield* Ai.LanguageModel.LanguageModel
      return yield* model.generateText({ prompt, toolkit: Ai.Toolkit.empty, toolChoice: "none" }).pipe(
        Effect.map((response) => response.text),
        Effect.mapError((error) => new CompactionError({ message: String(error), cause: error })),
      )
    })
    return options.summaryModel === undefined ? effect : effect.pipe(Effect.provide(options.summaryModel))
  },
})

/** @experimental Build a compaction service from a strategy. */
export const make = (strategy: Strategy, options: DefaultOptions = {}): Interface => ({
  maybeCompact: (input) =>
    Effect.gen(function* () {
      const usage = normalizeUsage(input.usage, options)
      const shouldCompact = input.overflow || strategy.shouldCompact(usage)
      if (!shouldCompact) return Option.none<Result>()

      let history = input.history
      let prompt = input.prompt
      let changed = false

      if (input.toolOutputMaxBytes !== undefined) {
        const [compactedHistoryPrompt, historyChanged] = yield* microcompactPrompt(history, input.toolOutputMaxBytes)
        const [compactedPrompt, promptChanged] = yield* microcompactPrompt(prompt, input.toolOutputMaxBytes)
        history = compactedHistoryPrompt
        prompt = compactedPrompt
        changed = historyChanged || promptChanged
        if (changed && fits(history, prompt, usage)) return Option.some(makeMicrocompact(history, prompt))
      }

      const plan = strategy.cut(input.path ?? [], options.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS)
      if (Option.isNone(plan)) return changed ? Option.some(makeMicrocompact(history, prompt)) : Option.none<Result>()

      const summary = yield* strategy.summarize(plan.value, { ...input, history, prompt, usage })
      return Option.some<Result>({
        _tag: "Summarize",
        history: compactedHistory(summary, plan.value.head, plan.value.recent),
        prompt,
        summary,
        firstKeptEntryId: plan.value.firstKeptEntryId,
      })
    }),
})

/** @experimental Layer wiring the default or provided strategy. */
export const layer = (
  options: DefaultOptions = {},
  strategy: Strategy = defaultStrategy(options),
): Layer.Layer<Compaction> => Layer.succeed(Compaction, Compaction.of(make(strategy, options)))

/** @experimental Truncate-only compaction over `Ai.Tokenizer`. */
export const truncate = (maxTokens: number): Interface => ({
  maybeCompact: (input) =>
    Effect.gen(function* () {
      const usage = input.usage
      if (
        !input.overflow &&
        !(Number.isFinite(usage.contextWindow) && usage.contextTokens > usage.contextWindow - usage.reserveTokens)
      ) {
        return Option.none<Result>()
      }
      const tokenizer = yield* Effect.serviceOption(Ai.Tokenizer.Tokenizer)
      if (Option.isNone(tokenizer)) return Option.none<Result>()
      const prompt = yield* tokenizer.value
        .truncate(Ai.Prompt.concat(input.history, input.prompt), maxTokens)
        .pipe(Effect.mapError((error) => new CompactionError({ message: String(error), cause: error })))
      return Option.some<Result>(makeMicrocompact(Ai.Prompt.empty, prompt))
    }),
})

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Compaction> =>
  Layer.succeed(Compaction, Compaction.of(implementation))

/** @experimental Context-overflow classifier for reactive compaction. */
export const isContextOverflow = (error: unknown): boolean =>
  /context|token|prompt/i.test(error instanceof Error ? `${error.name}: ${error.message}` : String(error)) &&
  /overflow|exceed|exceeded|maximum|too large|too long|length/i.test(
    error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  )
