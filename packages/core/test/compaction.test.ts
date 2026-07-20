import { describe, expect, it } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Tokenizer } from "effect/unstable/ai"
import { Compaction, Session, ToolOutput } from "../src/index"
import { ItLayer } from "./it-layer"

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

const successfulToolResultValue = (prompt: Prompt.Prompt): unknown => {
  for (const message of prompt.content) {
    if (typeof message.content === "string") continue
    for (const part of message.content) {
      if (part.type === "tool-result" && !part.isFailure) return part.result
    }
  }
  return undefined
}

const outputPaths = (value: unknown): unknown =>
  typeof value === "object" && value !== null && "outputPaths" in value ? value.outputPaths : undefined

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

  ItLayer.make(it, "keeps microcompaction when the token estimate fits the budget", () => {
    let summaryCalls = 0
    const large = "abcdef".repeat(40)
    const padding = "pad ".repeat(300)
    return [
      Layer.mergeAll(
        ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:large")) }),
        modelLayer(() => {
          summaryCalls += 1
          return Effect.succeed([{ type: "text", text: "unexpected summary" }])
        }),
      ),
      Effect.gen(function* () {
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
      }),
    ] as const
  })

  ItLayer.make(it, "microcompacts successful tool results before summarizing", () => {
    let summaryCalls = 0
    const large = "abcdef".repeat(40)
    return [
      Layer.mergeAll(
        ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:large")) }),
        modelLayer(() => {
          summaryCalls += 1
          return Effect.succeed([{ type: "text", text: "unexpected summary" }])
        }),
      ),
      Effect.gen(function* () {
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
          const payload = Json.stringify(compacted.value.prompt.content)
          expect(compacted.value._tag).toBe("Microcompact")
          expect(payload).toContain("mem:large")
          expect(payload).not.toContain(large)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "summarizes the old session prefix with a dedicated no-tools model call", () => {
    let summaryCalls = 0
    let summaryPrompt = ""
    return [
      Layer.mergeAll(
        Session.layerMemory,
        modelLayer((options) => {
          summaryCalls += 1
          summaryPrompt = Json.stringify(options.prompt.content)
          expect(options.toolChoice).toBe("none")
          return Effect.succeed([{ type: "text", text: "checkpoint summary" }])
        }),
      ),
      Effect.gen(function* () {
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
            const history = Json.stringify(value.history.content)
            expect(history).toContain("<conversation-checkpoint>")
            expect(history).toContain("checkpoint summary")
            expect(history).toContain("recent tail")
            expect(Json.stringify(value.prompt.content)).toContain("continue")
          }
        }
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "keeps the system message ahead of the checkpoint when summarizing",
    () =>
      [
        Layer.mergeAll(
          Session.layerMemory,
          modelLayer(() => Effect.succeed([{ type: "text", text: "checkpoint summary" }])),
        ),
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
              const history = Json.stringify(value.history.content)
              expect(history).toContain("You are a careful reviewer")
              expect(history).toContain("<conversation-checkpoint>")
              expect(history).toContain("recent tail")
              const checkpointId = yield* store.reserveEntryId
              yield* store.appendCheckpoint({
                id: checkpointId,
                parentId: yield* store.leaf,
                projectedHistory: value.history,
                summary: value.summary,
              })
              expect(Json.stringify(Session.buildContext(yield* store.path()).content)).toBe(history)
            }
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "microcompacts summarized head tool results before the summary call", () => {
    let summaryPrompt = ""
    const large = "tool-output".repeat(60)
    return [
      Layer.mergeAll(
        ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:head")) }),
        modelLayer((options) => {
          summaryPrompt = Json.stringify(options.prompt.content)
          return Effect.succeed([{ type: "text", text: "summary" }])
        }),
      ),
      Effect.gen(function* () {
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
      }),
    ] as const
  })

  ItLayer.make(it, "truncate uses Tokenizer to keep the newest context", () => {
    const service = Compaction.truncate(2)
    return [
      Layer.mergeAll(
        Layer.succeed(
          Tokenizer.Tokenizer,
          Tokenizer.Tokenizer.of({
            tokenize: (input) => Effect.succeed(Prompt.make(input).content.map((_, index) => index)),
            truncate: (input, tokens) => Effect.succeed(Prompt.fromMessages(Prompt.make(input).content.slice(-tokens))),
          }),
        ),
        modelLayer(() => Effect.succeed([{ type: "text", text: "unused" }])),
      ),
      Effect.gen(function* () {
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
          const payload = Json.stringify(compacted.value.prompt.content)
          expect(payload).not.toContain("old")
          expect(payload).toContain("middle")
          expect(payload).toContain("new")
        }
      }),
    ] as const
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

  ItLayer.make(it, "applies a composed lossless tool-output bound before summarization", () => {
    let summaryCalls = 0
    const large = "bounded-output".repeat(40)
    const composed = Compaction.strategy([Compaction.toolOutputBound({ maxBytes: 12 })])
    const service = Compaction.make(composed, {
      contextWindow: 1_000,
      reserveTokens: 0,
      keepRecentTokens: 1,
    })
    return [
      Layer.mergeAll(
        ToolOutput.testLayer({ put: () => Effect.succeed(Option.some("mem:composed-bound")) }),
        modelLayer(() => {
          summaryCalls += 1
          return Effect.succeed([{ type: "text", text: "unexpected summary" }])
        }),
      ),
      Effect.gen(function* () {
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
          expect(Json.stringify(compacted.value.prompt.content)).toContain("mem:composed-bound")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "keeps retained tool results bounded after semantic summarization", () => {
    let stores = 0
    const paths = ["mem:retained-tool", "s3:retained-tool"]
    const envelope: ToolOutput.ToolOutput = {
      inline: { truncated: true, bytes: 1_000, maxBytes: 12, preview: '"retained-t' },
      outputPaths: paths,
    }
    const composed = Compaction.strategy([
      Compaction.toolOutputBound({ maxBytes: 12 }),
      Compaction.keepRecent({ tokens: 1 }),
    ])
    const service = Compaction.make(composed, { contextWindow: 1, reserveTokens: 0 })
    return [
      Layer.mergeAll(
        ToolOutput.testLayer({
          put: () => {
            stores += 1
            return Effect.succeed(Option.some("mem:retained-tool"))
          },
        }),
        modelLayer(() => Effect.succeed([{ type: "text", text: "checkpoint summary" }])),
      ),
      Effect.gen(function* () {
        const request: Compaction.Request = {
          agentName: "retained-tool-bound-agent",
          sessionId: "session",
          turn: 2,
          history: Prompt.empty,
          prompt: Prompt.make("continue"),
          path: [
            entry("0", user("old goal")),
            entry("1", assistantToolCall("call-retained")),
            entry("2", toolResult("call-retained", envelope)),
          ],
          usage: { contextTokens: 100, contextWindow: 1, reserveTokens: 0 },
          overflow: false,
        }
        const compacted = yield* service.maybeCompact(request)

        expect(Option.isSome(compacted)).toBe(true)
        expect(stores).toBe(0)
        if (Option.isNone(compacted)) return
        expect(compacted.value._tag).toBe("Summarize")
        if (compacted.value._tag !== "Summarize") return

        const retained = successfulToolResultValue(compacted.value.history)
        expect(outputPaths(retained)).toEqual(paths)

        const compactedAgain = yield* service.maybeCompact({
          ...request,
          history: compacted.value.history,
          path: [
            entry("0", user("checkpointed goal")),
            entry("1", assistantToolCall("call-retained")),
            entry("2", toolResult("call-retained", retained)),
          ],
        })

        expect(Option.isSome(compactedAgain)).toBe(true)
        expect(stores).toBe(0)
        if (Option.isSome(compactedAgain)) {
          expect(compactedAgain.value._tag).toBe("Summarize")
          expect(outputPaths(successfulToolResultValue(compactedAgain.value.history))).toEqual(paths)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "generates a validated structured summary and renders a deterministic checkpoint", () => {
    let objectName: string | undefined
    let toolChoice: string | object | undefined
    const composed = Compaction.strategy([
      Compaction.structuredSummary({ objectName: "AgentSummary" }),
      Compaction.keepRecent({ tokens: 1 }),
    ])
    const service = Compaction.make(composed, { contextWindow: 10, reserveTokens: 0 })
    return [
      modelLayer((options) => {
        objectName = options.responseFormat?.type === "json" ? options.responseFormat.objectName : undefined
        toolChoice = options.toolChoice
        return Effect.succeed([
          {
            type: "text",
            text: Json.stringify({
              goal: "Ship the strategy pack",
              facts: ["Baton uses Effect AI"],
              decisions: ["Keep string checkpoints"],
              openQuestions: ["None"],
              toolFindings: ["Tests are deterministic"],
            }),
          },
        ])
      }),
      Effect.gen(function* () {
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
          expect(Json.stringify(compacted.value.history.content)).toContain("recent tail")
        }
        expect(objectName).toBe("AgentSummary")
        expect(toolChoice).toBe("none")
      }),
    ] as const
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
