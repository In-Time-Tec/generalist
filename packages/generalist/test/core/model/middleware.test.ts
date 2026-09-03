import { expect, layer } from "@effect/vitest"
import { Json } from "../json.js"
import { Effect, Exit, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  Approvals,
  Compaction,
  Memory,
  ModelMiddleware,
  Session,
  ToolExecutor,
} from "../../../src/index"
import { unusedToolHandlerLayer } from "../tool-handler-layer.js"
import { ItLayer } from "../it-layer.js"
import { withProviderFinish } from "../provider-finish.js"
import { allowAllAuthorization } from "../../authorization.js"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const echoTool = Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const gatedEchoTool = Tool.make("gated-echo", {
  description: "Echo input for duplicate ID tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: true,
})

const echoExecutor = ToolExecutor.layerTest({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.layerTest({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: Readonly<Record<string, string>>) =>
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
          allowAllAuthorization,
          modelLayer(() => Stream.make(textDelta("plain output"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "identity-agent" })

          const result = yield* Agent.run(agent, "hello")

          expect(result).toBe("plain output")
        }),
      ] as const,
  )

  ItLayer.make(it, "prompt transform: marker reaches the model with the correct turn per turn", () => {
    const prompts: Array<string> = []
    let calls = 0
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer((options) => {
          calls += 1
          prompts.push(Json.stringify(options.prompt.content))
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([appendMarker("scan")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "prompt-agent", toolkit: Toolkit.make(echoTool) })

        yield* Agent.run(agent, "use the echo tool")

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
          allowAllAuthorization,
          modelLayer(() => Stream.make(textDelta("hello world"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layer([uppercaseDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "uppercase-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, "hello"))

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
      transformPart: (part) => {
        if (part.type === "text-delta") {
          return Effect.succeed(
            Option.some(
              Response.makePart("text-delta", { id: part.id, delta: part.delta.replace("secret", "[REDACTED]") }),
            ),
          )
        }
        if (part.type === "tool-call") {
          return Effect.succeed(
            Option.some(
              Response.makePart("tool-call", {
                id: "safe-1",
                name: part.name,
                params: part.params,
                providerExecuted: part.providerExecuted,
              }),
            ),
          )
        }
        return Effect.succeed(Option.some(part))
      },
    }
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() => {
          calls += 1
          if (calls === 1) {
            return assistantText("answer", "secret").pipe(
              Stream.concat(Stream.make(toolCallPart("raw-1", "echo", { text: "run" }))),
            )
          }
          return assistantText("final", "done")
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              dispatched.push(request.call.id)
              return { _tag: "Success", result: "result", encodedResult: "result" } as const
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([authorityMiddleware]),
        Memory.layerTest({
          recall: () => Effect.succeed([]),
          remember: (input) => Effect.sync(() => remembered.push(input)).pipe(Effect.asVoid),
          forget: () => Effect.void,
          history: () => Effect.succeed([]),
          revert: () => Effect.void,
        }),
        Compaction.layerTest({
          maybeCompact: (request) => Effect.sync(() => compactionRequests.push(request)).pipe(Effect.as(Option.none())),
        }),
        Session.layerMemory,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "authority-agent", toolkit: Toolkit.make(echoTool) })
        const events = yield* Stream.runCollect(
          Agent.stream(agent, "start", {
            sessionId: "session-authority",
            memory: { key: memoryKey },
          }),
        )
        const sessionHistory = yield* Effect.scoped(
          Session.acquire("session-authority").pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map(Session.buildContext),
          ),
        )
        const modelParts = events.filter((event) => event._tag === "ModelPart").map((event) => event.part)
        const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
        const completeViews = [
          Json.stringify(modelParts),
          Json.stringify(sessionHistory.content),
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

  ItLayer.make(it, "rejects duplicate transformed tool-call IDs before the duplicate executes", () => {
    const dispatched: Array<string> = []
    let approvalChecks = 0
    let modelCalls = 0
    const duplicateIdMiddleware: ModelMiddleware.Middleware = {
      transformPart: (part) =>
        Effect.succeed(
          Option.some(
            part.type === "tool-call"
              ? Response.makePart("tool-call", {
                  id: part.id === "provider-3" ? "later" : "shared",
                  name: part.name,
                  params: part.params,
                  providerExecuted: part.providerExecuted,
                })
              : part,
          ),
        ),
    }
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(
                toolCallPart("provider-1", "gated-echo", { text: "first" }),
                toolCallPart("provider-2", "gated-echo", { text: "second" }),
                toolCallPart("provider-3", "gated-echo", { text: "third" }),
              )
            : Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              dispatched.push(request.call.id)
              return {
                _tag: "Success",
                result: "first-result-marker",
                encodedResult: "first-result-marker",
              } as const
            }),
        }),
        Approvals.layerTest({
          resolve: () =>
            Effect.sync(() => {
              approvalChecks += 1
              return { _tag: "Approved" } as const
            }),
        }),
        ModelMiddleware.layer([duplicateIdMiddleware]),
        Session.layerMemory,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "duplicate-id-agent", toolkit: Toolkit.make(gatedEchoTool) })
        const events: Array<AgentEvent.Event> = []
        const outcome = yield* Agent.stream(agent, "call three times", {
          sessionId: "duplicate-id",
        }).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              events.push(event)
            }),
          ),
          Effect.match({ onFailure: (error) => ({ error }), onSuccess: (value) => ({ value }) }),
        )
        const history = yield* Effect.scoped(
          Session.acquire("duplicate-id").pipe(
            Effect.flatMap((session) => session.path()),
            Effect.map((path) => Json.stringify(Session.buildContext(path).content)),
          ),
        )
        const modelToolCalls = events.filter((event) => event._tag === "ModelPart" && event.part.type === "tool-call")
        const approvalRequests = events.filter((event) => event._tag === "ApprovalRequested")
        const executionStarted = events.filter((event) => event._tag === "ToolExecutionStarted")
        const executionCompleted = events.filter((event) => event._tag === "ToolExecutionCompleted")

        expect(dispatched).toEqual([])
        expect(approvalChecks).toBe(0)
        expect(modelToolCalls).toHaveLength(1)
        expect(approvalRequests).toHaveLength(0)
        expect(executionStarted).toHaveLength(0)
        expect(executionCompleted).toHaveLength(0)
        expect(Json.stringify(events)).toContain("first")
        expect(Json.stringify(events)).not.toContain("second")
        expect(Json.stringify(events)).not.toContain("third")
        expect(history).not.toContain("first")
        expect(history.match(/"type":"tool-result"/g)).toBeNull()
        expect(history).not.toContain("first-result-marker")
        expect(history).not.toContain("second")
        expect(history).not.toContain("third")
        expect("error" in outcome && outcome.error._tag).toBe("generalist/core/DuplicateToolCallId")
        if ("error" in outcome && outcome.error._tag === "generalist/core/DuplicateToolCallId") {
          expect(outcome.error.id).toBe("shared")
          expect(outcome.error.firstIndex).toBe(0)
          expect(outcome.error.duplicateIndex).toBe(1)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "rejects non-adjacent and provider-executed duplicate IDs with tool-call positions", () => {
    const dispatched: Array<string> = []
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() =>
          Stream.make(
            toolCallPart("duplicate", "gated-echo", { text: "first" }),
            textDelta("between"),
            toolCallPart("middle", "gated-echo", { text: "middle" }),
            Response.makePart("tool-call", {
              id: "duplicate",
              name: "gated-echo",
              params: { text: "provider" },
              providerExecuted: true,
            }),
            toolCallPart("later", "gated-echo", { text: "later" }),
          ),
        ),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              dispatched.push(request.call.id)
              return { _tag: "Success", result: "result", encodedResult: "result" } as const
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "non-adjacent-agent", toolkit: Toolkit.make(gatedEchoTool) })
        const events: Array<AgentEvent.Event> = []
        const failure = yield* Effect.flip(
          Agent.stream(agent, "call tools").pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                events.push(event)
              }),
            ),
          ),
        )
        const modelToolCalls = events.filter((event) => event._tag === "ModelPart" && event.part.type === "tool-call")

        expect(failure._tag).toBe("generalist/core/DuplicateToolCallId")
        expect(dispatched).toEqual([])
        expect(modelToolCalls).toHaveLength(2)
        expect(Json.stringify(modelToolCalls)).not.toContain('"text":"provider"')
        expect(Json.stringify(events)).not.toContain("later")
        if (failure._tag === "generalist/core/DuplicateToolCallId") {
          expect(failure.id).toBe("duplicate")
          expect(failure.firstIndex).toBe(0)
          expect(failure.duplicateIndex).toBe(2)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "rejects duplicate IDs before a second local toolkit handler invocation", () => {
    const handled: Array<string> = []
    let modelCalls = 0
    const toolkit = Toolkit.make(gatedEchoTool)
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() => {
          modelCalls += 1
          return modelCalls === 1
            ? Stream.make(
                toolCallPart("local-duplicate", "gated-echo", { text: "first" }),
                toolCallPart("local-duplicate", "gated-echo", { text: "second" }),
                toolCallPart("local-later", "gated-echo", { text: "later" }),
              )
            : Stream.make(textDelta("done"))
        }),
        toolkit.toLayer({
          "gated-echo": (params) =>
            Effect.sync(() => {
              handled.push(params.text)
              return params.text
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "local-duplicate-agent", toolkit })
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(agent, "call locally")))

        expect(failure._tag).toBe("generalist/core/DuplicateToolCallId")
        expect(handled).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "allows IDs replaced by middleware and reused in later turns and runs", () => {
    const dispatched: Array<string> = []
    let modelCalls = 0
    const uniqueReplacement: ModelMiddleware.Middleware = {
      transformPart: (part) => {
        if (part.type !== "tool-call") return Effect.succeed(Option.some(part))
        return Schema.decodeUnknownEffect(Schema.Struct({ text: Schema.String }))(part.params).pipe(
          Effect.map((params) =>
            Option.some(
              Response.makePart("tool-call", {
                id: `safe-${params.text}`,
                name: part.name,
                params: part.params,
                providerExecuted: part.providerExecuted,
              }),
            ),
          ),
          Effect.orDie,
        )
      },
    }
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.make(
              toolCallPart("raw", "echo", { text: "one" }),
              toolCallPart("raw", "echo", { text: "two" }),
            )
          }
          if (modelCalls === 2 || modelCalls === 4) {
            return Stream.make(toolCallPart("raw", "echo", { text: "one" }))
          }
          return Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              dispatched.push(request.call.id)
              return { _tag: "Success", result: "result", encodedResult: "result" } as const
            }),
        }),
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([uniqueReplacement]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "id-scope-agent", toolkit: Toolkit.make(echoTool) })

        yield* Agent.run(agent, "first run")
        yield* Agent.run(agent, "second run")

        expect(dispatched).toEqual(["safe-one", "safe-two", "safe-one", "safe-one"])
      }),
    ] as const
  })

  ItLayer.make(it, "does not commit partial responses from incomplete stream exits", () => {
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
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer(() =>
          Stream.make(safeToolCall).pipe(
            Stream.concat(exitMode === "early" ? Stream.never : Stream.make(textDelta("stop"))),
          ),
        ),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([exitMiddleware]),
        Session.layerMemory,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "exit-authority-agent", toolkit: Toolkit.make(echoTool) })
        const assertNotStored = (sessionId: string) =>
          Effect.scoped(
            Effect.gen(function* () {
              const session = yield* Session.acquire(sessionId)
              const serialized = Json.stringify(Session.buildContext(yield* session.path()).content)
              expect(serialized).not.toContain("safe-exit")
              expect(serialized).not.toContain("raw-exit")
            }),
          )

        exitMode = "typed"
        const typed = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(agent, "typed", {
              sessionId: "typed",
            }),
          ),
        )
        expect(typed._tag).toBe("generalist/core/AgentError")
        yield* assertNotStored("typed")

        exitMode = "defect"
        const defect = yield* Effect.exit(
          Stream.runDrain(
            Agent.stream(agent, "defect", {
              sessionId: "defect",
            }),
          ),
        )
        expect(Exit.hasDies(defect)).toBe(true)
        yield* assertNotStored("defect")

        exitMode = "interrupt"
        const interrupt = yield* Effect.exit(
          Stream.runDrain(
            Agent.stream(agent, "interrupt", {
              sessionId: "interrupt",
            }),
          ),
        )
        expect(Exit.hasInterrupts(interrupt)).toBe(true)
        yield* assertNotStored("interrupt")

        exitMode = "early"
        yield* Agent.stream(agent, "early", {
          sessionId: "early",
        }).pipe(
          Stream.filter((event) => event._tag === "ModelPart"),
          Stream.take(1),
          Stream.runDrain,
        )
        yield* assertNotStored("early")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "coalesces adjacent completed response text before appending Session history",
    () =>
      [
        Layer.mergeAll(
          allowAllAuthorization,
          modelLayer(() => Stream.concat(assistantText("first", "."), assistantText("second", "answer"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          Session.layerMemory,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "response-authority-agent" })
          yield* Stream.runDrain(
            Agent.stream(agent, "complete", {
              sessionId: "complete",
            }),
          )
          const history = yield* Effect.scoped(
            Session.acquire("complete").pipe(
              Effect.flatMap((session) => session.path()),
              Effect.map(Session.buildContext),
            ),
          )
          const response = history.content.at(-1)
          expect(response?.role).toBe("assistant")
          expect(response?.content).toEqual([expect.objectContaining({ type: "text", text: ".answer" })])
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "part drop: dropped text-deltas fail the run instead of completing it with empty text",
    () =>
      [
        Layer.mergeAll(
          allowAllAuthorization,
          modelLayer(() => Stream.make(textDelta("hidden"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layer([dropDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "drop-agent" })
          const events: Array<AgentEvent.Event> = []

          const failure = yield* Agent.stream(agent, "hello").pipe(
            Stream.tap((event) => Effect.sync(() => events.push(event))),
            Stream.runDrain,
            Effect.flip,
          )

          expect(events.some((event) => event._tag === "Completed")).toBe(false)
          expect(failure).toMatchObject({
            _tag: "generalist/core/RunEndedWithoutOutput",
            turn: 0,
            providerTextCharacters: 6,
          })
          const hasDelta = events.some((event) => event._tag === "ModelPart" && event.part.type === "text-delta")
          expect(hasDelta).toBe(false)
        }),
      ] as const,
  )

  ItLayer.make(it, "ordering: two prompt middlewares apply in array order", () => {
    let seen = ""
    return [
      Layer.mergeAll(
        allowAllAuthorization,
        modelLayer((options) => {
          seen = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([appendMarker("first"), appendMarker("second")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "ordering-agent" })

        yield* Agent.run(agent, "hello")

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
          allowAllAuthorization,
          modelLayer(() => Stream.make(toolCallPart("tool-call-guard", "echo", { text: "hi" }))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layer([dropToolCalls]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "guard-agent", toolkit: Toolkit.make(echoTool) })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, "use the echo tool")))

          expect(failure._tag).toBe("generalist/core/MiddlewareViolation")
          if (failure._tag === "generalist/core/MiddlewareViolation") {
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
        allowAllAuthorization,
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("should not run"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([failingPrompt]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "failing-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, "hello")))

        expect(modelCalled).toBe(false)
        expect(failure._tag).toBe("generalist/core/AgentError")
        expect(failure._tag === "generalist/core/AgentError" && failure.message).toBe("prompt middleware boom")
      }),
    ] as const
  })
})
