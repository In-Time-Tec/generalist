import { Context, Effect, Layer, Option, Schema } from "effect"
import { LanguageModel, Prompt, Tokenizer, Toolkit } from "effect/unstable/ai"
import { type Entry, type EntryId, buildContext } from "./session"
import { type Success } from "./tool-executor"
import { bound } from "./tool-output"
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
  readonly firstKeptEntryId: EntryId
  readonly head: ReadonlyArray<Entry>
  readonly recent: ReadonlyArray<Entry>
}

/** @experimental Request passed to a compaction implementation. */
export interface Request {
  readonly agentName: string
  readonly sessionId: string
  readonly turn: number
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
  readonly path?: ReadonlyArray<Entry>
  readonly usage: Usage
  readonly overflow: boolean
  readonly toolOutputMaxBytes?: number
}

/** @experimental Result from tool-output microcompaction. */
export interface MicrocompactResult {
  readonly _tag: "Microcompact"
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
}

/** @experimental Result from summary checkpointing. */
export interface SummarizeResult {
  readonly _tag: "Summarize"
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
  readonly summary: string
  readonly firstKeptEntryId: EntryId
}

/** @experimental Compaction result applied by the agent loop. */
export type Result = MicrocompactResult | SummarizeResult

/** @experimental Compaction strategy: decide, cut, summarize. */
export interface Strategy {
  readonly shouldCompact: (usage: Usage) => boolean
  readonly cut: (entries: ReadonlyArray<Entry>, keepRecentTokens: number) => Option.Option<Plan>
  readonly summarize: (
    plan: Plan,
    request: Request,
  ) => Effect.Effect<string, CompactionError, LanguageModel.LanguageModel>
}

/** @experimental Compaction service boundary consulted by the loop. */
export interface Interface {
  readonly maybeCompact: (
    request: Request,
  ) => Effect.Effect<Option.Option<Result>, CompactionError, LanguageModel.LanguageModel>
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
  readonly summaryModel?: Layer.Layer<LanguageModel.LanguageModel>
  readonly summaryPrompt?: string
}

const serialized = (value: unknown): string => {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

const APPROX_CHARS_PER_TOKEN = 4

const estimateTokens = (text: string): number => Math.ceil(text.length / APPROX_CHARS_PER_TOKEN)

const estimateEntryTokens = (entry: Entry): number => estimateTokens(serialized(entry))

const estimatePromptTokens = (prompt: Prompt.Prompt): number => estimateTokens(serialized(prompt.content))

const fits = (history: Prompt.Prompt, prompt: Prompt.Prompt, usage: Usage): boolean =>
  Number.isFinite(usage.contextWindow) &&
  estimatePromptTokens(Prompt.concat(history, prompt)) <= usage.contextWindow - usage.reserveTokens

const isPromptToolResult = (part: Prompt.Part): part is Prompt.ToolResultPart => part.type === "tool-result"

const messageHasToolCall = (message: Prompt.Message): boolean =>
  typeof message.content !== "string" && message.content.some((part) => part.type === "tool-call")

const isToolMessage = (entry: Entry | undefined): boolean => entry?._tag === "Message" && entry.message.role === "tool"

const isAssistantToolCallEntry = (entry: Entry | undefined): boolean =>
  entry?._tag === "Message" && entry.message.role === "assistant" && messageHasToolCall(entry.message)

const compactToolPart = (
  part: Prompt.ToolResultPart,
  maxBytes: number,
): Effect.Effect<readonly [Prompt.ToolResultPart, boolean], CompactionError> =>
  Effect.gen(function* () {
    if (part.isFailure) return [part, false] as const
    const success: Success = { _tag: "Success", result: part.result, encodedResult: part.result }
    const bounded = yield* bound(success, { toolCallId: part.id, maxBytes }).pipe(
      Effect.mapError((error) => new CompactionError({ message: error.message, cause: error })),
    )
    if (bounded === success) return [part, false] as const
    return [
      Prompt.makePart("tool-result", {
        id: part.id,
        name: part.name,
        isFailure: false,
        result: bounded.encodedResult,
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
      if (typeof message.content === "string") {
        messages.push(message)
      } else {
        let messageChanged = false
        const content: Array<Prompt.Part> = []
        for (const part of message.content as ReadonlyArray<Prompt.Part>) {
          if (!isPromptToolResult(part)) {
            content.push(part)
          } else {
            const [compacted, didCompact] = yield* compactToolPart(part, maxBytes)
            changed = changed || didCompact
            messageChanged = messageChanged || didCompact
            content.push(compacted)
          }
        }
        messages.push(messageChanged ? ({ ...message, content } as Prompt.Message) : message)
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

const compactedHistory = (summary: string, head: ReadonlyArray<Entry>, recent: ReadonlyArray<Entry>): Prompt.Prompt =>
  Prompt.concat(Prompt.fromMessages([...systemMessages(head), checkpointMessage(summary)]), buildContext(recent))

const normalizeUsage = (usage: Usage, options: DefaultOptions): Usage => ({
  contextTokens: Number.isFinite(usage.contextTokens) ? usage.contextTokens : 0,
  contextWindow: Number.isFinite(usage.contextWindow)
    ? usage.contextWindow
    : (options.contextWindow ?? Number.POSITIVE_INFINITY),
  reserveTokens:
    options.reserveTokens ?? (Number.isFinite(usage.reserveTokens) ? usage.reserveTokens : DEFAULT_RESERVE_TOKENS),
})

const makeMicrocompact = (history: Prompt.Prompt, prompt: Prompt.Prompt): MicrocompactResult => ({
  _tag: "Microcompact",
  history,
  prompt,
})

const safeCutIndex = (entries: ReadonlyArray<Entry>, keepRecentTokens: number): number => {
  let total = 0
  let index = entries.length
  while (index > 0 && total < keepRecentTokens) {
    index -= 1
    total += estimateEntryTokens(entries[index] as Entry)
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
      const head = buildContext(plan.head)
      const [compactedHead] =
        request.toolOutputMaxBytes === undefined
          ? ([head, false] as const)
          : yield* microcompactPrompt(head, request.toolOutputMaxBytes)
      const prompt = summaryPrompt(options.summaryPrompt ?? SUMMARY_TEMPLATE, compactedHead)
      const model = yield* LanguageModel.LanguageModel
      return yield* model.generateText({ prompt, toolkit: Toolkit.empty, toolChoice: "none" }).pipe(
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

/** @experimental Truncate-only compaction over `Tokenizer`. */
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
      const tokenizer = yield* Effect.serviceOption(Tokenizer.Tokenizer)
      if (Option.isNone(tokenizer)) return Option.none<Result>()
      const prompt = yield* tokenizer.value
        .truncate(Prompt.concat(input.history, input.prompt), maxTokens)
        .pipe(Effect.mapError((error) => new CompactionError({ message: String(error), cause: error })))
      return Option.some<Result>(makeMicrocompact(Prompt.empty, prompt))
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
