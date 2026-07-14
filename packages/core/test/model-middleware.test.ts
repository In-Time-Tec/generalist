import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Exit, Layer, Option, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, AgentEvent, Approvals, Compaction, Memory, ModelMiddleware, Session, ToolExecutor } from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

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

const echoExecutor = ToolExecutor.testLayer({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.testLayer({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const assistantText = (id: string, text: string) =>
  Stream.fromIterable([
    Response.makePart("text-start", { id }),
    Response.makePart("text-delta", { id, delta: text }),
    Response.makePart("text-end", { id }),
  ])

/** Appends a system-style marker carrying its turn to the prompt. */
const appendMarker = (text: string): ModelMiddleware.Middleware => ({
  transformPrompt: (prompt, context) =>
    Effect.succeed(
      Prompt.fromMessages([
        ...prompt.content,
        Prompt.makeMessage("system", { content: `${text} turn:${context.turn}` }),
      ]),
    ),
})

const uppercaseDeltas: ModelMiddleware.Middleware = {
  transformPart: (part) =>
    Effect.succeed(
      part.type === "text-delta"
        ? Option.some(Response.makePart("text-delta", { id: part.id, delta: part.delta.toUpperCase() }))
        : Option.some(part),
    ),
}

const dropDeltas: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "text-delta" ? Option.none() : Option.some(part)),
}

const dropToolCalls: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "tool-call" ? Option.none() : Option.some(part)),
}

const failingPrompt: ModelMiddleware.Middleware = {
  transformPrompt: () => Effect.fail(AgentEvent.AgentError.make({ message: "prompt middleware boom", turn: 0 })),
}

layer(unusedToolHandlerLayer)("ModelMiddleware", (it) => {
  ItLayer.make(
    it,
    "identity default: empty chain behaves like the pre-middleware loop",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("plain output"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "identity-agent" })

          const result = yield* Agent.generate(agent, { prompt: "hello" })

          expect(result.text).toBe("plain output")
        }),
      ] as const,
  )

  ItLayer.make(it, "prompt transform: marker reaches the model with the correct turn per turn", () => {
    const prompts: Array<string> = []
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          prompts.push(Json.stringify(options.prompt.content))
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([appendMarker("scan")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "prompt-agent", toolkit: Toolkit.make(echoTool) })

        yield* Agent.generate(agent, { prompt: "use the echo tool" })

        // Two turns ran: turn 0 (tool-call) and turn 1 (final text).
        expect(prompts).toHaveLength(2)
        expect(prompts[0]).toContain("scan turn:0")
        expect(prompts[1]).toContain("scan turn:1")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "part transform: uppercasing deltas flows to Completed.text and ModelPart events",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hello world"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([uppercaseDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "uppercase-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

          const completed = events.at(-1)
          expect(completed?._tag === "Completed" && completed.text).toBe("HELLO WORLD")
          const modelPart = events.find((event) => event._tag === "ModelPart")
          expect(modelPart?._tag === "ModelPart" && modelPart.part.type === "text-delta" && modelPart.part.delta).toBe(
            "HELLO WORLD",
          )
        }),
      ] as const,
  )

  ItLayer.make(it, "transformed response is authoritative for every transcript consumer", () => {
    const memoryKey: Memory.Key = { agent: "authority-agent", subject: "subject" }
    const remembered: Array<Memory.RememberInput> = []
    const compactionRequests: Array<Compaction.Request> = []
    const dispatched: Array<string> = []
    let calls = 0
    const authorityMiddleware: ModelMiddleware.Middleware = {
      transformPart: (part) =>
        Effect.succeed(
          Option.some(
            part.type === "text-delta"
              ? Response.makePart("text-delta", { id: part.id, delta: part.delta.replace("secret", "[REDACTED]") })
              : part.type === "tool-call"
                ? Response.makePart("tool-call", {
                    id: "safe-1",
                    name: part.name,
                    params: part.params,
                    providerExecuted: part.providerExecuted,
                  })
                : part,
          ),
        ),
    }
    const persistenceLayer = Chat.layerPersisted({ storeId: "authority" }).pipe(
      Layer.provide(Persistence.layerBackingMemory),
    )
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          if (calls === 1) {
            return assistantText("answer", "secret").pipe(
              Stream.concat(Stream.make(toolCallPart("raw-1", "echo", { text: "run" }))),
            )
          }
          return assistantText("final", "done")
        }),
        ToolExecutor.testLayer({
          execute: (request) =>
            Effect.sync(() => {
              dispatched.push(request.call.id)
              return { _tag: "Success", result: "result", encodedResult: "result" } as const
            }),
        }),
        Approvals.autoApprove,
        ModelMiddleware.layer([authorityMiddleware]),
        Memory.testLayer({
          recall: () => Effect.succeed([]),
          remember: (input) => Effect.sync(() => remembered.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
        }),
        Compaction.testLayer({
          maybeCompact: (request) => Effect.sync(() => compactionRequests.push(request)).pipe(Effect.as(Option.none())),
        }),
        Session.memoryLayer,
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "authority-agent", toolkit: Toolkit.make(echoTool) })
        const events = yield* Stream.runCollect(
          Agent.stream(agent, {
            prompt: "start",
            memory: { key: memoryKey },
            persistence: { chatId: "authority-chat" },
          }),
        )
        const persistence = yield* Chat.Persistence
        const persisted = yield* persistence.get("authority-chat")
        const persistedHistory = yield* Ref.get(persisted.history)
        const session = yield* Session.SessionStore
        const sessionHistory = Session.buildContext(yield* session.path())
        const modelParts = events.filter((event) => event._tag === "ModelPart").map((event) => event.part)
        const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
        const completeViews = [
          Json.stringify(modelParts),
          Json.stringify(persistedHistory.content),
          Json.stringify(remembered.map((input) => input.transcript.content)),
          Json.stringify(compactionRequests.map((request) => request.history.content)),
        ]
        const serializedSession = Json.stringify(sessionHistory.content)

        expect(dispatched).toEqual(["safe-1"])
        expect(toolCompleted?._tag === "ToolExecutionCompleted" && toolCompleted.result.id).toBe("safe-1")
        for (const value of completeViews) {
          expect(value).toContain("[REDACTED]")
          expect(value).toContain("safe-1")
          expect(value).not.toContain("secret")
          expect(value).not.toContain("raw-1")
        }
        expect(serializedSession).toContain("safe-1")
        expect(serializedSession).not.toContain("secret")
        expect(serializedSession).not.toContain("raw-1")
      }),
    ] as const
  })

  ItLayer.make(it, "commits only transformed partial responses on every stream exit", () => {
    let exitMode: "typed" | "defect" | "interrupt" | "early" = "typed"
    const safeToolCall = Response.makePart("tool-call", {
      id: "raw-exit",
      name: "echo",
      params: { text: "exit" },
      providerExecuted: true,
    })
    const exitMiddleware: ModelMiddleware.Middleware = {
      transformPart: (part) => {
        if (part.type === "tool-call") {
          return Effect.succeed(
            Option.some(
              Response.makePart("tool-call", {
                id: "safe-exit",
                name: part.name,
                params: part.params,
                providerExecuted: part.providerExecuted,
              }),
            ),
          )
        }
        if (part.type !== "text-delta") return Effect.succeed(Option.some(part))
        switch (exitMode) {
          case "typed":
            return Effect.fail(AgentEvent.AgentError.make({ message: "typed exit", turn: 0 }))
          case "defect":
            return Effect.die("defect exit")
          case "interrupt":
            return Effect.interrupt
          case "early":
            return Effect.succeed(Option.some(part))
        }
      },
    }
    const persistenceLayer = Chat.layerPersisted({ storeId: "exit-authority" }).pipe(
      Layer.provide(Persistence.layerBackingMemory),
    )
    return [
      Layer.mergeAll(
        modelLayer(() =>
          Stream.make(safeToolCall).pipe(
            Stream.concat(exitMode === "early" ? Stream.never : Stream.make(textDelta("stop"))),
          ),
        ),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([exitMiddleware]),
        persistenceLayer,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "exit-authority-agent", toolkit: Toolkit.make(echoTool) })
        const persistence = yield* Chat.Persistence
        const assertStored = (chatId: string) =>
          Effect.gen(function* () {
            const persisted = yield* persistence.get(chatId)
            const serialized = Json.stringify((yield* Ref.get(persisted.history)).content)
            expect(serialized).toContain("safe-exit")
            expect(serialized).not.toContain("raw-exit")
          })

        exitMode = "typed"
        const typed = yield* Effect.flip(
          Stream.runDrain(Agent.stream(agent, { prompt: "typed", persistence: { chatId: "typed" } })),
        )
        expect(typed._tag).toBe("@batonfx/core/AgentError")
        yield* assertStored("typed")

        exitMode = "defect"
        const defect = yield* Effect.exit(
          Stream.runDrain(Agent.stream(agent, { prompt: "defect", persistence: { chatId: "defect" } })),
        )
        expect(Exit.hasDies(defect)).toBe(true)
        yield* assertStored("defect")

        exitMode = "interrupt"
        const interrupt = yield* Effect.exit(
          Stream.runDrain(Agent.stream(agent, { prompt: "interrupt", persistence: { chatId: "interrupt" } })),
        )
        expect(Exit.hasInterrupts(interrupt)).toBe(true)
        yield* assertStored("interrupt")

        exitMode = "early"
        yield* Agent.stream(agent, { prompt: "early", persistence: { chatId: "early" } }).pipe(
          Stream.filter((event) => event._tag === "ModelPart"),
          Stream.take(1),
          Stream.runDrain,
        )
        yield* assertStored("early")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "part drop: dropped text-deltas yield empty text and no delta events",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hidden"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "drop-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

          const completed = events.at(-1)
          expect(completed?._tag === "Completed" && completed.text).toBe("")
          const hasDelta = events.some((event) => event._tag === "ModelPart" && event.part.type === "text-delta")
          expect(hasDelta).toBe(false)
        }),
      ] as const,
  )

  ItLayer.make(it, "ordering: two prompt middlewares apply in array order", () => {
    let seen = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          seen = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([appendMarker("first"), appendMarker("second")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "ordering-agent" })

        yield* Agent.generate(agent, { prompt: "hello" })

        const aIndex = seen.indexOf("first")
        const bIndex = seen.indexOf("second")
        expect(aIndex).toBeGreaterThanOrEqual(0)
        expect(bIndex).toBeGreaterThan(aIndex)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "tool-call drop guard: dropping a tool-call part fails the run",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-guard", "echo", { text: "hi" }))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropToolCalls]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "guard-agent", toolkit: Toolkit.make(echoTool) })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" })))

          expect(failure._tag).toBe("@batonfx/core/MiddlewareViolation")
          if (failure._tag === "@batonfx/core/MiddlewareViolation") {
            expect(failure.turn).toBe(0)
            expect(failure.detail).toContain("tool-call")
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "middleware failure: transformPrompt failure fails the run before the model is called", () => {
    let modelCalled = false
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("should not run"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([failingPrompt]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "failing-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "hello" })))

        expect(modelCalled).toBe(false)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe("prompt middleware boom")
      }),
    ] as const
  })
})
