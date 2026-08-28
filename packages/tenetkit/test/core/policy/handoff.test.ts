import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "../../../src/core/index"
import { ItLayer } from "../it-layer"
import { unusedToolHandlerLayer } from "../tool-handler-layer"
import { withProviderFinish } from "../provider-finish"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const fanOutWithUnionOptions = (children: ReadonlyArray<Handoff.FanOutChild>, options: Handoff.FanOutOptions) => {
  const result: Effect.Effect<
    ReadonlyArray<Agent.Result> | ReadonlyArray<Handoff.FanOutMemberResult>,
    Agent.RunError | Handoff.RegistrationError | Handoff.FanOutUnsatisfied
  > = Handoff.fanOut(children, options)
  return result
}
void fanOutWithUnionOptions

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })
const modelFailure = (description: string) =>
  AiError.make({
    module: "HandoffTestLanguageModel",
    method: "streamText",
    reason: AiError.UnknownError.make({ description }),
  })
const toolCallPart = (id: string, name: string, params: Response.ToolCallPart<string, unknown>["params"]) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })
const promptText = (prompt: Prompt.Prompt): string => JSON.stringify(prompt.content)
const directResult = (text: string): Agent.Result => ({ text, turns: 1, transcript: Prompt.fromMessages([]) })
const directRegistration = (
  name: string,
  run: Effect.Effect<Agent.Result, Agent.RunError | Handoff.RegistrationError>,
) =>
  Handoff.register(
    Agent.make({ name }),
    modelLayer(() =>
      Stream.unwrap(
        run.pipe(
          Effect.map((result) => Stream.make(textDelta(result.text))),
          Effect.mapError((failure) => modelFailure(String(failure))),
        ),
      ),
    ),
  )

layer(Layer.empty)("Handoff", (it) => {
  it("requires an explicit layer and closes full run options", () => {
    let observed: Prompt.Prompt | undefined
    const registration = Handoff.register(
      Agent.make({ name: "math" }),
      modelLayer((options) => {
        observed = options.prompt
        return Stream.make(textDelta("child result"))
      }),
    )
    return Effect.gen(function* () {
      const history = Prompt.fromMessages([
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "prior" })] }),
      ])
      const result = yield* registration.run({
        prompt: "current",
        history,
        system: "system override",
        sessionId: "session-1",
        logicalOperationId: "operation-1",
        modelCallOrdinalStart: 3,
        sessionOwnerToken: "owner-1",
        toolProgress: { _tag: "Backpressure", capacity: 4 },
        compaction: { contextWindow: 1024 },
      })
      expect(result.text).toBe("child result")
      expect(observed).toBeDefined()
      expect(promptText(observed!)).toContain("prior")
    })
  })

  it("maps registration layer failures to a named typed error", () => {
    const registration = Handoff.register(
      Agent.make({ name: "unavailable" }),
      Layer.effect(LanguageModel.LanguageModel, Effect.fail("service unavailable")),
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(registration.run({ prompt: "hello" }))
      expect(failure._tag).toBe("tenetkit/core/RegistrationError")
      if (Schema.is(Handoff.RegistrationError)(failure)) {
        expect(failure.agent).toBe("unavailable")
        expect(failure.cause).toBe("service unavailable")
      }
      expect(Schema.is(Handoff.RegistrationError)(failure)).toBe(true)
    })
  })

  it("names delegate tools by registered specialist", () => {
    const registration = Handoff.register(
      Agent.make({ name: "math" }),
      modelLayer(() => Stream.make(textDelta("done"))),
    )
    const delegate = Handoff.delegateTool(registration)
    expect(registration.name).toBe("math")
    expect(Object.keys(delegate.tools)).toEqual(["delegate_to_math"])
  })

  ItLayer.make(it, "builds a supervisor that same-run handoffs to specialists", () => {
    let supervisorCalls = 0
    let mathCalls = 0
    const mathTarget = Handoff.target(Agent.make({ name: "math" }))
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer((options) => {
          const content = promptText(options.prompt)
          if (content.includes("math child task")) {
            mathCalls += 1
            return Stream.make(textDelta("42"))
          }
          supervisorCalls += 1
          return supervisorCalls === 1
            ? Stream.make(toolCallPart("call-handoff", "handoff_to_math", { prompt: "math child task" }))
            : Stream.make(textDelta("supervisor got 42"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(supervisorSetup.agent, {
            prompt: "solve",
            sessionId: "session-handoff-1",
            logicalOperationId: "op-handoff-1",
          }),
        )
        const started = events.find((event) => event._tag === "ToolExecutionStarted")
        expect(started?._tag === "ToolExecutionStarted" && started.call.name).toBe("handoff_to_math")
        expect(mathCalls).toBe(1)
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("42")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects duplicate registered names", () => {
    const first = Handoff.target(Agent.make({ name: "math" }))
    const second = Handoff.target(Agent.make({ name: "math" }))
    let modelCalls = 0
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [first, second] })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisorSetup.agent, { prompt: "solve" })))
        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "handoff_to_math",
            origins: [
              { _tag: "Handoff", specialist: "math", mode: "same-run" },
              { _tag: "Handoff", specialist: "math", mode: "same-run" },
            ],
          }),
        )
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fans out registered agents with bounded concurrency and ordered results", () => {
    let active = 0
    let maxActive = 0
    const children = Array.from({ length: 6 }, (_, index) => ({
      registration: Handoff.register(
        Agent.make({ name: `child-${index}` }),
        modelLayer((options) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const text = promptText(options.prompt)
              const task = text.match(/task \d/)?.[0] ?? "task ?"
              active += 1
              maxActive = Math.max(maxActive, active)
              yield* Effect.yieldNow
              active -= 1
              return Stream.make(textDelta(`done ${task}`))
            }),
          ),
        ),
      ),
      prompt: `task ${index}`,
    }))
    return [
      Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
      Effect.gen(function* () {
        for (const concurrency of [1, 3, 6]) {
          active = 0
          maxActive = 0
          const results = yield* Handoff.fanOut(children, { concurrency })
          expect(results.map((result) => result.text)).toEqual([
            "done task 0",
            "done task 1",
            "done task 2",
            "done task 3",
            "done task 4",
            "done task 5",
          ])
          expect(maxActive).toBe(concurrency)
        }
      }),
    ] as const
  })

  ItLayer.make(it, "supports zero-argument currying", () => {
    const runFanOut = Handoff.fanOut()
    return [
      Layer.empty,
      Effect.gen(function* () {
        const results = yield* runFanOut([])
        expect(results).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "propagates registered run errors", () => {
    const child = Handoff.register(
      Agent.make({ name: "failing-child" }),
      modelLayer(() => Stream.fail(modelFailure("child failed"))),
    )
    return [
      Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Handoff.fanOut([{ registration: child, prompt: "fail" }]))
        expect(failure._tag).toBe("tenetkit/core/AgentError")
      }),
    ] as const
  })

  ItLayer.make(it, "collects all-settled and best-effort outcomes in ordinal order", () => {
    const children = [
      {
        registration: Handoff.register(
          Agent.make({ name: "settled-0" }),
          modelLayer(() => Stream.make(textDelta("zero"))),
        ),
        prompt: "zero",
      },
      {
        registration: Handoff.register(
          Agent.make({ name: "settled-1" }),
          modelLayer(() => Stream.fail(modelFailure("failed"))),
        ),
        prompt: "one",
      },
      {
        registration: Handoff.register(
          Agent.make({ name: "settled-2" }),
          modelLayer(() => Stream.make(textDelta("two"))),
        ),
        prompt: "two",
      },
    ]
    return [
      Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
      Effect.gen(function* () {
        for (const join of [{ _tag: "AllSettled" }, { _tag: "BestEffort" }] as const) {
          const outcomes = yield* Handoff.fanOut(children, { join })
          expect(outcomes.map((outcome) => outcome.ordinal)).toEqual([0, 1, 2])
          expect(outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "failed", "succeeded"])
        }
      }),
    ] as const
  })

  ItLayer.make(it, "returns first success and interrupts unnecessary members", () => [
    Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
    Effect.gen(function* () {
      for (const remainder of ["request-cancel", "terminate"] as const) {
        const firstStarted = yield* Deferred.make<void>()
        const lastStarted = yield* Deferred.make<void>()
        let interruptions = 0
        const blocked = (name: string, started: Deferred.Deferred<void>) => ({
          registration: directRegistration(
            name,
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Effect.sync(() => interruptions++)),
            ),
          ),
          prompt: name,
        })
        const winner = {
          registration: directRegistration(
            `winner-${remainder}`,
            Effect.all([Deferred.await(firstStarted), Deferred.await(lastStarted)]).pipe(
              Effect.as(directResult("winner")),
            ),
          ),
          prompt: "winner",
        }
        const outcomes = yield* Handoff.fanOut(
          [blocked(`first-${remainder}`, firstStarted), winner, blocked(`last-${remainder}`, lastStarted)],
          { join: { _tag: "FirstSuccess" }, remainder, concurrency: 3 },
        )
        expect(outcomes.map((outcome) => outcome.status)).toEqual(["cancelled", "succeeded", "cancelled"])
        expect(interruptions).toBe(2)
      }
    }),
  ])

  ItLayer.make(it, "awaits the remainder after first-success satisfaction", () => [
    Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const completed = yield* Deferred.make<void>()
      const children = [
        {
          registration: Handoff.register(
            Agent.make({ name: "await-winner" }),
            modelLayer(() => Stream.make(textDelta("winner"))),
          ),
          prompt: "winner",
        },
        {
          registration: Handoff.register(
            Agent.make({ name: "await-remainder" }),
            modelLayer(() =>
              Stream.unwrap(Deferred.await(release).pipe(Effect.as(Stream.make(textDelta("remainder"))))),
            ),
          ),
          prompt: "remainder",
        },
      ]
      const fiber = yield* Effect.forkChild(
        Handoff.fanOut(children, { join: { _tag: "FirstSuccess" } }).pipe(
          Effect.ensuring(Deferred.succeed(completed, undefined)),
        ),
      )
      yield* Effect.yieldNow
      expect(yield* Deferred.isDone(completed)).toBe(false)
      yield* Deferred.succeed(release, undefined)
      const outcomes = yield* Fiber.join(fiber)
      expect(outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "succeeded"])
    }),
  ])

  ItLayer.make(it, "interrupts every owned member when the parent is interrupted", () => [
    Layer.empty,
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>()
      const secondStarted = yield* Deferred.make<void>()
      let interruptions = 0
      const blocked = (name: string, started: Deferred.Deferred<void>) => ({
        registration: directRegistration(
          name,
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.sync(() => interruptions++)),
          ),
        ),
        prompt: name,
      })
      const parent = yield* Effect.forkChild(
        Handoff.fanOut([blocked("parent-child-0", firstStarted), blocked("parent-child-1", secondStarted)], {
          concurrency: 2,
        }),
      )
      yield* Effect.all([Deferred.await(firstStarted), Deferred.await(secondStarted)])
      yield* Fiber.interrupt(parent)
      expect(interruptions).toBe(2)
    }),
  ])

  ItLayer.make(it, "continues scheduling after a member interrupts itself", () => [
    Layer.empty,
    Effect.gen(function* () {
      let secondStarted = false
      const outcomes = yield* Handoff.fanOut(
        [
          {
            registration: directRegistration("self-interrupted", Effect.interrupt),
            prompt: "interrupt",
          },
          {
            registration: directRegistration(
              "after-interrupt",
              Effect.sync(() => {
                secondStarted = true
                return directResult("continued")
              }),
            ),
            prompt: "continue",
          },
        ],
        { join: { _tag: "AllSettled" }, concurrency: 1 },
      )
      expect(outcomes.map((outcome) => outcome.status)).toEqual(["cancelled", "succeeded"])
      expect(secondStarted).toBe(true)
    }),
  ])

  ItLayer.make(it, "completes quorum and fails as soon as quorum is impossible", () => [
    Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
    Effect.gen(function* () {
      const success = (name: string) => ({
        registration: directRegistration(name, Effect.succeed(directResult(name))),
        prompt: name,
      })
      const failure = (name: string) => ({
        registration: directRegistration(name, Effect.fail(AgentEvent.AgentError.make({ message: name, turn: 0 }))),
        prompt: name,
      })
      const quorum = yield* Handoff.fanOut([success("quorum-0"), failure("quorum-1"), success("quorum-2")], {
        join: { _tag: "Quorum", required: 2 },
      })
      expect(quorum.map((outcome) => outcome.status)).toEqual(["succeeded", "failed", "succeeded"])

      let interrupted = false
      const blocked = {
        registration: directRegistration(
          "impossible-blocked",
          Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => (interrupted = true)))),
        ),
        prompt: "blocked",
      }
      const impossible = yield* Effect.flip(
        Handoff.fanOut([failure("impossible-0"), failure("impossible-1"), blocked], {
          join: { _tag: "Quorum", required: 2 },
          remainder: "await",
          concurrency: 3,
        }),
      )
      expect(impossible).toBeInstanceOf(Handoff.FanOutUnsatisfied)
      if (Schema.is(Handoff.FanOutUnsatisfied)(impossible)) {
        expect(impossible.succeeded).toBe(0)
        expect(impossible.settled).toBe(2)
      }
      expect(interrupted).toBe(true)
    }),
  ])
})
