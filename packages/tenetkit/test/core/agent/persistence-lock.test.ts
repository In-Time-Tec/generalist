import { expect, layer } from "@effect/vitest"
import { Json } from "../json.js"
import { Deferred, Effect, Fiber, Layer, Option, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import {
  Agent,
  AgentEvent,
  Approvals,
  Compaction,
  Instructions,
  ModelMiddleware,
  Session,
  ToolExecutor,
} from "../../../src/core/index"
import { unusedToolHandlerLayer } from "../tool-handler-layer.js"
import { ItLayer } from "../it-layer.js"
import { withProviderFinish } from "../provider-finish.js"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const conversation = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.Message> =>
  prompt.content.filter((message) => message.role !== "system")

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"] = () => Effect.succeed([{ type: "text", text: "unused" }]),
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText,
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const echoTool = Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const unusedExecutor = ToolExecutor.layerTest({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: Schema.Json) =>
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

const toolResultIds = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "tool" ? message.content.flatMap((part) => (part.type === "tool-result" ? [part.id] : [])) : [],
  )

const systemMessageCount = (chatId: string) =>
  Effect.gen(function* () {
    const persistence = yield* Chat.Persistence
    const chat = yield* persistence.get(chatId)
    const history = yield* Ref.get(chat.history)
    return history.content.filter((message) => message.role === "system").length
  })

layer(Layer.mergeAll(unusedToolHandlerLayer, Agent.layerRuntime))("Agent persistence", (it) => {
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
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "continuity-agent", instructions: "system seed" })

          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "first user message", sessionId: "c1", persistence: { chatId: "c1" } }),
          )
          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "second user message", sessionId: "c1", persistence: { chatId: "c1" } }),
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
    "Session continues sequential runs without Compaction and re-derives only the current system prompt",
    () => {
      const requests: Array<Prompt.Prompt> = []
      let currentSystem = "system revision 1"
      let calls = 0
      return [
        Layer.mergeAll(
          modelLayer((options) => {
            requests.push(options.prompt)
            calls += 1
            return assistantText(`session-reply-${calls}`, `session reply ${calls}`)
          }),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          Instructions.layer([
            {
              id: "current",
              render: () => Effect.succeedSome(currentSystem),
            },
          ]),
          Session.layerMemory,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "session-authority-agent" })
          yield* Stream.runDrain(Agent.stream(agent, { prompt: "session user 1", sessionId: "shared-session" }))
          currentSystem = "system revision 2"
          yield* Stream.runDrain(Agent.stream(agent, { prompt: "session user 2", sessionId: "shared-session" }))
          currentSystem = "system revision 3"
          yield* Stream.runDrain(Agent.stream(agent, { prompt: "session user 3", sessionId: "shared-session" }))

          expect(requests).toHaveLength(3)
          expect(Json.stringify(requests[1]!.content)).toContain("session user 1")
          expect(Json.stringify(requests[1]!.content)).toContain("session reply 1")
          expect(Json.stringify(requests[2]!.content)).toContain("session user 2")
          expect(Json.stringify(requests[2]!.content)).toContain("session reply 2")
          expect(Json.stringify(requests[0]!.content)).toContain("system revision 1")
          expect(Json.stringify(requests[1]!.content)).toContain("system revision 2")
          expect(Json.stringify(requests[1]!.content)).not.toContain("system revision 1")
          expect(Json.stringify(requests[2]!.content)).toContain("system revision 3")
          expect(Json.stringify(requests[2]!.content)).not.toContain("system revision 2")

          const projection = yield* Effect.scoped(
            Session.acquire("shared-session").pipe(
              Effect.flatMap((session) => session.path()),
              Effect.map(Session.buildContext),
            ),
          )
          expect(projection.content).toHaveLength(6)
          expect(projection.content.every((message) => message.role !== "system")).toBe(true)
        }),
      ] as const
    },
  )

  ItLayer.make(
    it,
    "system seeding: exactly one system message, not re-added on the second run",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "seed-agent", instructions: "the one system message" })

          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "hello", sessionId: "seed", persistence: { chatId: "seed" } }),
          )
          const afterFirst = yield* systemMessageCount("seed")
          const firstTranscript = yield* historyText("seed")

          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "again", sessionId: "seed", persistence: { chatId: "seed" } }),
          )
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
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "isolation-agent", instructions: "system" })

          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "message for A", sessionId: "a", persistence: { chatId: "a" } }),
          )
          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "message for B", sessionId: "b", persistence: { chatId: "b" } }),
          )

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
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          Session.layerMemory,
          Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "structured-persistence-agent" })
          const result = yield* Agent.generate(agent, {
            prompt: "persist a structured answer",
            sessionId: "structured",
            persistence: { chatId: "structured" },
            output: { schema: Schema.Struct({ value: Schema.String }) },
          })

          expect(result.value).toEqual({ value: "persisted" })
          const transcript = yield* historyText("structured")
          expect(transcript).toContain("persist a structured answer")
          expect(transcript).toContain("persisted")
          const persistence = yield* Chat.Persistence
          const chat = yield* persistence.get("structured")
          const history = yield* Ref.get(chat.history)
          const sessionContext = yield* Effect.scoped(
            Session.acquire("structured").pipe(
              Effect.flatMap((session) => session.path()),
              Effect.map(Session.buildContext),
            ),
          )
          expect(sessionContext.content).toEqual(conversation(history))
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "multi-text-part provider input remains durable across persisted Chat normalization",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("ok"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          Session.layerMemory,
          Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "multipart-agent", instructions: "system" })
          yield* Stream.runDrain(
            Agent.stream(agent, {
              prompt: [
                Prompt.makeMessage("user", {
                  content: [
                    Prompt.makePart("text", { text: "PROMPT" }),
                    Prompt.makePart("text", { text: "\n\n<resolved-context>\nguidance\n</resolved-context>" }),
                  ],
                }),
              ],
              sessionId: "multipart",
              persistence: { chatId: "multipart" },
            }),
          )
          const transcript = yield* historyText("multipart")
          expect(transcript).toContain("PROMPT")
          expect(transcript).toContain("resolved-context")

          const persistence = yield* Chat.Persistence
          const chat = yield* persistence.get("multipart")
          const history = yield* Ref.get(chat.history)
          const sessionContext = yield* Effect.scoped(
            Session.acquire("multipart").pipe(
              Effect.flatMap((session) => session.path()),
              Effect.map(Session.buildContext),
            ),
          )
          expect(sessionContext.content).toEqual(conversation(history))

          // A second turn must rebuild from the provider-facing Session without a prefix conflict.
          yield* Stream.runDrain(
            Agent.stream(agent, { prompt: "follow up", sessionId: "multipart", persistence: { chatId: "multipart" } }),
          )
          expect(yield* historyText("multipart")).toContain("follow up")
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
        Approvals.layerTest({ resolve: () => Effect.die("authorization must not run") }),
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "missing-persisted-checkpoint-agent", toolkit: Toolkit.make(echoTool) })
        const missingCall = toolCallPart("missing-call", "echo", { text: "missing" })
        const suspension = AgentEvent.AgentSuspended.make({
          token: "missing-token",
          reason: "approval",
          tool_call_id: "missing-call",
          tool_name: "echo",
          tool_params: { text: "missing" },
          tool_call_batch: [missingCall],
          active_tools: ["echo"],
          activated_skills: [],
        })

        const mismatch = yield* Agent.stream(agent, {
          prompt: "ignored",
          sessionId: "missing-resume-chat",
          persistence: { chatId: "missing-resume-chat" },
          resume: { suspension },
        }).pipe(Stream.runDrain, Effect.flip)

        expect(mismatch).toMatchObject({
          _tag: "tenetkit/core/ResumeMismatch",
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

  ItLayer.make(it, "does not persist structured output before its Session checkpoint", () => {
    const sessionLayer = Layer.effect(
      Session.SessionDirectory,
      Ref.make<ReadonlyArray<Session.Entry>>([]).pipe(
        Effect.map((entries) =>
          Session.SessionDirectory.of({
            acquire: () =>
              Effect.succeed({
                reserveEntryId: Effect.succeed("unused"),
                append: (input) =>
                  input._tag === "Message" && Json.stringify(input.message).includes(Agent.defaultObjectPrompt)
                    ? Effect.fail(Session.SessionStoreError.make({ message: "structured append failed" }))
                    : Ref.modify(entries, (path) => {
                        const entry: Session.Entry = {
                          ...input,
                          id: String(path.length),
                          parentId: path.at(-1)?.id ?? null,
                        }
                        return [entry, [...path, entry]] as const
                      }),
                appendCheckpoint: () =>
                  Effect.fail(Session.SessionStoreError.make({ message: "structured checkpoint failed" })),
                path: () => Ref.get(entries),
                setLeaf: () => Effect.void,
                leaf: Ref.get(entries).pipe(Effect.map((path) => path.at(-1)?.id ?? null)),
              }),
          }),
        ),
      ),
    )
    return [
      Layer.mergeAll(
        modelLayer(
          () => assistantText("structured-failure-text", "normal answer"),
          () => Effect.succeed([{ type: "text", text: '{"value":"must not persist"}' }]),
        ),
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        sessionLayer,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const failure = yield* Agent.generate(Agent.make({ name: "structured-failure-agent" }), {
          prompt: "structured failure",
          sessionId: "structured-failure",
          persistence: { chatId: "structured-failure" },
          output: { schema: Schema.Struct({ value: Schema.String }) },
        }).pipe(Effect.flip)
        const transcript = yield* historyText("structured-failure")

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(transcript).toContain("normal answer")
        expect(transcript).not.toContain(Agent.defaultObjectPrompt)
        expect(transcript).not.toContain("must not persist")
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints concurrent sibling results before suspension and resumes only unresolved calls", () => {
    const callIds = [
      "tool-call-suspend",
      "tool-call-ordinary-1",
      "tool-call-ordinary-2",
      "tool-call-ordinary-3",
      "tool-call-ordinary-4",
      "tool-call-ordinary-5",
      "tool-call-ordinary-6",
    ] as const
    const resultOrder = [
      "tool-call-ordinary-1",
      "tool-call-ordinary-2",
      "tool-call-ordinary-3",
      "tool-call-suspend",
      "tool-call-ordinary-4",
      "tool-call-ordinary-5",
      "tool-call-ordinary-6",
    ] as const
    const executions = new Map<string, number>()
    const starts: Array<string> = []
    const interruptions: Array<string> = []
    let earlyCompleted: Deferred.Deferred<void> | undefined
    let earlyCompletions = 0
    let resuming = false
    let modelCalls = 0
    let nextModelResultIds: ReadonlyArray<string> = []
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable(callIds.map((id) => toolCallPart(id, "echo", { text: id })))
          }
          nextModelResultIds = toolResultIds(options.prompt)
          return Stream.make(textDelta("done after resume"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.gen(function* () {
              const id = request.call.id
              const attempt = (executions.get(id) ?? 0) + 1
              executions.set(id, attempt)
              starts.push(id)
              if (id === "tool-call-suspend" && attempt === 1) {
                if (earlyCompleted === undefined) return yield* Effect.die("missing execution barrier")
                yield* Deferred.await(earlyCompleted)
                yield* Effect.yieldNow
                yield* Effect.yieldNow
                return { _tag: "Suspend" as const, token: "wait-token" }
              }
              if (["tool-call-ordinary-1", "tool-call-ordinary-2", "tool-call-ordinary-3"].includes(id)) {
                earlyCompletions += 1
                if (earlyCompletions === 3 && earlyCompleted !== undefined) {
                  yield* Deferred.succeed(earlyCompleted, undefined)
                }
              } else if (!resuming) {
                return yield* Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => interruptions.push(id))))
              }
              return { _tag: "Success" as const, result: id, encodedResult: id }
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        Session.layerMemory,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        earlyCompleted = yield* Deferred.make<void>()
        const agent = Agent.make({
          name: "suspend-agent",
          instructions: "system",
          toolkit: Toolkit.make(echoTool),
          toolScheduling: { maxConcurrency: 4, parallelSafe: ["echo"] },
        })

        const failure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(agent, { prompt: "please wait", sessionId: "s1", persistence: { chatId: "s1" } }),
          ),
        )

        expect(failure._tag).toBe("tenetkit/core/AgentSuspended")
        if (failure._tag !== "tenetkit/core/AgentSuspended") return expect.unreachable()
        resuming = true
        const persistence = yield* Chat.Persistence
        const suspendedChat = yield* persistence.get("s1")
        const suspendedHistory = yield* Ref.get(suspendedChat.history)
        const sessionPath = yield* Effect.scoped(
          Session.acquire("s1").pipe(Effect.flatMap((session) => session.path())),
        )
        expect(starts).toEqual(callIds.slice(0, 4))
        expect(interruptions).toEqual([])
        expect(toolResultIds(suspendedHistory)).toEqual([
          "tool-call-ordinary-1",
          "tool-call-ordinary-2",
          "tool-call-ordinary-3",
        ])
        expect(Session.buildContext(sessionPath).content).toEqual(conversation(suspendedHistory))

        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "ignored",
            sessionId: "s1",
            persistence: { chatId: "s1" },
            resume: { suspension: failure },
          }),
        )

        expect(events.at(-1)?._tag).toBe("Completed")
        expect(nextModelResultIds).toEqual(resultOrder)
        expect(executions).toEqual(new Map(callIds.map((id) => [id, id === "tool-call-suspend" ? 2 : 1])))
        const completedChat = yield* persistence.get("s1")
        const completedHistory = yield* Ref.get(completedChat.history)
        expect(toolResultIds(completedHistory)).toEqual(resultOrder)
        const completedSessionPath = yield* Effect.scoped(
          Session.acquire("s1").pipe(Effect.flatMap((session) => session.path())),
        )
        expect(Session.buildContext(completedSessionPath).content).toEqual(conversation(completedHistory))
        expect(modelCalls).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "checkpoints a changed token when a persisted call re-suspends", () => {
    let executions = 0
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(toolCallPart("re-suspend-call", "echo", { text: "wait" }))
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: () => {
            executions += 1
            return executions < 3
              ? Effect.succeed({ _tag: "Suspend", token: `wait-${executions}` })
              : Effect.succeed({ _tag: "Success", result: "done", encodedResult: "done" })
          },
        }),
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        Session.layerMemory,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "re-suspend-agent", toolkit: Toolkit.make(echoTool) })
        const first = yield* Agent.stream(agent, {
          prompt: "suspend twice",
          sessionId: "re-suspend",
          persistence: { chatId: "re-suspend" },
        }).pipe(Stream.runDrain, Effect.flip)
        if (first._tag !== "tenetkit/core/AgentSuspended") return expect.unreachable()

        const second = yield* Agent.stream(agent, {
          prompt: "ignored",
          sessionId: "re-suspend",
          persistence: { chatId: "re-suspend" },
          resume: { suspension: first },
        }).pipe(Stream.runDrain, Effect.flip)
        if (second._tag !== "tenetkit/core/AgentSuspended") return expect.unreachable()

        const persistence = yield* Chat.Persistence
        const chat = yield* persistence.get("re-suspend")
        const history = yield* Ref.get(chat.history)
        const sessionPath = yield* Effect.scoped(
          Session.acquire("re-suspend").pipe(Effect.flatMap((session) => session.path())),
        )
        expect(second.token).toBe("wait-2")
        expect(Session.buildContext(sessionPath).content).toEqual(conversation(history))

        yield* Agent.stream(agent, {
          prompt: "ignored",
          sessionId: "re-suspend",
          persistence: { chatId: "re-suspend" },
          resume: { suspension: second },
        }).pipe(Stream.runDrain)
        expect(executions).toBe(3)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects a stale resume without applying a Session checkpoint ahead of persisted Chat", () => {
    let modelCalls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("must not run"))
        }),
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const persistence = yield* Chat.Persistence
        yield* persistence.getOrCreate("stale-recovery")
        const call = Prompt.makePart("tool-call", {
          id: "stale-recovery-call",
          name: "echo",
          params: { text: "stale" },
          providerExecuted: false,
          options: {
            "tenetkit/suspension": {
              token: "authoritative-token",
              reason: "tool-wait",
              tool_call_batch_ids: ["stale-recovery-call"],
            },
          },
        })
        yield* Effect.scoped(
          Effect.gen(function* () {
            const session = yield* Session.acquire("stale-recovery")
            yield* session.appendCheckpoint({
              id: yield* session.reserveEntryId,
              parentId: null,
              projectedHistory: Prompt.fromMessages([Prompt.makeMessage("assistant", { content: [call] })]),
              telemetry: [],
            })
          }),
        )
        const received = AgentEvent.AgentSuspended.make({
          token: "stale-token",
          reason: "tool-wait",
          tool_call_id: call.id,
          tool_name: call.name,
          tool_params: call.params,
          tool_call_batch: [
            Response.makePart("tool-call", {
              id: call.id,
              name: call.name,
              params: call.params,
              providerExecuted: false,
            }),
          ],
        })

        const mismatch = yield* Agent.stream(
          Agent.make({ name: "stale-recovery-agent", toolkit: Toolkit.make(echoTool) }),
          {
            prompt: "ignored",
            sessionId: "stale-recovery",
            persistence: { chatId: "stale-recovery" },
            resume: { suspension: received },
          },
        ).pipe(Stream.runDrain, Effect.flip)
        const stored = yield* persistence.get("stale-recovery")
        const history = yield* Ref.get(stored.history)

        expect(mismatch).toMatchObject({
          _tag: "tenetkit/core/ResumeMismatch",
          reason: "identity-mismatch",
          received,
        })
        expect(history.content).toEqual([])
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "does not commit Chat before a failed Session compaction append", () => {
    const failedCheckpointPersistence = Layer.effect(
      Chat.Persistence,
      Chat.fromPrompt(Prompt.make("original history")).pipe(
        Effect.map((chat) => {
          const persisted: Chat.Persisted = { ...chat, id: "checkpoint-append-failure", save: Effect.void }
          return Chat.Persistence.of({
            get: () => Effect.succeed(persisted),
            getOrCreate: () => Effect.succeed(persisted),
          })
        }),
      ),
    )
    const originalHistoryEntry: Session.MessageEntry = {
      _tag: "Message",
      id: "original-history",
      parentId: null,
      message: Prompt.make("original history").content[0]!,
    }
    const sessionLayer = Layer.effect(
      Session.SessionDirectory,
      Ref.make<ReadonlyArray<Session.Entry>>([originalHistoryEntry]).pipe(
        Effect.map((entries) =>
          Session.SessionDirectory.of({
            acquire: () =>
              Effect.succeed({
                reserveEntryId: Effect.succeed("checkpoint-0"),
                append: (input) =>
                  Ref.modify(entries, (path) => {
                    const entry: Session.Entry = {
                      ...input,
                      id: String(path.length),
                      parentId: path.at(-1)?.id ?? null,
                    }
                    return [entry, [...path, entry]] as const
                  }),
                appendCheckpoint: () =>
                  Effect.fail(Session.SessionStoreError.make({ message: "checkpoint append failed" })),
                path: () => Ref.get(entries),
                setLeaf: () => Effect.void,
                leaf: Ref.get(entries).pipe(Effect.map((path) => path.at(-1)?.id ?? null)),
              }),
          }),
        ),
      ),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.die("model must not run after checkpoint failure")),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.succeed(
              Option.some({
                _tag: "Summarize" as const,
                history: Prompt.make("committed too early"),
                prompt: Prompt.make("retry prompt"),
                summary: "summary",
              }),
            ).pipe(Compaction.withLifecycle(request)),
        }),
        sessionLayer,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        failedCheckpointPersistence,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "checkpoint-append-failure-agent", instructions: "system seed" })

        const failure = yield* Agent.stream(agent, {
          prompt: "never sent",
          sessionId: "checkpoint-append-failure",
          persistence: { chatId: "checkpoint-append-failure" },
        }).pipe(Stream.runDrain, Effect.flip)
        const transcript = yield* historyText("checkpoint-append-failure")

        expect(failure._tag).toBe("tenetkit/core/AgentError")
        expect(transcript).toContain("original history")
        expect(transcript).not.toContain("committed too early")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "synchronizes Session when a duplicate tool call id terminates a persisted run",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() =>
            Stream.make(
              toolCallPart("duplicate-persisted", "echo", { text: "first" }),
              toolCallPart("duplicate-persisted", "echo", { text: "second" }),
            ),
          ),
          Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
          Session.layerMemory,
          ToolExecutor.layerTest({
            execute: () => Effect.succeed({ _tag: "Success", result: "done", encodedResult: "done" }),
          }),
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          persistenceLayer,
        ),
        Effect.gen(function* () {
          const failure = yield* Agent.stream(
            Agent.make({ name: "duplicate-persisted-agent", toolkit: Toolkit.make(echoTool) }),
            {
              prompt: "duplicate",
              sessionId: "duplicate-persisted",
              persistence: { chatId: "duplicate-persisted" },
            },
          ).pipe(Stream.runDrain, Effect.flip)
          const persistence = yield* Chat.Persistence
          const chat = yield* persistence.get("duplicate-persisted")
          const history = yield* Ref.get(chat.history)
          const sessionPath = yield* Effect.scoped(
            Session.acquire("duplicate-persisted").pipe(Effect.flatMap((session) => session.path())),
          )

          expect(failure._tag).toBe("tenetkit/core/DuplicateToolCallId")
          const projection = Session.buildContext(sessionPath)
          expect(Json.stringify(projection.content)).toContain("duplicate")
          expect(conversation(history)).toEqual([])
        }),
      ] as const,
  )

  ItLayer.make(it, "serializes concurrent compaction checkpoints for one persisted Chat", () => {
    let firstEntered: Deferred.Deferred<void> | undefined
    let releaseFirst: Deferred.Deferred<void> | undefined
    let calls = 0
    let active = 0
    let maxActive = 0
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.gen(function* () {
              calls += 1
              active += 1
              maxActive = Math.max(maxActive, active)
              if (calls === 1) {
                if (firstEntered === undefined || releaseFirst === undefined) {
                  return yield* Effect.die("missing compaction barriers")
                }
                yield* Deferred.succeed(firstEntered, undefined)
                yield* Deferred.await(releaseFirst)
              }
              return Option.some({
                _tag: "Microcompact" as const,
                history: request.history,
                prompt: Prompt.concat(request.prompt, Prompt.make("serialized compaction")),
              })
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  active -= 1
                }),
              ),
              Compaction.withLifecycle(request),
            ),
        }),
        Session.layerMemory,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        firstEntered = yield* Deferred.make<void>()
        releaseFirst = yield* Deferred.make<void>()
        const firstAgent = Agent.make({ name: "first-concurrent-checkpoint-agent" })
        const secondAgent = Agent.make({ name: "second-concurrent-checkpoint-agent" })
        const first = yield* Effect.forkChild(
          Stream.runDrain(
            Agent.stream(firstAgent, {
              prompt: "first concurrent",
              sessionId: "concurrent",
              persistence: { chatId: "concurrent" },
            }),
          ),
          { startImmediately: true },
        )
        yield* Deferred.await(firstEntered)
        const second = yield* Effect.forkChild(
          Stream.runDrain(
            Agent.stream(secondAgent, {
              prompt: "second concurrent",
              sessionId: "concurrent",
              persistence: { chatId: "concurrent" },
            }),
          ),
          { startImmediately: true },
        )
        yield* Effect.yieldNow
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(second)

        const persistence = yield* Chat.Persistence
        const chat = yield* persistence.get("concurrent")
        const live = yield* Ref.get(chat.history)
        const path = yield* Effect.scoped(
          Session.acquire("concurrent").pipe(Effect.flatMap((session) => session.path())),
        )

        expect(calls).toBe(2)
        expect(maxActive).toBe(1)
        expect(Session.buildContext(path).content).toEqual(live.content)
        expect(path.filter((entry) => entry._tag === "Compaction")).toHaveLength(2)
      }),
    ] as const
  })

  ItLayer.make(it, "releases the persisted Chat lock when compaction is interrupted", () => {
    let firstEntered: Deferred.Deferred<void> | undefined
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Compaction.layerTest({
          maybeCompact: () =>
            Effect.gen(function* () {
              calls += 1
              if (calls === 1) {
                if (firstEntered === undefined) return yield* Effect.die("missing compaction barrier")
                yield* Deferred.succeed(firstEntered, undefined)
                return yield* Effect.never
              }
              return Option.none()
            }),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        firstEntered = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "interrupted-checkpoint-agent" })
        const first = yield* Effect.forkChild(
          Stream.runDrain(
            Agent.stream(agent, {
              prompt: "interrupted",
              sessionId: "interrupted",
              persistence: { chatId: "interrupted" },
            }),
          ),
          { startImmediately: true },
        )
        yield* Deferred.await(firstEntered)
        yield* Fiber.interrupt(first)
        yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "completed",
            sessionId: "interrupted",
            persistence: { chatId: "interrupted" },
          }),
        )

        expect(calls).toBe(2)
        expect(yield* historyText("interrupted")).toContain("completed")
      }),
    ] as const
  })

  ItLayer.make(it, "releases RcMap references when a persisted run is interrupted while waiting", () => {
    let firstEntered: Deferred.Deferred<void> | undefined
    let releaseFirst: Deferred.Deferred<void> | undefined
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Compaction.layerTest({
          maybeCompact: () =>
            Effect.gen(function* () {
              calls += 1
              if (calls === 1) {
                if (firstEntered === undefined || releaseFirst === undefined) {
                  return yield* Effect.die("missing compaction barriers")
                }
                yield* Deferred.succeed(firstEntered, undefined)
                yield* Deferred.await(releaseFirst)
              }
              return Option.none()
            }),
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        firstEntered = yield* Deferred.make<void>()
        releaseFirst = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "waiting-interruption-agent" })
        const first = yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "first",
            sessionId: "waiting-interruption",
            persistence: { chatId: "waiting-interruption" },
          }),
        ).pipe(Effect.forkChild)
        yield* Deferred.await(firstEntered)
        const waiting = yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "waiting",
            sessionId: "waiting-interruption",
            persistence: { chatId: "waiting-interruption" },
          }),
        ).pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Fiber.interrupt(waiting)
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Fiber.join(first)
        yield* Stream.runDrain(
          Agent.stream(agent, {
            prompt: "third",
            sessionId: "waiting-interruption",
            persistence: { chatId: "waiting-interruption" },
          }),
        )

        expect(calls).toBe(2)
        expect(yield* historyText("waiting-interruption")).toContain("third")
      }),
    ] as const
  })

  ItLayer.make(it, "recovers after interruption while reading an appended checkpoint", () => {
    let pathEntered: Deferred.Deferred<void> | undefined
    let blockCheckpointPath = true
    let compactionCalls = 0
    let committedCheckpoint: Session.CompactionEntry | undefined
    const sessionLayer = Layer.effect(
      Session.SessionDirectory,
      Ref.make<ReadonlyArray<Session.Entry>>([]).pipe(
        Effect.map((entries) =>
          Session.SessionDirectory.of({
            acquire: () =>
              Effect.succeed({
                reserveEntryId: Effect.succeed("checkpoint-interrupted"),
                append: (input) =>
                  Ref.modify(entries, (path) => {
                    const entry: Session.Entry = {
                      ...input,
                      id: `message-${path.length}`,
                      parentId: path.at(-1)?.id ?? null,
                    }
                    return [entry, [...path, entry]] as const
                  }),
                appendCheckpoint: (prepared) =>
                  Ref.modify(entries, (path) => {
                    const existing = path.find((entry) => entry.id === prepared.id)
                    if (existing?._tag === "Compaction") {
                      const result: Session.CheckpointAppend = {
                        _tag: "AlreadyPresent",
                        checkpoint: existing,
                        leafId: path.at(-1)?.id ?? existing.id,
                      }
                      return [result, path]
                    }
                    const checkpoint: Session.CompactionEntry = {
                      _tag: "Compaction",
                      ...prepared,
                    }
                    committedCheckpoint = checkpoint
                    const result: Session.CheckpointAppend = {
                      _tag: "Appended",
                      checkpoint,
                      leafId: checkpoint.id,
                    }
                    return [result, [...path, checkpoint]]
                  }),
                path: () =>
                  Effect.gen(function* () {
                    const path = yield* Ref.get(entries)
                    if (blockCheckpointPath && path.some((entry) => entry._tag === "Compaction")) {
                      blockCheckpointPath = false
                      if (pathEntered === undefined) return yield* Effect.die("missing checkpoint path barrier")
                      yield* Deferred.succeed(pathEntered, undefined)
                      return yield* Effect.never
                    }
                    return path
                  }),
                setLeaf: () => Effect.void,
                leaf: Ref.get(entries).pipe(Effect.map((path) => path.at(-1)?.id ?? null)),
              }),
          }),
        ),
      ),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(textDelta("done"))),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              compactionCalls += 1
              return compactionCalls === 1
                ? Option.some({
                    _tag: "Microcompact" as const,
                    history: Prompt.make("recovered checkpoint"),
                    prompt: Prompt.empty,
                  })
                : Option.none()
            }).pipe(Compaction.withLifecycle(request)),
        }),
        sessionLayer,
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        pathEntered = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "interrupted-checkpoint-path-agent" })
        const first = yield* Effect.forkChild(
          Agent.stream(agent, {
            prompt: "first",
            sessionId: "interrupted-checkpoint-path",
            persistence: { chatId: "interrupted-checkpoint-path" },
          }).pipe(Stream.runDrain),
          { startImmediately: true },
        )
        yield* Deferred.await(pathEntered)
        yield* Fiber.interrupt(first)
        yield* Agent.stream(agent, {
          prompt: "second",
          sessionId: "interrupted-checkpoint-path",
          persistence: { chatId: "interrupted-checkpoint-path" },
        }).pipe(Stream.runDrain)

        const persistence = yield* Chat.Persistence
        const chat = yield* persistence.get("interrupted-checkpoint-path")
        const history = yield* Ref.get(chat.history)
        const path = yield* Effect.scoped(
          Session.acquire("interrupted-checkpoint-path").pipe(Effect.flatMap((session) => session.path())),
        )
        const checkpoints = path.filter((entry): entry is Session.CompactionEntry => entry._tag === "Compaction")
        expect(checkpoints).toHaveLength(1)
        expect(committedCheckpoint).toBeDefined()
        expect(checkpoints[0]?.telemetry.map((event) => event.deliveryId)).toEqual(
          committedCheckpoint?.telemetry.map((event) => event.deliveryId),
        )
        expect(checkpoints[0]?.compactionCommit).toEqual(committedCheckpoint?.compactionCommit)
        expect(Session.buildContext(path).content).toEqual(history.content)
      }),
    ] as const
  })
})
