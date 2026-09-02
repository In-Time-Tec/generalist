/* oxlint-disable effecttsgo/strict-effect-provide -- each test is a test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  Approvals,
  DurableDriver,
  ExecutableManifest,
  Permissions,
  ToolContext,
  ToolExecutor,
} from "../../../src/index.js"
import { allowAllAuthorization } from "../../authorization.js"

const messages = Prompt.make("authorize the completed external calls").content
const executableRef = Schema.decodeSync(ExecutableManifest.ExecutableRef)({
  executable: `executable-pin:v1:sha256:${"a".repeat(64)}`,
  active: `agent-pin:v1:sha256:${"b".repeat(64)}`,
})
const call = (id: string, name: string, params: Readonly<Record<string, Schema.Json>>) => ({
  type: "tool-call" as const,
  id,
  name,
  params,
})

it.effect("executes a strict completed call without invoking a LanguageModel", () => {
  let handlerCalls = 0
  let observedContext: ToolContext.Service | undefined
  const echo = Tool.make("echo", {
    parameters: Schema.Struct({ text: Schema.String }),
    success: Schema.String,
  }).addDependency(ToolContext.ToolContext)
  const toolkit = Toolkit.make(echo)
  const agent = Agent.make({ name: "external-tools", toolkit })
  const handlers = toolkit.toLayer({
    echo: () => Effect.die("configured ToolExecutor owns this call"),
  })
  const executor = ToolExecutor.layerTest({
    execute: (request) =>
      Effect.gen(function* () {
        handlerCalls += 1
        observedContext = yield* ToolContext.ToolContext
        const params = yield* Schema.decodeUnknownEffect(Schema.Struct({ text: Schema.String }))(
          request.call.params,
        ).pipe(Effect.orDie)
        return { _tag: "Success" as const, result: params.text, encodedResult: params.text }
      }),
  })

  return Effect.gen(function* () {
    const events = yield* Agent.streamToolCalls(agent, {
      _tag: "Start",
      calls: [call("call-1", "echo", { text: "hello" })],
      activeTools: ["echo"],
      messages,
      sessionId: "session-1",
      logicalOperationId: "operation-1",
      turn: 3,
      executableRef,
      invocation: { runId: "run-1", rootRunId: "run-1", attempt: 2 },
    }).pipe(Stream.runCollect)

    expect(events.map((event) => event._tag)).toEqual(["ToolExecutionStarted", "ToolExecutionCompleted"])
    expect(events[1]).toMatchObject({
      _tag: "ToolExecutionCompleted",
      turn: 3,
      call: { id: "call-1", name: "echo", params: { text: "hello" } },
      result: { id: "call-1", name: "echo", result: "hello", isFailure: false },
    })
    expect(handlerCalls).toBe(1)
    expect(observedContext).toMatchObject({
      sessionId: "session-1",
      toolCallId: "call-1",
      operationKey: "operation-1:tool:3:call-1:echo",
      idempotencyKey: "operation-1:tool:3:call-1:echo",
      runId: "run-1",
      rootRunId: "run-1",
      attempt: 2,
    })
  }).pipe(Effect.provide(Layer.mergeAll(allowAllAuthorization, handlers, executor)))
})

it.effect("rejects malformed and inactive calls before any handler runs", () => {
  let handlerCalls = 0
  const echo = Tool.make("echo", {
    parameters: Schema.Struct({ nested: Schema.Struct({ value: Schema.String }) }),
    success: Schema.String,
  })
  const toolkit = Toolkit.make(echo)
  const agent = Agent.make({ name: "strict-external-tools", toolkit })
  const handlers = toolkit.toLayer({
    echo: () => Effect.sync(() => (++handlerCalls).toString()),
  })
  const options = {
    _tag: "Start" as const,
    calls: [
      call("valid", "echo", { nested: { value: "valid" } }),
      call("invalid", "echo", { nested: { value: "invalid", excess: true } }),
    ] as const,
    activeTools: ["echo"],
    messages,
    sessionId: "strict-session",
    logicalOperationId: "strict-operation",
    turn: 0,
  }

  return Effect.gen(function* () {
    const malformed = yield* Effect.flip(Stream.runDrain(Agent.streamToolCalls(agent, options)))
    expect(malformed._tag).toBe("generalist/core/InvalidToolCallParameters")
    expect(handlerCalls).toBe(0)

    const inactive = yield* Effect.flip(
      Stream.runDrain(Agent.streamToolCalls(agent, { ...options, calls: [options.calls[0]], activeTools: [] })),
    )
    expect(inactive).toMatchObject({ _tag: "generalist/core/FrameworkFailure", stage: "authorization" })
    expect(handlerCalls).toBe(0)

    const providerExecuted = yield* Effect.flip(
      Stream.runDrain(
        Agent.streamToolCalls(agent, {
          ...options,
          calls: [{ ...options.calls[0], providerExecuted: true }],
        }),
      ),
    )
    expect(providerExecuted).toMatchObject({ _tag: "generalist/core/FrameworkFailure", stage: "authorization" })
    expect(handlerCalls).toBe(0)
  }).pipe(Effect.provide(handlers))
})

it.effect("applies the ordinary bounded-output outcome before completion", () => {
  const large = "x".repeat(51 * 1024)
  const echo = Tool.make("echo", { parameters: Schema.Struct({}), success: Schema.String })
  const toolkit = Toolkit.make(echo)
  const agent = Agent.make({ name: "bounded-output-external-tools", toolkit })
  const handlers = toolkit.toLayer({ echo: () => Effect.die("configured ToolExecutor owns this call") })
  const executor = ToolExecutor.layerTest({
    execute: () => Effect.succeed({ _tag: "Success", result: large, encodedResult: large }),
  })

  return Effect.gen(function* () {
    const events = yield* Agent.streamToolCalls(agent, {
      _tag: "Start",
      calls: [call("large-1", "echo", {})],
      activeTools: ["echo"],
      messages,
      sessionId: "bounded-output-session",
      logicalOperationId: "bounded-output-operation",
      turn: 0,
    }).pipe(Stream.runCollect)
    expect(events.at(-1)).toMatchObject({
      _tag: "ToolExecutionCompleted",
      result: {
        result: {
          inline: { truncated: true, bytes: 51 * 1024 + 2, maxBytes: 50 * 1024 },
          outputPaths: [],
        },
      },
    })
  }).pipe(Effect.provide(Layer.mergeAll(allowAllAuthorization, handlers, executor)))
})

it.effect("enforces authorization and tool-call budget before handler entry", () => {
  let handlerCalls = 0
  const echo = Tool.make("echo", { parameters: Schema.Struct({ text: Schema.String }), success: Schema.String })
  const toolkit = Toolkit.make(echo)
  const agent = Agent.make({ name: "bounded-external-tools", toolkit })
  const handlers = toolkit.toLayer({
    echo: ({ text }) =>
      Effect.sync(() => {
        handlerCalls += 1
        return text
      }),
  })
  const options: Agent.ToolCallBatchStart = {
    _tag: "Start",
    calls: [call("call-1", "echo", { text: "hello" })],
    activeTools: ["echo"],
    messages,
    sessionId: "bounded-session",
    logicalOperationId: "bounded-operation",
    turn: 0,
  }

  return Effect.gen(function* () {
    const denied = yield* Effect.flip(Stream.runDrain(Agent.streamToolCalls(agent, options)))
    expect(denied).toMatchObject({ _tag: "generalist/core/PermissionDenied", message: "Permission denied" })
    expect(handlerCalls).toBe(0)

    const exhausted = yield* Effect.flip(
      Stream.runDrain(Agent.streamToolCalls(agent, { ...options, budget: { toolCalls: 0 } })).pipe(
        Effect.provide(Permissions.layerAllowAll),
      ),
    )
    expect(exhausted).toMatchObject({ _tag: "generalist/core/RunBudgetExhausted", budget: "toolCalls" })
    expect(handlerCalls).toBe(0)
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        allowAllAuthorization,
        handlers,
        Permissions.layerRuleset({ rules: [{ pattern: "echo", level: "deny" }] }),
      ),
    ),
  )
})

it.effect("applies configured authored-order scheduling across the whole batch", () =>
  Effect.gen(function* () {
    let active = 0
    let entered = 0
    let maxActive = 0
    let exclusiveSaw = -1
    const bothEntered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const parallel = Tool.make("parallel", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
    })
    const exclusive = Tool.make("exclusive", {
      parameters: Schema.Struct({ value: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(parallel, exclusive)
    const agent = Agent.make({
      name: "scheduled-external-tools",
      toolkit,
      toolScheduling: { maxConcurrency: 2, parallelSafe: ["parallel"] },
    })
    const handlers = toolkit.toLayer({
      parallel: ({ value }) =>
        Effect.gen(function* () {
          active += 1
          entered += 1
          maxActive = Math.max(maxActive, active)
          if (entered === 2) yield* Deferred.succeed(bothEntered, undefined)
          return yield* Deferred.await(release).pipe(
            Effect.as(value),
            Effect.ensuring(Effect.sync(() => (active -= 1))),
          )
        }),
      exclusive: ({ value }) =>
        Effect.sync(() => {
          exclusiveSaw = active
          return value
        }),
    })
    const execution = Agent.streamToolCalls(agent, {
      _tag: "Start",
      calls: [
        call("parallel-a", "parallel", { value: "a" }),
        call("parallel-b", "parallel", { value: "b" }),
        call("exclusive-c", "exclusive", { value: "c" }),
      ],
      activeTools: ["parallel", "exclusive"],
      messages,
      sessionId: "scheduled-session",
      logicalOperationId: "scheduled-operation",
      turn: 0,
    }).pipe(Stream.runCollect, Effect.provide(Layer.mergeAll(allowAllAuthorization, handlers)))
    const fiber = yield* Effect.forkScoped(execution)
    yield* Deferred.await(bothEntered)
    expect(maxActive).toBe(2)
    yield* Deferred.succeed(release, undefined)
    const events = yield* Fiber.join(fiber)
    expect(exclusiveSaw).toBe(0)
    expect(events.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(3)
  }),
)

it.effect("interrupts configured ToolExecutor work with the request-scoped cancellation signal", () =>
  Effect.gen(function* () {
    let signal: AbortSignal | undefined
    const started = yield* Deferred.make<void>()
    const finalized = yield* Deferred.make<void>()
    const blocking = Tool.make("blocking", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(blocking)
    const agent = Agent.make({ name: "cancelled-external-tools", toolkit })
    const handlers = toolkit.toLayer({ blocking: () => Effect.die("configured ToolExecutor owns this call") })
    const executor = ToolExecutor.layerTest({
      execute: () =>
        Effect.gen(function* () {
          signal = (yield* ToolContext.ToolContext).signal
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.never
        }).pipe(Effect.ensuring(Deferred.succeed(finalized, undefined))),
    })
    const execution = Agent.streamToolCalls(agent, {
      _tag: "Start",
      calls: [call("blocking-1", "blocking", {})],
      activeTools: ["blocking"],
      messages,
      sessionId: "cancelled-session",
      logicalOperationId: "cancelled-operation",
      turn: 0,
    }).pipe(Stream.runDrain, Effect.provide(Layer.mergeAll(allowAllAuthorization, handlers, executor)))
    const fiber = yield* Effect.forkScoped(execution)
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    yield* Deferred.await(finalized)
    expect(signal?.aborted).toBe(true)
  }),
)

it.effect("resumes exact approval identity and completed replay without duplicating the handler", () => {
  let handlerCalls = 0
  let waitingCheckpoint: DurableDriver.DriverCheckpoint | undefined
  let completedOutcome: DurableDriver.OperationOutcome | undefined
  let operationKey: string | undefined
  const gated = Tool.make("gated", {
    parameters: Schema.Struct({ text: Schema.String }),
    success: Schema.String,
    needsApproval: true,
  }).addDependency(ToolContext.ToolContext)
  const toolkit = Toolkit.make(gated)
  const agent = Agent.make({ name: "resumed-external-tools", toolkit })
  const handlers = toolkit.toLayer({
    gated: ({ text }) =>
      Effect.gen(function* () {
        handlerCalls += 1
        operationKey = (yield* ToolContext.ToolContext).operationKey
        return text
      }),
  })
  const journal: DurableDriver.Journal = {
    onScheduled: (operation) =>
      operation.key === operationKey && completedOutcome !== undefined ? Effect.succeed(completedOutcome) : Effect.void,
    onCompleted: (_operation, outcome) =>
      Effect.sync(() => {
        completedOutcome = outcome
      }),
    onCheckpoint: (checkpoint) =>
      Effect.sync(() => {
        waitingCheckpoint = checkpoint
      }),
  }
  const start: Agent.ToolCallBatchStart = {
    _tag: "Start",
    calls: [call("gated-1", "gated", { text: "approved" })],
    activeTools: ["gated"],
    messages,
    sessionId: "resumed-session",
    logicalOperationId: "resumed-operation",
    turn: 4,
    executableRef,
  }
  const pendingApprovals = Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) })
  const base = Layer.mergeAll(allowAllAuthorization, handlers, Permissions.layerAllowAll)

  return Effect.gen(function* () {
    const suspension = yield* Effect.flip(Stream.runDrain(Agent.streamToolCalls(agent, start))).pipe(
      Effect.provide(pendingApprovals),
    )
    expect(suspension._tag).toBe("generalist/core/AgentSuspended")
    if (suspension._tag !== "generalist/core/AgentSuspended" || waitingCheckpoint === undefined) {
      return expect.unreachable()
    }
    const suspendedCheckpoint = waitingCheckpoint
    expect(handlerCalls).toBe(0)

    const mismatched = yield* Effect.flip(
      Stream.runDrain(
        Agent.streamToolCalls(agent, {
          _tag: "Resume",
          driverCheckpoint: suspendedCheckpoint,
          executableRef,
          messages: Prompt.make("different authorization context").content,
          resume: {
            suspension,
            resolutions: [{ waitId: suspension.waits[0]!.waitId, resolution: { _tag: "Approved" } }],
          },
        }),
      ),
    )
    expect(mismatched).toMatchObject({ _tag: "generalist/core/AgentError" })
    expect(handlerCalls).toBe(0)

    const events = yield* Agent.streamToolCalls(agent, {
      _tag: "Resume",
      driverCheckpoint: suspendedCheckpoint,
      executableRef,
      messages,
      resume: { suspension, resolutions: [{ waitId: suspension.waits[0]!.waitId, resolution: { _tag: "Approved" } }] },
    }).pipe(Stream.runCollect, Effect.provide(Approvals.layerDenyAll))
    expect(events.map((event) => event._tag)).toEqual(["ToolExecutionStarted", "ToolExecutionCompleted"])
    expect(handlerCalls).toBe(1)
    expect(operationKey).toBe(suspension.checkpoint.calls[0]!.operationKey)

    const replayed = yield* Agent.streamToolCalls(agent, start).pipe(
      Stream.runCollect,
      Effect.provide(Approvals.layerAutoApprove),
    )
    expect(replayed.map((event) => event._tag)).toEqual(["ApprovalRequested", "ToolExecutionCompleted"])
    expect(replayed.at(-1)).toMatchObject({
      _tag: "ToolExecutionCompleted",
      call: { id: "gated-1", name: "gated" },
      result: { id: "gated-1", name: "gated", result: "approved", isFailure: false },
    })
    expect(handlerCalls).toBe(1)
  }).pipe(Effect.provide(base), Effect.provideService(DurableDriver.DriverJournal, journal))
})
