import { Context, Effect, HashMap, Layer, SynchronizedRef } from "effect"
import { LanguageModel, Prompt, Toolkit } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"

/** @experimental */
export interface SummarizeOptions {
  readonly prompt?: string
}

/** @experimental */
export interface Options {
  readonly maxMessages?: number
  readonly summarize?: SummarizeOptions
}

/** @experimental */
export class SummaryModel extends Context.Service<SummaryModel, LanguageModel.Service>()(
  "@batonfx/memory/SummaryModel",
) {}

/** @experimental */
export const layerSummaryModel: Layer.Layer<SummaryModel, never, LanguageModel.LanguageModel> = Layer.effect(
  SummaryModel,
  LanguageModel.LanguageModel,
)

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

const emptyState: KeyState = {
  recent: [],
  counter: 0,
}

const defaultSummaryPrompt = "Summarize the conversation memory while preserving stable user preferences and facts."

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const memoryError = (error: unknown): Memory.MemoryError => Memory.MemoryError.make({ message: errorMessage(error) })

const keyId = (key: Memory.Key): string => JSON.stringify([key.agent, key.subject])

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

const trimToWindow = (
  items: ReadonlyArray<StoredItem>,
  maxMessages: number,
): { readonly overflow: ReadonlyArray<StoredItem>; readonly recent: ReadonlyArray<StoredItem> } => {
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
): Effect.Effect<string | undefined, Memory.MemoryError> =>
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
      Effect.mapError(memoryError),
    )

const resolveSummaryModel = (options: Options): Effect.Effect<LanguageModel.Service | void, never, SummaryModel> =>
  options.summarize === undefined ? Effect.void : SummaryModel

type WithoutSummaryOptions = Options & { readonly summarize?: undefined }

const recallItems = (state: KeyState): ReadonlyArray<Memory.Item> => [
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

/** @experimental */
export function make(
  options: Options & { readonly summarize: SummarizeOptions },
): Effect.Effect<Memory.Interface, never, SummaryModel>
/** @experimental */
export function make(options?: WithoutSummaryOptions): Effect.Effect<Memory.Interface>
/** @experimental */
export function make(options: Options): Effect.Effect<Memory.Interface, never, SummaryModel>
export function make(options: Options = {}): Effect.Effect<Memory.Interface, never, SummaryModel> {
  return Effect.gen(function* () {
    const summaryModel = yield* resolveSummaryModel(options)
    const states = yield* SynchronizedRef.make(HashMap.empty<string, KeyState>())
    const maxMessages = Math.max(0, Math.floor(options.maxMessages ?? 20))
    return {
      recall: (input) =>
        SynchronizedRef.get(states).pipe(
          Effect.map((current) => HashMap.get(current, keyId(input.key))),
          Effect.map((state) => (state._tag === "Some" ? recallItems(state.value) : [])),
        ),
      remember: (input) => {
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
            const summary =
              trimmed.overflow.length === 0
                ? existing.summary
                : summaryModel === undefined
                  ? existing.summary
                  : yield* summarizeOverflow(
                      summaryModel,
                      options.summarize?.prompt,
                      existing.summary,
                      trimmed.overflow,
                    )
            const nextState: KeyState = {
              recent: trimmed.recent,
              counter,
              ...(summary === undefined ? {} : { summary }),
            }
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
          const nextState: KeyState = {
            recent,
            counter: existing.value.counter,
            ...(summary === undefined ? {} : { summary }),
          }
          return HashMap.set(current, id, nextState)
        }),
    }
  })
}

/** @experimental */
export const makeWorkingMemory = make

/** @experimental */
export function layer(
  options: Options & { readonly summarize: SummarizeOptions },
): Layer.Layer<Memory.Memory, never, SummaryModel>
/** @experimental */
export function layer(options?: WithoutSummaryOptions): Layer.Layer<Memory.Memory>
/** @experimental */
export function layer(options: Options): Layer.Layer<Memory.Memory, never, SummaryModel>
export function layer(options: Options = {}): Layer.Layer<Memory.Memory, never, SummaryModel> {
  return Layer.effect(Memory.Memory, make(options).pipe(Effect.map(Memory.Memory.of)))
}
