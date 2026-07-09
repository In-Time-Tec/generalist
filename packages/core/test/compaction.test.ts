import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Tokenizer } from "effect/unstable/ai"
import { Compaction, Session, ToolOutput } from "../src/index"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const assistantToolCall = (id: string): Prompt.Message =>
  Prompt.makeMessage("assistant", {
    content: [Prompt.makePart("tool-call", { id, name: "echo", params: { text: "call" }, providerExecuted: false })],
  })

const toolResult = (id: string, result: unknown): Prompt.Message =>
  Prompt.makeMessage("tool", {
    content: [Prompt.makePart("tool-result", { id, name: "echo", isFailure: false, result })],
  })

const entry = (id: string, message: Prompt.Message): Session.MessageEntry => ({
  _tag: "Message",
  id,
  parentId: id === "0" ? null : String(Number(id) - 1),
  message,
})

const modelLayer = (generateText: ModelParams["generateText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
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

  it("keeps a token-denominated keepRecentTokens budget when cutting", () => {
    const strategy = Compaction.defaultStrategy()
    const entries = [
      entry("0", user("aaa ".repeat(100))),
      entry("1", user("bbb ".repeat(100))),
      entry("2", user("ccc ".repeat(100))),
      entry("3", user("ddd ".repeat(100))),
    ]

    const plan = strategy.cut(entries, 200)

    expect(Option.isSome(plan)).toBe(true)
    if (Option.isSome(plan)) {
      expect(plan.value.head.map((item) => item.id)).toEqual(["0", "1"])
      expect(plan.value.recent.map((item) => item.id)).toEqual(["2", "3"])
    }
  })

  it.effect("keeps microcompaction when the token estimate fits the budget", () => {
    let summaryCalls = 0
    const large = "abcdef".repeat(40)
    const padding = "pad ".repeat(300)
    return Effect.gen(function* () {
      const service = Compaction.make(Compaction.defaultStrategy(), {
        contextWindow: 1_000,
        reserveTokens: 0,
        keepRecentTokens: 1,
      })

      const compacted = yield* service.maybeCompact({
        agentName: "token-budget-agent",
        sessionId: "session",
        turn: 1,
        history: Prompt.fromMessages([user(padding)]),
        prompt: Prompt.fromMessages([toolResult("call-large", large)]),
        path: [entry("0", user("old")), entry("1", user("recent"))],
        usage: { contextTokens: 2_000, contextWindow: 1_000, reserveTokens: 0 },
        overflow: false,
        toolOutputMaxBytes: 12,
      })

      expect(summaryCalls).toBe(0)
      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) expect(compacted.value._tag).toBe("Microcompact")
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
        history: Prompt.empty,
        prompt: Prompt.fromMessages([toolResult("call-large", large)]),
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
        prompt: Prompt.make("continue"),
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

  it.effect("keeps the system message ahead of the checkpoint when summarizing", () =>
    Effect.gen(function* () {
      const store = yield* Session.SessionStore
      yield* store.append({
        _tag: "Message",
        message: Prompt.makeMessage("system", { content: "You are a careful reviewer" }),
      })
      yield* store.append({ _tag: "Message", message: user("old goal") })
      yield* store.append({ _tag: "Message", message: user("recent tail") })
      const path = yield* store.path()
      const service = Compaction.make(Compaction.defaultStrategy(), {
        contextWindow: 10,
        reserveTokens: 1,
        keepRecentTokens: 1,
      })

      const compacted = yield* service.maybeCompact({
        agentName: "system-summary-agent",
        sessionId: "session",
        turn: 2,
        history: Session.buildContext(path),
        prompt: Prompt.make("continue"),
        path,
        usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 1 },
        overflow: false,
      })

      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) {
        const value = compacted.value
        expect(value._tag).toBe("Summarize")
        if (value._tag === "Summarize") {
          const first = value.history.content[0]
          expect(first?.role).toBe("system")
          const history = JSON.stringify(value.history.content)
          expect(history).toContain("You are a careful reviewer")
          expect(history).toContain("<conversation-checkpoint>")
          expect(history).toContain("recent tail")
        }
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Session.memoryLayer,
          modelLayer(() => Effect.succeed([{ type: "text", text: "checkpoint summary" }])),
        ),
      ),
    ),
  )

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
        history: Prompt.empty,
        prompt: Prompt.make("continue"),
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

  it.effect("truncate uses Tokenizer to keep the newest context", () => {
    const service = Compaction.truncate(2)
    return Effect.gen(function* () {
      const compacted = yield* service.maybeCompact({
        agentName: "truncate-agent",
        sessionId: "session",
        turn: 0,
        history: Prompt.fromMessages([user("old"), user("middle")]),
        prompt: Prompt.fromMessages([user("new")]),
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
            Tokenizer.Tokenizer,
            Tokenizer.Tokenizer.of({
              tokenize: (input) => Effect.succeed(Prompt.make(input).content.map((_, index) => index)),
              truncate: (input, tokens) =>
                Effect.succeed(Prompt.fromMessages(Prompt.make(input).content.slice(-tokens))),
            }),
          ),
          modelLayer(() => Effect.succeed([{ type: "text", text: "unused" }])),
        ),
      ),
    )
  })

  it("composes ordered strategy parts onto the default strategy", () => {
    const composed = Compaction.strategy([
      { shouldCompact: () => false },
      { shouldCompact: () => true },
      Compaction.toolOutputBound({ maxBytes: 128 }),
      Compaction.keepRecent({ tokens: 256 }),
    ])

    expect(composed.shouldCompact({ contextTokens: 0, contextWindow: 100, reserveTokens: 10 })).toBe(true)
    expect(composed.toolOutputMaxBytes).toBe(128)
    expect(composed.keepRecentTokens).toBe(256)
  })

  it.effect("applies a composed lossless tool-output bound before summarization", () => {
    let summaryCalls = 0
    const large = "bounded-output".repeat(40)
    const composed = Compaction.strategy([Compaction.toolOutputBound({ maxBytes: 12 })])
    const service = Compaction.make(composed, {
      contextWindow: 1_000,
      reserveTokens: 0,
      keepRecentTokens: 1,
    })
    return Effect.gen(function* () {
      const compacted = yield* service.maybeCompact({
        agentName: "composed-tool-bound-agent",
        sessionId: "session",
        turn: 1,
        history: Prompt.empty,
        prompt: Prompt.fromMessages([toolResult("call-composed-bound", large)]),
        path: [],
        usage: { contextTokens: 2_000, contextWindow: 1_000, reserveTokens: 0 },
        overflow: false,
      })

      expect(summaryCalls).toBe(0)
      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted)) {
        expect(compacted.value._tag).toBe("Microcompact")
        expect(JSON.stringify(compacted.value.prompt.content)).toContain("mem:composed-bound")
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:composed-bound")) }),
          modelLayer(() => {
            summaryCalls += 1
            return Effect.succeed([{ type: "text", text: "unexpected summary" }])
          }),
        ),
      ),
    )
  })

  it.effect("keeps retained tool results bounded after semantic summarization", () => {
    const large = "retained-tool-output".repeat(50)
    const composed = Compaction.strategy([
      Compaction.toolOutputBound({ maxBytes: 12 }),
      Compaction.keepRecent({ tokens: 1 }),
    ])
    const service = Compaction.make(composed, { contextWindow: 1, reserveTokens: 0 })
    return Effect.gen(function* () {
      const compacted = yield* service.maybeCompact({
        agentName: "retained-tool-bound-agent",
        sessionId: "session",
        turn: 2,
        history: Prompt.empty,
        prompt: Prompt.make("continue"),
        path: [
          entry("0", user("old goal")),
          entry("1", assistantToolCall("call-retained")),
          entry("2", toolResult("call-retained", large)),
        ],
        usage: { contextTokens: 100, contextWindow: 1, reserveTokens: 0 },
        overflow: false,
      })

      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted) && compacted.value._tag === "Summarize") {
        const history = JSON.stringify(compacted.value.history.content)
        expect(history).toContain("mem:retained-tool")
        expect(history).not.toContain(large)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:retained-tool")) }),
          modelLayer(() => Effect.succeed([{ type: "text", text: "checkpoint summary" }])),
        ),
      ),
    )
  })

  it.effect("generates a validated structured summary and renders a deterministic checkpoint", () => {
    let objectName: string | undefined
    let toolChoice: string | object | undefined
    const composed = Compaction.strategy([
      Compaction.structuredSummary({ objectName: "AgentSummary" }),
      Compaction.keepRecent({ tokens: 1 }),
    ])
    const service = Compaction.make(composed, { contextWindow: 10, reserveTokens: 0 })
    return Effect.gen(function* () {
      const compacted = yield* service.maybeCompact({
        agentName: "structured-summary-agent",
        sessionId: "session",
        turn: 2,
        history: Prompt.empty,
        prompt: Prompt.make("continue"),
        path: [entry("0", user("old goal")), entry("1", user("recent tail"))],
        usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 0 },
        overflow: false,
      })

      expect(Option.isSome(compacted)).toBe(true)
      if (Option.isSome(compacted) && compacted.value._tag === "Summarize") {
        expect(compacted.value.summary).toBe(
          "## Goal\nShip the strategy pack\n\n## Facts\n- Baton uses Effect AI\n\n## Decisions\n- Keep string checkpoints\n\n## Open Questions\n- None\n\n## Tool Findings\n- Tests are deterministic",
        )
        expect(JSON.stringify(compacted.value.history.content)).toContain("recent tail")
      }
      expect(objectName).toBe("AgentSummary")
      expect(toolChoice).toBe("none")
    }).pipe(
      Effect.provide(
        modelLayer((options) => {
          objectName = options.responseFormat?.type === "json" ? options.responseFormat.objectName : undefined
          toolChoice = options.toolChoice
          return Effect.succeed([
            {
              type: "text",
              text: JSON.stringify({
                goal: "Ship the strategy pack",
                facts: ["Baton uses Effect AI"],
                decisions: ["Keep string checkpoints"],
                openQuestions: ["None"],
                toolFindings: ["Tests are deterministic"],
              }),
            },
          ])
        }),
      ),
    )
  })

  it("rejects invalid strategy-part bounds", () => {
    expect(() => Compaction.toolOutputBound({ maxBytes: Number.POSITIVE_INFINITY })).toThrow(TypeError)
    expect(() => Compaction.keepRecent({ tokens: -1 })).toThrow(TypeError)
  })

  it("exports the structured summary schema", () => {
    const decoded = Schema.decodeUnknownSync(Compaction.AgentSummary)({
      goal: "goal",
      facts: [],
      decisions: [],
      openQuestions: [],
      toolFindings: [],
    })

    expect(decoded.goal).toBe("goal")
  })
})
