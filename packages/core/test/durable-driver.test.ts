import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, AgentRef, DurableDriver, RunBudget, ToolExecutor, TurnPolicy } from "../src/index"

import { Json } from "./json.js"
import { withProviderFinish } from "./provider-finish.js"
import { unusedToolHandlerLayer } from "./tool-handler-layer.js"

const persistenceLayer = Chat.layerPersisted({ storeId: "durable-driver-test" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const roundTrip = (value: unknown): unknown => Json.parse(Json.stringify(value))

describe("AgentRef", () => {
  it("pins manifest digest and round-trips through JSON", () => {
    const manifest = AgentRef.manifestFromAgent(
      Agent.make({
        name: "assistant",
        instructions: "Be concise.",
        toolkit: Toolkit.make(
          Tool.make("weather", {
            parameters: Schema.Struct({ city: Schema.String }),
            success: Schema.String,
          }),
        ),
        policy: TurnPolicy.recurs(3),
        model: { provider: "openai", model: "gpt-test" },
        metadata: { team: "core" },
      }),
    )
    const ref = AgentRef.make({ id: "assistant", version: "1", manifest })
    expect(ref.digest).toHaveLength(8)
    expect(roundTrip(ref)).toEqual(ref)
    expect(roundTrip(manifest)).toEqual(manifest)
  })

  it.effect("fromAgent and requireMatch accept identical refs", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "pin-agent", toolkit: Toolkit.empty })
      const ref = AgentRef.fromAgent(agent, "7")
      yield* AgentRef.requireMatch(ref, { ...ref })
      expect(AgentRef.matches(ref, AgentRef.fromAgent(agent, "7"))).toBe(true)
    }),
  )

  it.effect("requireMatch fails typed on version mismatch", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "pin-agent", toolkit: Toolkit.empty })
      const left = AgentRef.fromAgent(agent, "1")
      const right = AgentRef.fromAgent(agent, "2")
      const error = yield* AgentRef.requireMatch(left, right).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/AgentRefVersionMismatch")
      expect(error.expected.version).toBe("1")
      expect(error.actual.version).toBe("2")
    }),
  )

  it("changes digest when manifest content changes", () => {
    const base = Agent.make({ name: "assistant", toolkit: Toolkit.empty })
    const changed = Agent.make({ name: "assistant", instructions: "new", toolkit: Toolkit.empty })
    expect(AgentRef.fromAgent(base, "1").digest).not.toBe(AgentRef.fromAgent(changed, "1").digest)
  })
})

describe("RunBudget", () => {
  it("round-trips through JSON", () => {
    const budget = RunBudget.allocate({ modelCalls: 4, toolCalls: 2, childRuns: 1, depth: 2 })
    expect(roundTrip(budget)).toEqual(budget)
  })

  it.effect("charges usage and fails on exhaustion", () =>
    Effect.gen(function* () {
      const start = RunBudget.allocate({ modelCalls: 2 })
      const once = yield* RunBudget.charge(start, { modelCalls: 1 })
      expect(once.remaining.modelCalls).toBe(1)
      const twice = yield* RunBudget.charge(once, { modelCalls: 1 })
      expect(twice.remaining.modelCalls).toBe(0)
      const error = yield* RunBudget.charge(twice, { modelCalls: 1 }).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/RunBudgetExhausted")
      expect(error.dimension).toBe("modelCalls")
    }),
  )

  it.effect("reserves child grants without widening", () =>
    Effect.gen(function* () {
      const parent = RunBudget.allocate({ modelCalls: 5, toolCalls: 4, childRuns: 2, depth: 2 })
      const reserved = yield* RunBudget.reserveChild(parent, { modelCalls: 2, toolCalls: 1 })
      expect(reserved.child.depth).toBe(1)
      expect(reserved.child.remaining.modelCalls).toBe(2)
      expect(reserved.parent.remaining.modelCalls).toBe(3)
      expect(reserved.parent.remaining.childRuns).toBe(1)
      const widen = yield* RunBudget.reserveChild(parent, { modelCalls: 6 }).pipe(Effect.flip)
      expect(widen._tag).toBe("@batonfx/core/RunBudgetGrantWidened")
    }),
  )

  it.effect("refunds unused child allocation to the parent", () =>
    Effect.gen(function* () {
      const parent = RunBudget.allocate({ modelCalls: 4, childRuns: 1, depth: 1 })
      const reserved = yield* RunBudget.reserveChild(parent, { modelCalls: 3 })
      const spent = yield* RunBudget.charge(reserved.child, { modelCalls: 1 })
      const refunded = RunBudget.refundUnused(reserved.parent, spent)
      expect(refunded.remaining.modelCalls).toBe(3)
    }),
  )

  it.effect("rejects child depth beyond allocation", () =>
    Effect.gen(function* () {
      const parent = RunBudget.make({ depth: 1, childRuns: 1 }, 1)
      const error = yield* RunBudget.reserveChild(parent, { modelCalls: 1 }).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/RunBudgetExhausted")
      expect(error.dimension).toBe("depth")
    }),
  )

  it.effect("narrows child grants and returns the difference", () =>
    Effect.gen(function* () {
      const parent = RunBudget.allocate({ modelCalls: 5, childRuns: 1, depth: 2 })
      const reserved = yield* RunBudget.reserveChild(parent, { modelCalls: 4 })
      const narrowed = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { modelCalls: 2 })
      expect(narrowed.child.allocation.modelCalls).toBe(2)
      expect(narrowed.parent.remaining.modelCalls).toBe(3)
      const widen = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { modelCalls: 5 }).pipe(Effect.flip)
      expect(widen._tag).toBe("@batonfx/core/RunBudgetGrantWidened")
    }),
  )

  it.effect("detects deadline expiry", () =>
    Effect.gen(function* () {
      const budget = RunBudget.allocate({ deadline: "2026-01-01T00:00:00.000Z" })
      expect(RunBudget.isDeadlineExpired(budget, "2026-01-02T00:00:00.000Z")).toBe(true)
      yield* RunBudget.assertNotExpired(budget, "2025-12-31T00:00:00.000Z")
      const error = yield* RunBudget.assertNotExpired(budget, "2026-02-01T00:00:00.000Z").pipe(Effect.flip)
      expect(error.dimension).toBe("deadline")
    }),
  )
})

describe("DurableDriver tracer", () => {
  const agentRef = AgentRef.make({
    id: "tracer",
    version: "1",
    manifest: {
      name: "tracer",
      toolNames: [],
    },
  })

  const input = {
    agent: agentRef,
    prompt: Prompt.make("hello"),
    budget: RunBudget.allocate({ modelCalls: 3, toolCalls: 2 }),
  }

  it("uses deterministic operation keys and input digests", () => {
    const operation = DurableDriver.makeOperation({
      key: DurableDriver.operationKey(["turn", 0, "model"]),
      kind: "model",
      input: { prompt: "hello" },
      replayPolicy: "provider-idempotent",
    })
    expect(operation.inputDigest).toBe(DurableDriver.inputDigest({ prompt: "hello" }))
    expect(roundTrip(operation)).toEqual(operation)
  })

  it.effect("runs a text-only script to Complete", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeTracer([{ text: "done" }])
      const checkpoint = yield* driver.initial(input)
      const first = yield* driver.decide(checkpoint)
      expect(first._tag).toBe("Execute")
      if (first._tag !== "Execute") return
      expect(first.operation.kind).toBe("model")
      expect(first.operation.key).toBe(DurableDriver.operationKey(["tracer", 0, "model", agentRef.id]))
      const applied = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: {},
      })
      const terminal = yield* driver.decide(applied)
      expect(terminal._tag).toBe("Complete")
      if (terminal._tag === "Complete") expect(terminal.result.text).toBe("done")
    }),
  )

  it.effect("executes model then tool operations in order", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeTracer([
        { toolCalls: [{ name: "echo", params: { text: "hi" } }] },
        { text: "finished" },
      ])
      let checkpoint = yield* driver.initial(input)
      const modelDecision = yield* driver.decide(checkpoint)
      expect(modelDecision._tag).toBe("Execute")
      checkpoint = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: {},
      })
      const toolDecision = yield* driver.decide(checkpoint)
      expect(toolDecision._tag).toBe("Execute")
      if (toolDecision._tag === "Execute") expect(toolDecision.operation.kind).toBe("tool")
      checkpoint = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: { result: "ok" },
      })
      const nextModel = yield* driver.decide(checkpoint)
      expect(nextModel._tag).toBe("Execute")
      checkpoint = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: {},
      })
      const complete = yield* driver.decide(checkpoint)
      expect(complete._tag).toBe("Complete")
    }),
  )

  it.effect("rejects unknown operation outcomes", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeTracer([{ text: "done" }])
      const checkpoint = yield* driver.initial(input)
      const decision = yield* driver.decide(checkpoint)
      expect(decision._tag).toBe("Execute")
      const error = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Unknown",
        operationId: "op-1",
      }).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/DriverError")
    }),
  )

  it.effect("requires matching driver version", () =>
    Effect.gen(function* () {
      const checkpoint = {
        driverVersion: "0",
        agent: agentRef,
        turn: 0,
        budget: input.budget,
        state: {},
      }
      const error = yield* DurableDriver.requireDriverVersion(checkpoint, DurableDriver.currentDriverVersion).pipe(
        Effect.flip,
      )
      expect(error._tag).toBe("@batonfx/core/DriverVersionMismatch")
    }),
  )

  it.effect("charges model and tool budgets through apply", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeTracer([{ toolCalls: [{ name: "echo", params: {} }] }, { text: "ok" }])
      let checkpoint = yield* driver.initial({
        ...input,
        budget: RunBudget.allocate({ modelCalls: 1, toolCalls: 1 }),
      })
      yield* driver.decide(checkpoint)
      checkpoint = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: {},
      })
      expect(checkpoint.budget.remaining.modelCalls).toBe(0)
      yield* driver.decide(checkpoint)
      checkpoint = yield* DurableDriver.applyOperation(driver, checkpoint, {
        _tag: "Succeeded",
        value: {},
      })
      expect(checkpoint.budget.remaining.toolCalls).toBe(0)
    }),
  )
})

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const makeToolCallModelLayer = () => {
  let calls = 0
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        calls += 1
        return withProviderFinish(
          calls === 1
            ? Stream.fromIterable([
                Response.makePart("tool-call", {
                  id: "call-1",
                  name: "echo",
                  params: { text: "hi" },
                  providerExecuted: false,
                }),
              ])
            : Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" })),
        )
      },
    }),
  )
}

const captureJournal = () => {
  const scheduled = new Array<{ readonly kind: string; readonly key: string; readonly replayPolicy: string }>()
  const journal: DurableDriver.DriverJournal = {
    onScheduled: (operation) =>
      Effect.sync(() => {
        scheduled.push({ kind: operation.kind, key: operation.key, replayPolicy: operation.replayPolicy })
      }).pipe(Effect.as(undefined)),
    onCompleted: () => Effect.void,
    onCheckpoint: () => Effect.void,
  }
  return { scheduled, journalLayer: Layer.succeed(DurableDriver.DriverJournalService, journal) }
}

describe("DurableDriver Agent.stream integration", () => {
  it.effect("records model and tool operations through the driver journal seam", () =>
    Effect.gen(function* () {
      const { scheduled, journalLayer } = captureJournal()
      const agent = Agent.make({ name: "driver-seam-agent", toolkit: Toolkit.make(echoTool) })
      yield* Agent.stream(agent, { prompt: "use echo", logicalOperationId: "stable-run" }).pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mergeAll(
            makeToolCallModelLayer(),
            ToolExecutor.layerTest({
              execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
            }),
            journalLayer,
            unusedToolHandlerLayer,
          ),
        ),
      )
      expect(scheduled.some((operation) => operation.kind === "model")).toBe(true)
      expect(scheduled.some((operation) => operation.kind === "tool")).toBe(true)
      expect(scheduled.find((operation) => operation.kind === "tool")?.replayPolicy).toBe("never")
    }),
  )

  it.effect("keeps operation keys stable across equivalent runs", () =>
    Effect.gen(function* () {
      const runKeys = () =>
        Effect.gen(function* () {
          const { scheduled, journalLayer } = captureJournal()
          const agent = Agent.make({ name: "key-stable-agent", toolkit: Toolkit.make(echoTool) })
          yield* Agent.stream(agent, {
            prompt: "use echo",
            logicalOperationId: "logical-1",
            sessionId: "session-1",
          }).pipe(
            Stream.runDrain,
            Effect.provide(
              Layer.mergeAll(
                makeToolCallModelLayer(),
                ToolExecutor.layerTest({
                  execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
                }),
                journalLayer,
                unusedToolHandlerLayer,
              ),
            ),
          )
          return scheduled.map((operation) => operation.key)
        })
      const first = yield* runKeys()
      const second = yield* runKeys()
      expect(first).toEqual(second)
      expect(first.some((key) => key.includes("logical-1:model:0:0:conversation"))).toBe(true)
    }),
  )

  it.effect("rejects unknown outcomes for never replay policy", () =>
    Effect.gen(function* () {
      const operation = DurableDriver.makeOperation({
        key: "tool:never",
        kind: "tool",
        input: {},
        replayPolicy: "never",
      })
      const error = yield* DurableDriver.guardUnknownNeverReplay(operation, {
        _tag: "Unknown",
        operationId: "op-unknown",
      }).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/DriverUnknownReplay")
    }),
  )

  it.effect("binds suspension checkpoints to resume tokens", () => {
    const { scheduled, journalLayer } = captureJournal()
    let streamPhase: "suspend" | "resume" = "suspend"
    const suspendResumeModelLayer = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "done" }]),
        streamText: () =>
          withProviderFinish(
            streamPhase === "suspend"
              ? Stream.fromIterable([
                  Response.makePart("tool-call", {
                    id: "call-1",
                    name: "echo",
                    params: { text: "hi" },
                    providerExecuted: false,
                  }),
                ])
              : Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" })),
          ),
      }),
    )
    const services = Layer.mergeAll(
      suspendResumeModelLayer,
      ToolExecutor.layerTest({
        execute: () =>
          streamPhase === "suspend"
            ? Effect.succeed({ _tag: "Suspend", token: "wait-token-1" })
            : Effect.succeed({ _tag: "Success", result: "done", encodedResult: "done" }),
      }),
      journalLayer,
      persistenceLayer,
      Agent.layerRuntime,
      unusedToolHandlerLayer,
    )
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "driver-suspend-agent", toolkit: Toolkit.make(echoTool) })
      const suspended = yield* Agent.stream(agent, {
        prompt: "wait",
        logicalOperationId: "suspend-run",
        persistence: { chatId: "driver-suspend" },
      }).pipe(Stream.runDrain, Effect.flip)
      if (suspended._tag !== "@batonfx/core/AgentSuspended") return expect.unreachable()
      expect(scheduled.some((operation) => operation.kind === "wait" && operation.key === suspended.tool_call_id)).toBe(
        true,
      )
      streamPhase = "resume"
      yield* Agent.stream(agent, {
        prompt: "ignored",
        logicalOperationId: "suspend-run",
        persistence: { chatId: "driver-suspend" },
        resume: { suspension: suspended },
      }).pipe(Stream.runDrain)
      expect(scheduled.some((operation) => operation.kind === "wait" && operation.key === "resume:wait-token-1")).toBe(
        true,
      )
    }).pipe(Effect.provide(services))
  })
})
