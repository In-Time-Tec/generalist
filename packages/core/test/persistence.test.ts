import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Layer, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"] = () => Effect.succeed([{ type: "text", text: "unused" }]),
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText,
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
    return Json.stringify(history.content)
  })

const systemMessageCount = (chatId: string) =>
  Effect.gen(function* () {
    const persistence = yield* Chat.Persistence
    const chat = yield* persistence.get(chatId)
    const history = yield* Ref.get(chat.history)
    return history.content.filter((message) => message.role === "system").length
  })

layer(unusedToolHandlerLayer)("Agent persistence", (it) => {
  ItLayer.make(
    it,
    "continuity: a second run sees the first run's user and assistant messages",
    () =>
      [
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
        Effect.gen(function* () {
          const agent = Agent.make({ name: "continuity-agent", instructions: "system seed" })

          yield* Stream.runDrain(
            Agent.persisted(agent, { prompt: "first user message", persistence: { chatId: "c1" } }),
          )
          yield* Stream.runDrain(
            Agent.persisted(agent, { prompt: "second user message", persistence: { chatId: "c1" } }),
          )

          const transcript = yield* historyText("c1")
          expect(transcript).toContain("first user message")
          expect(transcript).toContain("assistant reply 1")
          expect(transcript).toContain("second user message")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "system seeding: exactly one system message, not re-added on the second run",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "seed-agent", instructions: "the one system message" })

          yield* Stream.runDrain(Agent.persisted(agent, { prompt: "hello", persistence: { chatId: "seed" } }))
          const afterFirst = yield* systemMessageCount("seed")
          const firstTranscript = yield* historyText("seed")

          yield* Stream.runDrain(Agent.persisted(agent, { prompt: "again", persistence: { chatId: "seed" } }))
          const afterSecond = yield* systemMessageCount("seed")

          expect(afterFirst).toBe(1)
          expect(afterSecond).toBe(1)
          expect(firstTranscript).toContain("the one system message")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "isolation: distinct chatIds do not share history",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "isolation-agent", instructions: "system" })

          yield* Stream.runDrain(Agent.persisted(agent, { prompt: "message for A", persistence: { chatId: "a" } }))
          yield* Stream.runDrain(Agent.persisted(agent, { prompt: "message for B", persistence: { chatId: "b" } }))

          const a = yield* historyText("a")
          const b = yield* historyText("b")
          expect(a).toContain("message for A")
          expect(a).not.toContain("message for B")
          expect(b).toContain("message for B")
          expect(b).not.toContain("message for A")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "structured output is saved in persisted chat history",
    () =>
      [
        Layer.mergeAll(
          modelLayer(
            () => assistantText("structured-text", "normal answer"),
            () => Effect.succeed([{ type: "text", text: '{"value":"persisted"}' }]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "structured-persistence-agent" })
          const result = yield* Agent.generatePersistedObject(agent, {
            prompt: "persist a structured answer",
            persistence: { chatId: "structured" },
            schema: Schema.Struct({ value: Schema.String }),
          })

          expect(result.value).toEqual({ value: "persisted" })
          const transcript = yield* historyText("structured")
          expect(transcript).toContain("persist a structured answer")
          expect(transcript).toContain("persisted")
        }),
      ] as const,
  )

  ItLayer.make(it, "does not create a persisted chat when its resume checkpoint is missing", () => {
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("must not run"))
        }),
        unusedExecutor,
        Approvals.testLayer({ check: () => Effect.die("authorization must not run") }),
        ModelMiddleware.identityLayer,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "missing-persisted-checkpoint-agent", toolkit: Toolkit.make(echoTool) })
        const suspension = AgentEvent.AgentSuspended.make({
          token: "missing-token",
          reason: "approval",
          tool_call_id: "missing-call",
          tool_name: "echo",
          tool_params: { text: "missing" },
          active_tools: ["echo"],
          activated_skills: [],
        })

        const mismatch = yield* Agent.persisted(agent, {
          prompt: "ignored",
          persistence: { chatId: "missing-resume-chat" },
          resume: { suspension },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(mismatch).toMatchObject({
          _tag: "@batonfx/core/ResumeMismatch",
          reason: "checkpoint-not-found",
          received: suspension,
        })
        expect(modelCalls).toBe(0)
        const persistence = yield* Chat.Persistence
        const missing = yield* persistence.get("missing-resume-chat").pipe(Effect.flip)
        expect(missing._tag).toBe("ChatNotFoundError")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "suspend/save: a suspended run persists the pending tool call and resumes from stored context",
    () => {
      let calls = 0
      let suspendedExecutions = 0
      let resumeSawStoredContext = false
      return [
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
            const content = Json.stringify(options.prompt.content)
            resumeSawStoredContext =
              content.includes("please wait") && content.includes("ordinary complete") && content.includes("echoed")
            return Stream.make(textDelta("done after resume"))
          }),
          ToolExecutor.testLayer({
            execute: (request) => {
              if (request.call.id === "tool-call-ordinary") {
                return Effect.succeed({
                  _tag: "Success",
                  result: { text: "ordinary complete" },
                  encodedResult: { text: "ordinary complete" },
                })
              }
              suspendedExecutions += 1
              return suspendedExecutions === 1
                ? Effect.succeed({ _tag: "Suspend", token: "wait-token" })
                : Effect.succeed({
                    _tag: "Success",
                    result: { echoed: request.call.params },
                    encodedResult: { echoed: request.call.params },
                  })
            },
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({
            name: "suspend-agent",
            instructions: "system",
            toolkit: Toolkit.make(echoTool),
          })

          const failure = yield* Effect.flip(
            Stream.runDrain(Agent.persisted(agent, { prompt: "please wait", persistence: { chatId: "s1" } })),
          )

          expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
          if (failure._tag !== "@batonfx/core/AgentSuspended") return expect.unreachable()
          const suspendedTranscript = yield* historyText("s1")
          // The assistant turn carrying the pending tool call survived to the store.
          expect(suspendedTranscript).toContain("tool-call-suspend")
          expect(suspendedTranscript).toContain("tool-call-ordinary")
          expect(suspendedTranscript).toContain("ordinary complete")

          const mismatch = yield* Agent.persisted(agent, {
            prompt: "ignored",
            persistence: { chatId: "s1" },
            resume: {
              suspension: AgentEvent.AgentSuspended.make({ ...failure, token: "stale-token" }),
            },
          }).pipe(Stream.runDrain, Effect.flip)

          expect(mismatch._tag).toBe("@batonfx/core/ResumeMismatch")
          expect(yield* historyText("s1")).toBe(suspendedTranscript)
          expect(suspendedExecutions).toBe(1)

          const events = yield* Stream.runCollect(
            Agent.persisted(agent, {
              prompt: "ignored",
              persistence: { chatId: "s1" },
              resume: { suspension: failure },
            }),
          )

          expect(events.at(-1)?._tag).toBe("Completed")
          expect(resumeSawStoredContext).toBe(true)
          const completedTranscript = yield* historyText("s1")
          const duplicate = yield* Agent.persisted(agent, {
            prompt: "ignored",
            persistence: { chatId: "s1" },
            resume: { suspension: failure },
          }).pipe(Stream.runDrain, Effect.flip)

          expect(duplicate).toMatchObject({
            _tag: "@batonfx/core/ResumeMismatch",
            reason: "checkpoint-not-found",
            received: failure,
          })
          expect(yield* historyText("s1")).toBe(completedTranscript)
          expect(suspendedExecutions).toBe(2)
          expect(calls).toBe(2)
        }),
      ] as const
    },
  )
})
