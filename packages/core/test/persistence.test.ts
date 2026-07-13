import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const echoTool = Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const unusedExecutor = ToolExecutor.testLayer({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

// A full text-start/delta/end sequence — required for `Chat` to assemble the
// streamed deltas into a recorded assistant message in stored history.
const assistantText = (id: string, text: string) =>
  Stream.fromIterable([
    Response.makePart("text-start", { id }),
    Response.makePart("text-delta", { id, delta: text }),
    Response.makePart("text-end", { id }),
  ])

// `Chat.layerPersisted` over an in-memory backing store — the standalone,
// memory-backed persistence stack the issue prescribes for tests.
const persistenceLayer = Chat.layerPersisted({ storeId: "test" }).pipe(Layer.provide(Persistence.layerBackingMemory))

// Text-content of every message/part serialized, so assertions can look for a
// substring anywhere in the persisted transcript.
const historyText = (chatId: string) =>
  Effect.gen(function* () {
    const persistence = yield* Chat.Persistence
    const chat = yield* persistence.get(chatId)
    const history = yield* Ref.get(chat.history)
    return JSON.stringify(history.content)
  })

const systemMessageCount = (chatId: string) =>
  Effect.gen(function* () {
    const persistence = yield* Chat.Persistence
    const chat = yield* persistence.get(chatId)
    const history = yield* Ref.get(chat.history)
    return history.content.filter((message) => message.role === "system").length
  })

layer(unusedToolHandlerLayer)("Agent persistence", (it) => {
  it.effect("continuity: a second run sees the first run's user and assistant messages", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "continuity-agent", instructions: "system seed" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "first user message", persistence: { chatId: "c1" } }))
      yield* Stream.runDrain(Agent.stream(agent, { prompt: "second user message", persistence: { chatId: "c1" } }))

      const transcript = yield* historyText("c1")
      expect(transcript).toContain("first user message")
      expect(transcript).toContain("assistant reply 1")
      expect(transcript).toContain("second user message")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          (() => {
            let calls = 0
            return modelLayer(() => {
              calls += 1
              return assistantText(`reply-${calls}`, `assistant reply ${calls}`)
            })
          })(),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
      ),
    ),
  )

  it.effect("system seeding: exactly one system message, not re-added on the second run", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "seed-agent", instructions: "the one system message" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello", persistence: { chatId: "seed" } }))
      const afterFirst = yield* systemMessageCount("seed")
      const firstTranscript = yield* historyText("seed")

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "again", persistence: { chatId: "seed" } }))
      const afterSecond = yield* systemMessageCount("seed")

      expect(afterFirst).toBe(1)
      expect(afterSecond).toBe(1)
      expect(firstTranscript).toContain("the one system message")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
      ),
    ),
  )

  it.effect("isolation: distinct chatIds do not share history", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "isolation-agent", instructions: "system" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "message for A", persistence: { chatId: "a" } }))
      yield* Stream.runDrain(Agent.stream(agent, { prompt: "message for B", persistence: { chatId: "b" } }))

      const a = yield* historyText("a")
      const b = yield* historyText("b")
      expect(a).toContain("message for A")
      expect(a).not.toContain("message for B")
      expect(b).toContain("message for B")
      expect(b).not.toContain("message for A")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
      ),
    ),
  )

  it.effect("missing service: persistence set without Chat.Persistence fails and never calls the model", () => {
    let called = false
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "missing-agent", instructions: "system" })

      const failure = yield* Effect.flip(
        Stream.runDrain(Agent.stream(agent, { prompt: "hi", persistence: { chatId: "missing" } })),
      )

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("Chat.Persistence")
      expect(called).toBe(false)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            called = true
            return Stream.make(textDelta("should not run"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("mutual exclusivity: history + persistence fails typed", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "exclusive-agent", instructions: "system" })

      const failure = yield* Effect.flip(
        Stream.runDrain(
          Agent.stream(agent, {
            prompt: "hi",
            history: [{ role: "user", content: [{ type: "text", text: "prior" }] }],
            persistence: { chatId: "x" },
          }),
        ),
      )

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("mutually exclusive")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("unused"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
      ),
    ),
  )

  it.effect("suspend/save: a suspended run persists the pending tool call and resumes from stored context", () => {
    let calls = 0
    let resumeSawStoredContext = false
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "suspend-agent",
        instructions: "system",
        toolkit: Toolkit.make(echoTool),
      })

      const failure = yield* Effect.flip(
        Stream.runDrain(Agent.stream(agent, { prompt: "please wait", persistence: { chatId: "s1" } })),
      )

      expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
      const suspendedTranscript = yield* historyText("s1")
      // The assistant turn carrying the pending tool call survived to the store.
      expect(suspendedTranscript).toContain("tool-call-suspend")
      expect(suspendedTranscript).toContain("tool-call-ordinary")
      expect(suspendedTranscript).toContain("ordinary complete")

      const events = yield* Stream.runCollect(
        Agent.stream(agent, {
          prompt: "ignored",
          persistence: { chatId: "s1" },
          resume: { call: { id: "tool-call-suspend", name: "echo", params: { text: "resumed" } } },
        }),
      )

      expect(events.at(-1)?._tag).toBe("Completed")
      expect(resumeSawStoredContext).toBe(true)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.fromIterable([
                toolCallPart("tool-call-ordinary", "echo", { text: "ordinary" }),
                toolCallPart("tool-call-suspend", "echo", { text: "hold" }),
              ])
            }
            // After resume, the model turn runs on the persisted chat and must
            // see the earlier user message from stored context.
            const content = JSON.stringify(options.prompt.content)
            resumeSawStoredContext =
              content.includes("please wait") && content.includes("ordinary complete") && content.includes("resumed")
            return Stream.make(textDelta("done after resume"))
          }),
          ToolExecutor.testLayer({
            execute: (request) =>
              request.call.id === "tool-call-ordinary"
                ? Effect.succeed({
                    _tag: "Success",
                    result: { text: "ordinary complete" },
                    encodedResult: { text: "ordinary complete" },
                  })
                : request.call.id === "tool-call-suspend" && JSON.stringify(request.call.params).includes("hold")
                  ? Effect.succeed({ _tag: "Suspend", token: "wait-token" })
                  : Effect.succeed({
                      _tag: "Success",
                      result: { echoed: request.call.params },
                      encodedResult: { echoed: request.call.params },
                    }),
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
      ),
    )
  })
})
