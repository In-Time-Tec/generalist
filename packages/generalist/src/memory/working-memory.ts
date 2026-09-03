import { Effect, HashMap, Layer, SynchronizedRef } from "effect"
import { LanguageModel, Prompt, Toolkit } from "effect/unstable/ai"
import { type Item, type Key, Memory, MemoryError, type Service as MemoryService } from "../core/context/memory.js"
import { make as makeSummaryModelProvider } from "../core/model/result/summary-model.js"
export interface SummarizeOptions {
  readonly prompt?: string
  /** Model layer for summary calls; omit to use the model provided where this layer is built. */
  readonly model?: Layer.Layer<LanguageModel.LanguageModel>
}
export interface Options {
  readonly maxMessages?: number
  readonly summarize?: SummarizeOptions
}

/** @internal The ambient LanguageModel is required only when summarizing without an explicit model layer. */
export type SummaryRequirement<O> = O extends {
  readonly summarize: { readonly model: Layer.Layer<LanguageModel.LanguageModel> }
}
  ? never
  : O extends { readonly summarize?: infer S }
    ? [Extract<S, SummarizeOptions>] extends [never]
      ? never
      : LanguageModel.LanguageModel
    : never

type StoredRole = "user" | "assistant"

interface IncomingItem {
  readonly role: StoredRole
  readonly text: string
}

interface StoredItem extends IncomingItem {
  readonly id: string
}

interface KeyState {
  readonly summary?: string
  readonly recent: ReadonlyArray<StoredItem>
  readonly counter: number
}

interface TrimmedWindow {
  readonly overflow: ReadonlyArray<StoredItem>
  readonly recent: ReadonlyArray<StoredItem>
}

const emptyState: KeyState = {
  recent: [],
  counter: 0,
}

const defaultSummaryPrompt = "Summarize the conversation memory while preserving stable user preferences and facts."

const memoryError = (message: string): MemoryError => MemoryError.make({ message })

const versioningUnsupported = (): MemoryError =>
  MemoryError.make({
    reason: "unsupported",
    message: "WorkingMemory is a bounded prompt window and does not retain semantic-memory versions",
  })

const keyId = (key: Key): string => JSON.stringify([key.agent, key.subject])

const textPart = (text: string) => Prompt.makePart("text", { text })

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const roleLabel = (role: StoredRole): string => (role === "user" ? "User" : "Assistant")

const formatItem = (item: IncomingItem): string => `${roleLabel(item.role)}: ${item.text}`

const normalize = (prompt: Prompt.Prompt): ReadonlyArray<IncomingItem> =>
  prompt.content.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return []
    const text = textFromParts(message.content).trim()
    return text.length === 0 ? [] : [{ role: message.role, text }]
  })

const sameItem = (left: IncomingItem, right: IncomingItem): boolean =>
  left.role === right.role && left.text === right.text

const appendStart = (recent: ReadonlyArray<StoredItem>, incoming: ReadonlyArray<IncomingItem>): number => {
  if (recent.length === 0) return 0
  for (let start = Math.max(0, incoming.length - recent.length); start >= 0; start -= 1) {
    if (start + recent.length > incoming.length) continue
    let matches = true
    for (let offset = 0; offset < recent.length; offset += 1) {
      const stored = recent[offset]
      const next = incoming[start + offset]
      if (stored === undefined || next === undefined || !sameItem(stored, next)) {
        matches = false
        break
      }
    }
    if (matches) return start + recent.length
  }
  return 0
}

const trimToWindow = (items: ReadonlyArray<StoredItem>, maxMessages: number): TrimmedWindow => {
  if (items.length <= maxMessages) return { overflow: [], recent: items }
  if (maxMessages === 0) return { overflow: items, recent: [] }
  return {
    overflow: items.slice(0, items.length - maxMessages),
    recent: items.slice(-maxMessages),
  }
}

const renderSummaryPrompt = (
  prompt: string,
  summary: string | undefined,
  overflow: ReadonlyArray<StoredItem>,
): string =>
  [
    prompt,
    ...(summary === undefined ? [] : [`Existing summary:\n${summary}`]),
    `New messages:\n${overflow.map(formatItem).join("\n")}`,
    "Return only the updated summary.",
  ].join("\n\n")

const summarizeOverflow = (
  model: LanguageModel.Service,
  prompt: string | undefined,
  summary: string | undefined,
  overflow: ReadonlyArray<StoredItem>,
): Effect.Effect<string | undefined, MemoryError> =>
  model
    .generateText({
      prompt: renderSummaryPrompt(prompt ?? defaultSummaryPrompt, summary, overflow),
      toolkit: Toolkit.empty,
      toolChoice: "none",
    })
    .pipe(
      Effect.map((response) => {
        const text = response.text.trim()
        return text.length === 0 ? summary : text
      }),
      Effect.mapError((error) => memoryError(String(error))),
    )

type SummarizeCall = (
  overflow: ReadonlyArray<StoredItem>,
  summary: string | undefined,
) => Effect.Effect<string | undefined, MemoryError>

const resolveSummarize = (
  options: Options,
): Effect.Effect<SummarizeCall | undefined, never, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    if (options.summarize === undefined) return undefined
    const summarize = options.summarize
    const work = (overflow: ReadonlyArray<StoredItem>, summary: string | undefined) =>
      Effect.flatMap(LanguageModel.LanguageModel, (model) =>
        summarizeOverflow(model, summarize.prompt, summary, overflow),
      )
    if (summarize.model !== undefined) {
      const provideSummaryModel = makeSummaryModelProvider(summarize.model)
      return (overflow: ReadonlyArray<StoredItem>, summary: string | undefined) =>
        provideSummaryModel(work(overflow, summary))
    }
    const ambient = yield* LanguageModel.LanguageModel
    return (overflow: ReadonlyArray<StoredItem>, summary: string | undefined) =>
      work(overflow, summary).pipe(Effect.provideService(LanguageModel.LanguageModel, ambient))
  })

const recallItems = (state: KeyState): ReadonlyArray<Item> => [
  ...(state.summary === undefined
    ? []
    : [
        {
          id: "working-summary",
          content: [textPart(`<working-memory-summary>\n${state.summary}\n</working-memory-summary>`)],
        },
      ]),
  ...state.recent.map((item) => ({ id: item.id, content: [textPart(formatItem(item))] })),
]

const makeImpl = (options: Options): Effect.Effect<MemoryService, never, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const summarize = yield* resolveSummarize(options)
    const states = yield* SynchronizedRef.make(HashMap.empty<string, KeyState>())
    const maxMessages = Math.max(0, Math.floor(options.maxMessages ?? 20))
    return {
      recall: (input) =>
        SynchronizedRef.get(states).pipe(
          Effect.map((current) => HashMap.get(current, keyId(input.key))),
          Effect.map((state) => (state._tag === "Some" ? recallItems(state.value) : [])),
        ),
      remember: (input) => {
        if (input.entryId !== undefined || input.supersedes !== undefined) {
          return Effect.fail(versioningUnsupported())
        }
        const incoming = normalize(input.transcript)
        if (incoming.length === 0) return Effect.void
        return SynchronizedRef.updateEffect(states, (current) =>
          Effect.gen(function* () {
            const id = keyId(input.key)
            const existing = HashMap.get(current, id).pipe((option) =>
              option._tag === "Some" ? option.value : emptyState,
            )
            const start = appendStart(existing.recent, incoming)
            const appended = incoming.slice(start)
            if (appended.length === 0) return current
            let counter = existing.counter
            const stored = appended.map((item) => {
              counter += 1
              return { id: `working-${counter}`, role: item.role, text: item.text }
            })
            const combined = [...existing.recent, ...stored]
            const trimmed = trimToWindow(combined, maxMessages)
            let summary = existing.summary
            if (trimmed.overflow.length > 0 && summarize !== undefined) {
              summary = yield* summarize(trimmed.overflow, existing.summary)
            }
            const nextState: KeyState =
              summary === undefined ? { recent: trimmed.recent, counter } : { recent: trimmed.recent, counter, summary }
            return HashMap.set(current, id, nextState)
          }),
        )
      },
      forget: (input) =>
        SynchronizedRef.update(states, (current) => {
          const id = keyId(input.key)
          if (input.id === undefined) return HashMap.remove(current, id)
          const existing = HashMap.get(current, id)
          if (existing._tag === "None") return current
          const summary = input.id === "working-summary" ? undefined : existing.value.summary
          const recent = existing.value.recent.filter((item) => item.id !== input.id)
          if (summary === undefined && recent.length === 0) return HashMap.remove(current, id)
          const nextState: KeyState =
            summary === undefined
              ? { recent, counter: existing.value.counter }
              : { recent, counter: existing.value.counter, summary }
          return HashMap.set(current, id, nextState)
        }),
      history: () => Effect.succeed([]),
      revert: () => Effect.fail(versioningUnsupported()),
    }
  })
export function make(): Effect.Effect<MemoryService>
export function make<O extends Options>(options: O): Effect.Effect<MemoryService, never, SummaryRequirement<O>>
export function make(options: Options = {}): Effect.Effect<MemoryService, never, LanguageModel.LanguageModel> {
  return makeImpl(options)
}
export function layer(): Layer.Layer<Memory>
export function layer<O extends Options>(options: O): Layer.Layer<Memory, never, SummaryRequirement<O>>
export function layer(options: Options = {}): Layer.Layer<Memory, never, LanguageModel.LanguageModel> {
  return Layer.effect(Memory, makeImpl(options).pipe(Effect.map(Memory.of)))
}
