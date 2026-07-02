import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Compaction, Session, ToolOutput } from "../src/index"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const user = (text: string): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("user", { content: [Ai.Prompt.makePart("text", { text })] })

const assistantToolCall = (id: string): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("assistant", {
    content: [Ai.Prompt.makePart("tool-call", { id, name: "echo", params: { text: "call" }, providerExecuted: false })],
  })

const toolResult = (id: string, result: unknown): Ai.Prompt.Message =>
  Ai.Prompt.makeMessage("tool", {
    content: [Ai.Prompt.makePart("tool-result", { id, name: "echo", isFailure: false, result })],
  })

const entry = (id: string, message: Ai.Prompt.Message): Session.MessageEntry => ({
  _tag: "Message",
  id,
  parentId: id === "0" ? null : String(Number(id) - 1),
  message,
})

const modelLayer = (generateText: ModelParams["generateText"]): Layer.Layer<Ai.LanguageModel.LanguageModel> =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText,
      streamText: () => Stream.empty,
    }),
  )

describe("Compaction", () => {
  it("uses strict reserve-token boundary math", () => {
    const strategy = Compaction.defaultStrategy()

    expect(strategy.shouldCompact({ contextTokens: 79, contextWindow: 100, reserveTokens: 20 })).toBe(false)
    expect(strategy.shouldCompact({ contextTokens: 80, contextWindow: 100, reserveTokens: 20 })).toBe(false)
    expect(strategy.shouldCompact({ contextTokens: 81, contextWindow: 100, reserveTokens: 20 })).toBe(true)
    expect(
      strategy.shouldCompact({ contextTokens: 10_000, contextWindow: Number.POSITIVE_INFINITY, reserveTokens: 20 }),
    ).toBe(false)
  })

  it("cuts at a safe tool boundary", () => {
    const strategy = Compaction.defaultStrategy()
    const entries = [
      entry("0", user("old")),
      entry("1", assistantToolCall("call-1")),
      entry("2", toolResult("call-1", "result")),
    ]

    const plan = strategy.cut(entries, 1)

    expect(Option.isSome(plan)).toBe(true)
    if (Option.isSome(plan)) {
      expect(plan.value.firstKeptEntryId).toBe("1")
      expect(plan.value.head.map((item) => item.id)).toEqual(["0"])
      expect(plan.value.recent.map((item) => item.id)).toEqual(["1", "2"])
    }
  })

  it.effect("microcompacts successful tool results before summarizing", () => {
    let summaryCalls = 0
    const large = "abcdef".repeat(40)
    return Effect.gen(function* () {
      const service = Compaction.make(Compaction.defaultStrategy(), {
        contextWindow: 1_000,
        reserveTokens: 10,
        keepRecentTokens: 1,
      })

      const compacted = yield* service.maybeCompact({
        agentName: "compact-agent",
        sessionId: "session",
        turn: 1,
        history: Ai.Prompt.empty,
        prompt: Ai.Prompt.fromMessages([toolResult("call-large", large)]),
        path: [],
        usage: { contextTokens: 2_000, contextWindow: 1_000, reserveTokens: 10 },
        overflow: false,
        toolOutputMaxBytes: 12,
      })

      expect(summaryCalls).toBe(0)
      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) {
        const payload = JSON.stringify(compacted.value.prompt.content)
        expect(compacted.value._tag).toBe("Microcompact")
        expect(payload).toContain("mem:large")
        expect(payload).not.toContain(large)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:large")) }),
          modelLayer(() => {
            summaryCalls += 1
            return Effect.succeed([{ type: "text", text: "unexpected summary" }])
          }),
        ),
      ),
    )
  })

  it.effect("summarizes the old session prefix with a dedicated no-tools model call", () => {
    let summaryCalls = 0
    let summaryPrompt = ""
    return Effect.gen(function* () {
      const store = yield* Session.SessionStore
      yield* store.append({ _tag: "Message", message: user("old goal") })
      const kept = yield* store.append({ _tag: "Message", message: user("recent tail") })
      const path = yield* store.path()
      const service = Compaction.make(Compaction.defaultStrategy(), {
        contextWindow: 10,
        reserveTokens: 1,
        keepRecentTokens: 1,
      })

      const compacted = yield* service.maybeCompact({
        agentName: "summary-agent",
        sessionId: "session",
        turn: 2,
        history: Session.buildContext(path),
        prompt: Ai.Prompt.make("continue"),
        path,
        usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 1 },
        overflow: false,
      })

      expect(summaryCalls).toBe(1)
      expect(summaryPrompt).toContain("Summarize the conversation so another agent can continue seamlessly")
      expect(summaryPrompt).toContain("Do not mention that context was compacted")
      expect(summaryPrompt).toContain("old goal")
      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) {
        const value = compacted.value
        expect(value._tag).toBe("Summarize")
        if (value._tag === "Summarize") {
          expect(value.firstKeptEntryId).toBe(kept.id)
          const history = JSON.stringify(value.history.content)
          expect(history).toContain("<conversation-checkpoint>")
          expect(history).toContain("checkpoint summary")
          expect(history).toContain("recent tail")
          expect(JSON.stringify(value.prompt.content)).toContain("continue")
        }
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Session.memoryLayer,
          modelLayer((options) => {
            summaryCalls += 1
            summaryPrompt = JSON.stringify(options.prompt.content)
            expect(options.toolChoice).toBe("none")
            return Effect.succeed([{ type: "text", text: "checkpoint summary" }])
          }),
        ),
      ),
    )
  })

  it.effect("microcompacts summarized head tool results before the summary call", () => {
    let summaryPrompt = ""
    const large = "tool-output".repeat(60)
    return Effect.gen(function* () {
      const service = Compaction.make(Compaction.defaultStrategy(), {
        contextWindow: 1,
        reserveTokens: 0,
        keepRecentTokens: 1,
      })

      const compacted = yield* service.maybeCompact({
        agentName: "summary-head-agent",
        sessionId: "session",
        turn: 2,
        history: Ai.Prompt.empty,
        prompt: Ai.Prompt.make("continue"),
        path: [entry("0", toolResult("call-head", large)), entry("1", user("recent"))],
        usage: { contextTokens: 100, contextWindow: 1, reserveTokens: 0 },
        overflow: false,
        toolOutputMaxBytes: 8,
      })

      expect(Option.isSome(compacted)).toBe(true)
      expect(summaryPrompt).toContain("mem:head")
      expect(summaryPrompt).not.toContain(large)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:head")) }),
          modelLayer((options) => {
            summaryPrompt = JSON.stringify(options.prompt.content)
            return Effect.succeed([{ type: "text", text: "summary" }])
          }),
        ),
      ),
    )
  })

  it.effect("truncate uses Ai.Tokenizer to keep the newest context", () => {
    const service = Compaction.truncate(2)
    return Effect.gen(function* () {
      const compacted = yield* service.maybeCompact({
        agentName: "truncate-agent",
        sessionId: "session",
        turn: 0,
        history: Ai.Prompt.fromMessages([user("old"), user("middle")]),
        prompt: Ai.Prompt.fromMessages([user("new")]),
        usage: { contextTokens: 3, contextWindow: 2, reserveTokens: 0 },
        overflow: false,
      })

      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) {
        const payload = JSON.stringify(compacted.value.prompt.content)
        expect(payload).not.toContain("old")
        expect(payload).toContain("middle")
        expect(payload).toContain("new")
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            Ai.Tokenizer.Tokenizer,
            Ai.Tokenizer.Tokenizer.of({
              tokenize: (input) => Effect.succeed(Ai.Prompt.make(input).content.map((_, index) => index)),
              truncate: (input, tokens) =>
                Effect.succeed(Ai.Prompt.fromMessages(Ai.Prompt.make(input).content.slice(-tokens))),
            }),
          ),
          modelLayer(() => Effect.succeed([{ type: "text", text: "unused" }])),
        ),
      ),
    )
  })
})
