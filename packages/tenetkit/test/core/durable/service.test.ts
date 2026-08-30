import { describe, expect, it, layer } from "@effect/vitest"
import { Cause, Deferred, Effect, Fiber, Function, Layer, Option, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  Compaction,
  DurableDriver,
  ExecutableManifest,
  Memory,
  Pins,
  RunBudget,
  Session,
  ToolExecutor,
} from "../../../src/index"
import { withCacheBreakpoints } from "../../../src/core/model/prompt-cache"

import { Json } from "../json.js"
import { withProviderFinish } from "../provider-finish.js"
import { unusedToolHandlerLayer } from "../tool-handler-layer.js"
import { sha256Text } from "../../../src/core/durable/canonical-json.js"
import { edgeCount, incrementEdge } from "../../../src/core/agent/handoff/state.js"
import { applyCommit } from "../../../src/core/durable/loop-driver.js"
import { makeAgent, makeExecutable } from "../../../src/core/durable/pin-internal.js"
import { withDerivedSystem } from "../../../src/core/agent/session/history.js"
import { LoopDriverState } from "../../../src/core/durable/loop-driver-state.js"
import { make as makeToolBatch, updateCall } from "../../../src/core/agent/tools/checkpoint.js"
import { applyToolOutcome } from "../../../src/core/agent/tools/checkpoint-operation.js"

type JsonRoundTripValue = typeof Schema.Unknown.Type
const roundTrip = (value: JsonRoundTripValue): JsonRoundTripValue => Json.parse(Json.stringify(value))
const agentEntry = (agent: AgentManifest.PinnedAgent) => ({ _tag: "Agent" as const, ...agent })
const leafValueSchema = Schema.Struct({ leafId: Schema.String })
const sessionParentValueSchema = Schema.Struct({ sessionParentId: Schema.NullOr(Schema.String) })
const transcriptInputSchema = Schema.Struct({ transcriptDigest: Schema.String })
const pendingPromptStateSchema = Schema.Struct({
  pending: Schema.Struct({ key: Schema.String, input: Schema.Struct({ promptDigest: Schema.String }) }),
})

describe("executable identity", () => {
  it("counts handoff edges by structural source and target identity", () => {
    let counts = new Map<string, ReadonlyMap<string, number>>()
    counts = new Map(incrementEdge(counts, "a:b", "c"))
    counts = new Map(incrementEdge(counts, "a", "b:c"))
    expect(edgeCount(counts, "a:b", "c")).toBe(1)
    expect(edgeCount(counts, "a", "b:c")).toBe(1)
  })

  it.effect("applies an exact handoff commit to control state and active pin together", () => {
    const root = makeAgent({ name: "a" })
    const child = makeAgent({ name: "b" })
    const executable = makeExecutable({ root, child })
    const projectedHistory = Prompt.make("committed projection")
    const commit = {
      _tag: "Commit" as const,
      state: {
        root: "a",
        active: "b",
        path: [{ handoffId: "h1", source: "a", target: "b", turn: 0 }],
        edgeCounts: [{ source: "a", target: "b", count: 1 }],
        handoffCount: 1,
        pendingContinuation: { prompt: Prompt.make("continue"), instructions: "Act as B." },
      },
      sessionEntryId: "h1:session-projection",
      sessionParentId: null,
      projectedHistory,
      targetAgentPin: child,
    }
    return Effect.gen(function* () {
      const checkpoint = yield* applyCommit(
        {
          driverVersion: "1",
          executable: { executable, active: root },
          turn: 0,
          budget: { allocation: { handoffs: 2 }, remaining: { handoffs: 1 }, depth: 0 },
          state: {
            logicalOperationId: "run",
            sessionId: "session",
            modelCallOrdinal: 0,
            modelCallOrdinalStart: 0,
          },
        },
        roundTrip(commit),
      )
      expect(checkpoint.executable?.active).toBe(child)
      expect(checkpoint.state).toMatchObject({ handoff: commit.state })
      expect(checkpoint.budget.remaining.handoffs).toBe(1)
    })
  })

  it("matches known SHA-256 vectors", () => {
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
  const model = Pins.makeModel({ implementation: "test-model", revision: 1 })
  const weather = Pins.makeCapability({ implementation: "weather", schema: 1 })
  const base = (overrides: Partial<Parameters<typeof AgentManifest.make>[0]> = {}) =>
    AgentManifest.make({
      name: "assistant",
      instructions: "Be concise.",
      model,
      tools: [{ name: "weather", pin: weather }],
      skills: [],
      services: [],
      policy: { _tag: "Portable", policy: { _tag: "Recurs", count: 3 } },
      toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
      budget: { modelCalls: 4 },
      children: [],
      ...overrides,
    })

  it("pins every manifest dimension and canonicalizes unordered inputs", () => {
    const original = base()
    const dimensions = [
      base({ name: "other" }),
      base({ instructions: "Other" }),
      base({ model: Pins.makeModel({ implementation: "other" }) }),
      base({ tools: [{ name: "weather", pin: Pins.makeCapability({ implementation: "other" }) }] }),
      base({ skills: [{ name: "research", pin: Pins.makeCapability({ skill: "research" }) }] }),
      base({ services: [{ name: "clock", pin: Pins.makeCapability({ service: "clock" }) }] }),
      base({ policy: { _tag: "Portable", policy: { _tag: "Forever" } } }),
      base({ toolScheduling: { maxConcurrency: 2, parallelSafe: ["weather"] } }),
      base({
        compaction: {
          service: Pins.makeCapability({ compaction: "default" }),
          summaryModel: Pins.makeModel({ implementation: "summary" }),
          contextWindow: 128_000,
          reserveTokens: 8_000,
          keepRecentTokens: 16_000,
          strategyIdentity: "default:v1",
          summaryPromptIdentity: "summary:v1",
        },
      }),
      base({ budget: { modelCalls: 5 } }),
      base({ children: [{ selection: "delegate" }] }),
    ]
    for (const changed of dimensions) expect(changed.pin).not.toBe(original.pin)
    const first = Pins.makeCapability({ tool: "first" })
    const second = Pins.makeCapability({ tool: "second" })
    expect(
      base({
        tools: [
          { name: "z", pin: second },
          { name: "a", pin: first },
        ],
      }).pin,
    ).toBe(
      base({
        tools: [
          { name: "a", pin: first },
          { name: "z", pin: second },
        ],
      }).pin,
    )
    expect(
      base({
        tools: [
          { name: "a", pin: first },
          { name: "z", pin: second },
        ],
        toolScheduling: { maxConcurrency: 2, parallelSafe: ["z", "a"] },
      }).pin,
    ).toBe(
      base({
        tools: [
          { name: "z", pin: second },
          { name: "a", pin: first },
        ],
        toolScheduling: { maxConcurrency: 2, parallelSafe: ["a", "z"] },
      }).pin,
    )
  })

  it("pins every compaction policy dimension", () => {
    const compaction: AgentManifest.CompactionIdentity = {
      service: Pins.makeCapability({ compaction: "default" }),
      summaryModel: Pins.makeModel({ implementation: "summary" }),
      contextWindow: 128_000,
      reserveTokens: 8_000,
      keepRecentTokens: 16_000,
      strategyIdentity: "default:v1",
      summaryPromptIdentity: "summary:v1",
    }
    const withCompaction = (overrides: Partial<AgentManifest.CompactionIdentity>) => ({
      service: compaction.service,
      summaryModel: compaction.summaryModel,
      contextWindow: compaction.contextWindow,
      reserveTokens: compaction.reserveTokens,
      keepRecentTokens: compaction.keepRecentTokens,
      strategyIdentity: compaction.strategyIdentity,
      summaryPromptIdentity: compaction.summaryPromptIdentity,
      ...overrides,
    })
    const original = base({ compaction })
    for (const changed of [
      base({ compaction: withCompaction({ contextWindow: 64_000 }) }),
      base({ compaction: withCompaction({ reserveTokens: 4_000 }) }),
      base({ compaction: withCompaction({ keepRecentTokens: 8_000 }) }),
      base({ compaction: withCompaction({ strategyIdentity: "default:v2" }) }),
      base({ compaction: withCompaction({ summaryPromptIdentity: "summary:v2" }) }),
    ]) {
      expect(changed.pin).not.toBe(original.pin)
    }
  })

  it("builds from a live Agent only with exact caller-supplied tool pins", () => {
    const agent = Agent.make({
      name: "assistant",
      instructions: "Be concise.",
      toolkit: Toolkit.make(Tool.make("weather", { parameters: Schema.Struct({ city: Schema.String }) })),
      toolScheduling: { maxConcurrency: 2, parallelSafe: ["weather"] },
    })
    expect(
      AgentManifest.fromLiveAgent(agent, {
        model,
        tools: [{ name: "weather", pin: weather }],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        budget: {},
        children: [],
      }).manifest,
    ).toMatchObject({
      name: "assistant",
      toolScheduling: { maxConcurrency: 2, parallelSafe: ["weather"] },
    })
    expect(() =>
      AgentManifest.fromLiveAgent(agent, {
        model,
        tools: [],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        budget: {},
        children: [],
      }),
    ).toThrow("exactly match")
    expect(() =>
      AgentManifest.fromLiveAgent(agent, {
        model,
        tools: [{ name: "weather", pin: weather }],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Recurs", count: 1 } },
        budget: {},
        children: [],
      }),
    ).toThrow("policy snapshot")
    expect(() =>
      AgentManifest.fromLiveAgent(Agent.make({ name: "budgeted", budget: { modelCalls: 2 } }), {
        model,
        tools: [],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        budget: { modelCalls: 3 },
        children: [],
      }),
    ).toThrow("Budget")
    expect(() =>
      AgentManifest.fromLiveAgent(agent, {
        model,
        tools: [{ name: "weather", pin: weather }],
        skills: [],
        services: [],
        policy: { _tag: "Pinned", pin: Pins.makeCapability("portable-policy") },
        budget: {},
        children: [],
      }),
    ).toThrow("opaque")
  })

  it("validates complete closures and rejects duplicate or dangling entries", () => {
    const agent = base()
    const executable = ExecutableManifest.make({ root: agent.pin, entries: [agentEntry(agent)] })
    expect(roundTrip(executable)).toEqual(executable)
    expect(() => ExecutableManifest.make({ root: agent.pin, entries: [agentEntry(agent), agentEntry(agent)] })).toThrow(
      "Duplicate",
    )
    const missing = Schema.decodeSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"c".repeat(64)}`)
    expect(() => ExecutableManifest.make({ root: missing, entries: [agentEntry(agent)] })).toThrow("Root")
    expect(() => ExecutableManifest.make({ root: agent.pin, active: missing, entries: [agentEntry(agent)] })).toThrow(
      "Active",
    )
    const dangling = base({ children: [{ selection: "child" }] })
    expect(() => ExecutableManifest.make({ root: dangling.pin, entries: [agentEntry(dangling)] })).toThrow(
      "has no executable profile",
    )
    expect(() =>
      ExecutableManifest.make({
        root: dangling.pin,
        profiles: [{ selection: "child", agent: missing }],
        entries: [agentEntry(dangling)],
      }),
    ).toThrow("does not resolve to an Agent")
    expect(() =>
      ExecutableManifest.make({
        root: agent.pin,
        profiles: [{ selection: "undeclared", agent: agent.pin }],
        entries: [agentEntry(agent)],
      }),
    ).toThrow("not declared by an Agent")
    expect(() =>
      ExecutableManifest.make({
        root: missing,
        entries: [{ _tag: "Agent", pin: missing, manifest: agent.manifest }],
      }),
    ).toThrow("digest mismatch")
    const disconnected = base({ name: "disconnected", tools: [] })
    expect(() =>
      ExecutableManifest.make({ root: agent.pin, entries: [agentEntry(agent), agentEntry(disconnected)] }),
    ).toThrow("disconnected")
  })

  it.effect("decodes only a fully verified pinned executable", () =>
    Effect.gen(function* () {
      const agent = base()
      const executable = ExecutableManifest.make({ root: agent.pin, entries: [agentEntry(agent)] })
      expect(yield* ExecutableManifest.decode(roundTrip(executable))).toEqual(executable)
      const wrongExecutable = {
        ...executable,
        ref: { ...executable.ref, executable: ExecutableManifest.makeTest("wrong", undefined).ref.executable },
      }
      yield* ExecutableManifest.decode(wrongExecutable).pipe(Effect.flip)
      const altered = {
        ...executable,
        manifest: Object.assign({}, executable.manifest, {
          entries: [
            Object.assign({}, executable.manifest.entries[0]!, {
              manifest: Object.assign({}, agent.manifest, { name: "altered" }),
            }),
          ],
        }),
      }
      yield* ExecutableManifest.decode(altered).pipe(Effect.flip)
    }),
  )

  it("pins the finite profile registry independently of recursive selection authority", () => {
    const child = base({ name: "child", tools: [] })
    const root = base({ children: [{ selection: "delegate" }] })
    const profiles = [{ selection: "delegate", agent: child.pin }]
    const left = ExecutableManifest.make({ root: root.pin, profiles, entries: [agentEntry(root), agentEntry(child)] })
    const reordered = ExecutableManifest.make({
      root: root.pin,
      profiles,
      entries: [agentEntry(child), agentEntry(root)],
    })
    const activeChild = ExecutableManifest.make({
      root: root.pin,
      active: child.pin,
      profiles,
      entries: [agentEntry(root), agentEntry(child)],
    })
    expect(left.ref.executable).toBe(reordered.ref.executable)
    expect(left.ref.executable).toBe(activeChild.ref.executable)
    expect(activeChild.ref.active).toBe(child.pin)
    expect("active" in left.manifest).toBe(false)
    expect(() => ExecutableManifest.validateRef(activeChild.ref, left.manifest)).not.toThrow()
    const absent = Schema.decodeSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"d".repeat(64)}`)
    expect(() => ExecutableManifest.validateRef({ ...left.ref, active: absent }, left.manifest)).toThrow()

    const recursiveA = base({ name: "a", children: [{ selection: "a" }, { selection: "b" }] })
    const recursiveB = base({ name: "b", children: [{ selection: "a" }, { selection: "b" }] })
    const recursive = ExecutableManifest.make({
      root: recursiveA.pin,
      profiles: [
        { selection: "a", agent: recursiveA.pin },
        { selection: "b", agent: recursiveB.pin },
      ],
      entries: [agentEntry(recursiveA), agentEntry(recursiveB)],
    })
    expect(recursive.manifest.entries).toHaveLength(2)
    expect(recursive.manifest.profiles).toHaveLength(2)

    const changedAllowlist = base({ name: "a", children: [{ selection: "b" }] })
    const changedAuthority = ExecutableManifest.make({
      root: changedAllowlist.pin,
      profiles: [
        { selection: "a", agent: changedAllowlist.pin },
        { selection: "b", agent: recursiveB.pin },
      ],
      entries: [agentEntry(changedAllowlist), agentEntry(recursiveB)],
    })
    expect(changedAuthority.ref.executable).not.toBe(recursive.ref.executable)

    const alternate = base({ name: "alternate", tools: [] })
    const changedRegistry = ExecutableManifest.make({
      root: root.pin,
      profiles: [{ selection: "delegate", agent: alternate.pin }],
      entries: [agentEntry(root), agentEntry(alternate)],
    })
    expect(changedRegistry.ref.executable).not.toBe(left.ref.executable)
  })

  it("rejects malformed pin kinds, duplicate names and unsupported JSON", () => {
    expect(() => Schema.decodeSync(Pins.AgentPin)(String(model))).toThrow()
    expect(() =>
      base({
        tools: [
          { name: "same", pin: weather },
          { name: "same", pin: Pins.makeCapability("x") },
        ],
      }),
    ).toThrow("Duplicate")
    expect(() =>
      base({
        children: [{ selection: "same" }, { selection: "same" }],
      }),
    ).toThrow("Duplicate child selection")
    expect(() => base({ toolScheduling: { maxConcurrency: 2, parallelSafe: ["missing"] } })).toThrow("undeclared tool")
    expect(() => base({ toolScheduling: { maxConcurrency: 2, parallelSafe: ["weather", "weather"] } })).toThrow(
      "duplicate tool",
    )
    expect(() => Pins.makeCapability({ invalid: () => undefined })).toThrow("Expected JSON value")
    expect(() => Pins.makeCapability(Symbol("invalid"))).toThrow("Expected JSON value")
    const sparse: Array<unknown> = []
    sparse.length = 1
    expect(() => Pins.makeCapability(sparse)).toThrow("Expected JSON value")
    expect(() =>
      Schema.decodeSync(AgentManifest.AgentManifest, { onExcessProperty: "error" })(
        Object.assign({}, base().manifest, { extra: true }),
      ),
    ).toThrow()
  })
})

describe("RunBudget", () => {
  it("rejects negative, fractional, and unsafe dimensions", () => {
    for (const modelCalls of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => RunBudget.make({ modelCalls })).toThrow()
    }
    expect(() => RunBudget.make({}, -1)).toThrow()
  })

  it("round-trips through JSON", () => {
    const budget = RunBudget.make({ modelCalls: 4, toolCalls: 2, childRuns: 1, depth: 2 })
    expect(roundTrip(budget)).toEqual(budget)
  })

  it.effect("charges usage and fails on exhaustion", () =>
    Effect.gen(function* () {
      const start = RunBudget.make({ modelCalls: 2 })
      const once = yield* RunBudget.charge(start, { modelCalls: 1 })
      expect(once.remaining.modelCalls).toBe(1)
      const twice = yield* RunBudget.charge(once, { modelCalls: 1 })
      expect(twice.remaining.modelCalls).toBe(0)
      const error = yield* RunBudget.charge(twice, { modelCalls: 1 }).pipe(Effect.flip)
      expect(error._tag).toBe("tenetkit/core/RunBudgetExhausted")
      expect(error.dimension).toBe("modelCalls")
    }),
  )

  it.effect("reserves child grants without widening", () =>
    Effect.gen(function* () {
      const parent = RunBudget.make({ modelCalls: 5, toolCalls: 4, childRuns: 2, depth: 2 })
      const reserved = yield* RunBudget.reserveChild(parent, { modelCalls: 2, toolCalls: 1 })
      expect(reserved.child.depth).toBe(1)
      expect(reserved.child.remaining.modelCalls).toBe(2)
      expect(reserved.parent.remaining.modelCalls).toBe(3)
      expect(reserved.parent.remaining.childRuns).toBe(1)
      const widen = yield* RunBudget.reserveChild(parent, { modelCalls: 6 }).pipe(Effect.flip)
      expect(widen._tag).toBe("tenetkit/core/RunBudgetGrantWidened")
    }),
  )

  it.effect("refunds unused child allocation to the parent", () =>
    Effect.gen(function* () {
      const parent = RunBudget.make({ modelCalls: 4, childRuns: 1, depth: 1 })
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
      expect(error._tag).toBe("tenetkit/core/RunBudgetExhausted")
      expect(error.dimension).toBe("depth")
    }),
  )

  it.effect("narrows child grants and returns the difference", () =>
    Effect.gen(function* () {
      const parent = RunBudget.make({ modelCalls: 5, childRuns: 1, depth: 2 })
      const reserved = yield* RunBudget.reserveChild(parent, { modelCalls: 4 })
      const narrowed = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { modelCalls: 2 })
      expect(narrowed.child.allocation.modelCalls).toBe(2)
      expect(narrowed.parent.remaining.modelCalls).toBe(3)
      const widen = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { modelCalls: 5 }).pipe(Effect.flip)
      expect(widen._tag).toBe("tenetkit/core/RunBudgetGrantWidened")
    }),
  )

  it.effect("detects deadline expiry", () =>
    Effect.gen(function* () {
      const budget = RunBudget.make({ deadline: "2026-01-01T00:00:00.000Z" })
      expect(RunBudget.isDeadlineExpired(budget, "2026-01-02T00:00:00.000Z")).toBe(true)
      yield* RunBudget.assertNotExpired(budget, "2025-12-31T00:00:00.000Z")
      const error = yield* RunBudget.assertNotExpired(budget, "2026-02-01T00:00:00.000Z").pipe(Effect.flip)
      expect(error.dimension).toBe("deadline")
    }),
  )
})

describe("DurableDriver tracer", () => {
  const input = {
    prompt: Prompt.make("hello"),
    budget: RunBudget.make({ modelCalls: 3, toolCalls: 2 }),
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
      expect(first.operation.key).toBe(DurableDriver.operationKey(["tracer", 0, "model", "standalone"]))
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
      expect(error._tag).toBe("tenetkit/core/DriverError")
    }),
  )

  it.effect("requires matching driver version", () =>
    Effect.gen(function* () {
      const checkpoint = {
        driverVersion: "0",
        turn: 0,
        budget: input.budget,
        state: {},
      }
      const error = yield* DurableDriver.requireDriverVersion(checkpoint, DurableDriver.currentDriverVersion).pipe(
        Effect.flip,
      )
      expect(error._tag).toBe("tenetkit/core/DriverVersionMismatch")
    }),
  )

  it.effect("charges model and tool budgets through apply", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeTracer([{ toolCalls: [{ name: "echo", params: {} }] }, { text: "ok" }])
      let checkpoint = yield* driver.initial({
        ...input,
        budget: RunBudget.make({ modelCalls: 1, toolCalls: 1 }),
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

const provideScoped = Function.dual<
  <A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>
>(
  2,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>> =>
    Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context)))),
)

const captureJournal = () => {
  const scheduled = new Array<{ readonly kind: string; readonly key: string; readonly replayPolicy: string }>()
  const journal: DurableDriver.Journal = {
    onScheduled: (operation) =>
      Effect.sync(() => {
        scheduled.push({ kind: operation.kind, key: operation.key, replayPolicy: operation.replayPolicy })
      }).pipe(Effect.as(undefined)),
    onCompleted: () => Effect.void,
    onCheckpoint: () => Effect.void,
  }
  return { scheduled, journalLayer: Layer.succeed(DurableDriver.DriverJournal, journal) }
}

const batchToolFixture = (logicalOperationId: string, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const calls = ids.map((id) =>
      Response.toolCallPart({
        id,
        name: "echo",
        params: { text: id },
        providerExecuted: false,
      }),
    )
    const operationKeys = calls.map((call) => `${logicalOperationId}:tool:0:${call.id}:${call.name}`)
    const driver = DurableDriver.makeLoopDriver({ logicalOperationId, sessionId: logicalOperationId })
    const initial = yield* driver.initial({
      prompt: Prompt.make("parallel tools"),
      budget: RunBudget.make({ toolCalls: ids.length }),
    })
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(initial.state)
    const ready = makeToolBatch({
      turn: 0,
      calls,
      operationKeys,
      activeTools: ["echo"],
      authorizationContextDigest: "",
    })
    const toolBatch = calls.reduce(
      (checkpoint, _call, callIndex) =>
        updateCall(checkpoint, { callIndex, state: { _tag: "Ready", stage: "execution" } }),
      ready,
    )
    const checkpoint = { ...initial, state: { ...state, toolBatch } }
    const specs = calls.map((call, callIndex) => ({
      kind: "tool" as const,
      key: operationKeys[callIndex]!,
      turn: 0,
      input: { turn: 0, callId: call.id, name: call.name },
      replayPolicy: "pure" as const,
      applyCheckpoint: applyToolOutcome({
        callIndex,
        call,
        operationKey: operationKeys[callIndex]!,
        activatedSkills: [],
        invocationPath: [],
        collapseSuspension: false,
      }),
    }))
    return { checkpoint, driver, specs }
  })

describe("DurableDriver Agent.stream integration", () => {
  it("restores Agent instructions ahead of derived Session system context", () => {
    const projection = Prompt.fromMessages([
      Prompt.makeMessage("system", { content: "derived memory and branch context" }),
    ])
    const replay = withDerivedSystem({ system: "current Agent instructions", projection })

    expect(replay.content.map((message) => message.role)).toEqual(["system", "system"])
    expect(JSON.stringify(replay.content[0])).toContain("current Agent instructions")
    expect(JSON.stringify(replay.content[1])).toContain("derived memory and branch context")
  })

  layer(makeToolCallModelLayer())(
    "rejects a checkpoint with no executable identity for another standalone Agent",
    (suite) => {
      suite.effect("rejects a checkpoint with no executable identity for another standalone Agent", () =>
        Effect.gen(function* () {
          const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "first", sessionId: "first" })
          const checkpoint = yield* driver.initial({ prompt: Prompt.make("first"), budget: RunBudget.make({}) })
          const second = Agent.make({ name: "second" })
          const failure = yield* Agent.stream(second, { prompt: "second", driverCheckpoint: checkpoint }).pipe(
            Stream.runDrain,
            Effect.flip,
          )
          expect(failure._tag).toBe("tenetkit/core/DriverStateInvalid")
          expect(failure.message).toContain("explicit executable identity")
        }),
      )
    },
  )

  for (const kind of ["model", "structured-output"] as const) {
    it.effect(`reconciles a pending ${kind} without recharging its ordinal or budget`, () =>
      Effect.gen(function* () {
        const allocated = RunBudget.make({ modelCalls: 3 })
        const charged = yield* RunBudget.charge(allocated, { modelCalls: 1 })
        const logicalOperationId = `${kind}-replay`
        const input = { turn: 0, modelCallOrdinal: 0 }
        const pendingKey = `${logicalOperationId}:${kind}:0:0`
        const driver = DurableDriver.makeLoopDriver({ logicalOperationId, sessionId: logicalOperationId })
        const checkpoint: DurableDriver.DriverCheckpoint = {
          driverVersion: DurableDriver.currentDriverVersion,
          turn: 0,
          budget: charged,
          state: {
            logicalOperationId,
            sessionId: logicalOperationId,
            modelCallOrdinal: 1,
            modelCallOrdinalStart: 0,
            pending: { kind, key: pendingKey, input, replayPolicy: "provider-idempotent" },
          },
        }
        const scheduled: Array<string> = []
        const interpreter = yield* DurableDriver.makeInline({
          driver,
          initial: checkpoint,
          journal: {
            onScheduled: (operation) =>
              Effect.sync(() => {
                scheduled.push(operation.key)
                return operation.key === pendingKey ? ({ _tag: "Succeeded", value: "replayed" } as const) : undefined
              }),
            onCompleted: () => Effect.void,
            onCheckpoint: () => Effect.void,
          },
        })

        expect(
          yield* interpreter.run(
            { kind, key: pendingKey, input, replayPolicy: "provider-idempotent" },
            Effect.die("replayed operation must not execute"),
          ),
        ).toBe("replayed")
        expect((yield* interpreter.checkpoint).budget.remaining.modelCalls).toBe(2)

        const nextKey = `${logicalOperationId}:${kind}:0:1`
        yield* interpreter.run(
          {
            kind,
            key: nextKey,
            input: { turn: 0, modelCallOrdinal: 1 },
            replayPolicy: "provider-idempotent",
          },
          Effect.void,
        )
        expect(scheduled).toEqual([pendingKey, nextKey])
        expect((yield* interpreter.checkpoint).budget.remaining.modelCalls).toBe(1)
      }),
    )
  }

  it.effect("rejects a different operation where the persisted pending operation is expected", () =>
    Effect.gen(function* () {
      const logicalOperationId = "pending-mismatch"
      const pending = {
        kind: "model" as const,
        key: `${logicalOperationId}:model:0:0`,
        input: { turn: 0, modelCallOrdinal: 0 },
        replayPolicy: "provider-idempotent" as const,
      }
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId, sessionId: logicalOperationId })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial: {
          driverVersion: DurableDriver.currentDriverVersion,
          turn: 0,
          budget: RunBudget.make({ modelCalls: 2 }),
          state: {
            logicalOperationId,
            sessionId: logicalOperationId,
            modelCallOrdinal: 1,
            modelCallOrdinalStart: 0,
            pending,
          },
        },
      })
      const failure = yield* interpreter
        .run(
          {
            ...pending,
            key: `${logicalOperationId}:model:0:1`,
            input: { turn: 0, modelCallOrdinal: 1 },
          },
          Effect.void,
        )
        .pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/core/DriverStateInvalid")
    }),
  )

  it.effect("admits parallel batch tools atomically and charges every call once", () =>
    Effect.gen(function* () {
      const fixture = yield* batchToolFixture("parallel-batch-admission", ["call-a", "call-b"])
      const firstScheduled = yield* Deferred.make<void>()
      const releaseFirstSchedule = yield* Deferred.make<void>()
      const bothExecuting = yield* Deferred.make<void>()
      const releaseExecutions = yield* Deferred.make<void>()
      const scheduled = new Array<string>()
      let active = 0
      let maxActive = 0
      const interpreter = yield* DurableDriver.makeInline({
        driver: fixture.driver,
        initial: fixture.checkpoint,
        journal: {
          onScheduled: (operation) =>
            Effect.gen(function* () {
              scheduled.push(operation.key)
              if (operation.key !== fixture.specs[0]!.key) return
              yield* Deferred.succeed(firstScheduled, undefined)
              yield* Deferred.await(releaseFirstSchedule)
            }),
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        },
      })
      const execute = (id: string) =>
        Effect.gen(function* () {
          active += 1
          maxActive = Math.max(maxActive, active)
          if (active === 2) yield* Deferred.succeed(bothExecuting, undefined)
          yield* Deferred.await(releaseExecutions)
          return { _tag: "Success" as const, result: id, encodedResult: id }
        }).pipe(Effect.ensuring(Effect.sync(() => void (active -= 1))))
      const fiber = yield* Effect.all(
        fixture.specs.map((spec) => interpreter.run(spec, execute(spec.key))),
        { concurrency: "unbounded" },
      ).pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(firstScheduled)
      expect(scheduled).toEqual([fixture.specs[0]!.key])
      yield* Deferred.succeed(releaseFirstSchedule, undefined)
      yield* Deferred.await(bothExecuting)
      expect(maxActive).toBe(2)
      yield* Deferred.succeed(releaseExecutions, undefined)
      yield* Fiber.join(fiber)

      const checkpoint = yield* interpreter.checkpoint
      const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
      expect(scheduled).toEqual(fixture.specs.map((spec) => spec.key))
      expect(checkpoint.budget.remaining.toolCalls).toBe(0)
      expect(state.pending).toBeUndefined()
      expect(state.toolBatch?.calls.map((entry) => entry.state._tag)).toEqual(["Completed", "Completed"])
    }),
  )

  it.effect("recovers a scheduled batch tool without recharging or repeating authorization", () =>
    Effect.gen(function* () {
      const fixture = yield* batchToolFixture("scheduled-tool-recovery", ["call-a"])
      let persisted: DurableDriver.DriverCheckpoint | undefined
      let executions = 0
      const crashing = yield* DurableDriver.makeInline({
        driver: fixture.driver,
        initial: fixture.checkpoint,
        journal: {
          onScheduled: (_operation, checkpoint) =>
            Effect.sync(() => {
              persisted = checkpoint
            }).pipe(Effect.andThen(Effect.interrupt)),
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        },
      })
      const firstExit = yield* crashing
        .run(
          fixture.specs[0]!,
          Effect.sync(() => {
            executions += 1
            return { _tag: "Success" as const, result: "first", encodedResult: "first" }
          }),
        )
        .pipe(Effect.exit)
      expect(firstExit._tag).toBe("Failure")
      expect(executions).toBe(0)
      expect(persisted?.budget.remaining.toolCalls).toBe(0)
      expect(
        (yield* Schema.decodeUnknownEffect(LoopDriverState)(persisted!.state)).toolBatch?.calls[0]?.state._tag,
      ).toBe("Scheduled")

      const recovered = yield* DurableDriver.makeInline({
        driver: fixture.driver,
        initial: persisted!,
      })
      yield* recovered.run(
        fixture.specs[0]!,
        Effect.sync(() => {
          executions += 1
          return { _tag: "Success" as const, result: "recovered", encodedResult: "recovered" }
        }),
      )
      const checkpoint = yield* recovered.checkpoint
      const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
      expect(executions).toBe(1)
      expect(checkpoint.budget.remaining.toolCalls).toBe(0)
      expect(state.toolBatch?.calls[0]?.state._tag).toBe("Completed")
    }),
  )

  it.effect("rejects a same-kind operation outside the active tool batch", () =>
    Effect.gen(function* () {
      const fixture = yield* batchToolFixture("batch-operation-boundary", ["call-a"])
      const interpreter = yield* DurableDriver.makeInline({
        driver: fixture.driver,
        initial: fixture.checkpoint,
      })
      const failure = yield* interpreter
        .run(
          {
            ...fixture.specs[0]!,
            key: "batch-operation-boundary:tool:0:unlisted:echo",
            input: { turn: 0, callId: "unlisted", name: "echo" },
          },
          Effect.die("unlisted tool operation must not execute"),
        )
        .pipe(Effect.flip)

      expect(failure).toMatchObject({
        _tag: "tenetkit/core/DriverStateInvalid",
        message: "Tool operation batch-operation-boundary:tool:0:unlisted:echo is not part of the active batch",
      })
      expect((yield* interpreter.checkpoint).budget.remaining.toolCalls).toBe(1)
    }),
  )

  {
    const { scheduled, journalLayer } = captureJournal()
    const agent = Agent.make({ name: "driver-seam-agent", toolkit: Toolkit.make(echoTool) })
    layer(
      Layer.mergeAll(
        makeToolCallModelLayer(),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
        }),
        journalLayer,
        unusedToolHandlerLayer,
      ),
    )("records model and tool operations through the driver journal seam", (suite) => {
      suite.effect("records model and tool operations through the driver journal seam", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "use echo", logicalOperationId: "stable-run" }).pipe(Stream.runDrain)
          expect(scheduled.find((operation) => operation.kind === "model")?.replayPolicy).toBe("never")
          expect(scheduled.some((operation) => operation.kind === "tool")).toBe(true)
          expect(scheduled.find((operation) => operation.kind === "tool")?.replayPolicy).toBe("never")
        }),
      )
    })
  }

  {
    const { scheduled, journalLayer } = captureJournal()
    const agent = Agent.make({ name: "replay-safe-tool-agent", toolkit: Toolkit.make(echoTool) })
    layer(
      Layer.mergeAll(
        makeToolCallModelLayer(),
        ToolExecutor.layerTest({
          replayPolicy: (request) => (request.call.name === "echo" ? "provider-idempotent" : "never"),
          execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
        }),
        journalLayer,
        unusedToolHandlerLayer,
      ),
    )("selects a concrete ToolExecutor request replay policy before journaling", (suite) => {
      suite.effect("selects a concrete ToolExecutor request replay policy before journaling", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "use echo", logicalOperationId: "replay-safe-run" }).pipe(
            Stream.runDrain,
          )
          expect(scheduled.find((operation) => operation.kind === "model")?.replayPolicy).toBe("never")
          expect(scheduled.find((operation) => operation.kind === "tool")?.replayPolicy).toBe("provider-idempotent")
        }),
      )
    })
  }

  it.effect("keeps operation keys stable across equivalent runs", () =>
    Effect.gen(function* () {
      const runKeys = () =>
        Effect.gen(function* () {
          const { scheduled, journalLayer } = captureJournal()
          const agent = Agent.make({ name: "key-stable-agent", toolkit: Toolkit.make(echoTool) })
          yield* provideScoped(
            Layer.mergeAll(
              makeToolCallModelLayer(),
              ToolExecutor.layerTest({
                execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
              }),
              journalLayer,
              unusedToolHandlerLayer,
            ),
            Agent.stream(agent, {
              prompt: "use echo",
              logicalOperationId: "logical-1",
              sessionId: "session-1",
            }).pipe(Stream.runDrain),
          )
          return scheduled.map((operation) => operation.key)
        })
      const first = yield* runKeys()
      const second = yield* runKeys()
      expect(first).toEqual(second)
      expect(first.some((key) => key.includes("logical-1:model:0:0:conversation"))).toBe(true)
    }),
  )

  it.effect("records bounded Session sync cursors as the path grows", () => {
    const outcomes = new Array<DurableDriver.OperationOutcome>()
    const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: (operation, outcome) =>
        Effect.sync(() => {
          if (operation.kind === "memory" && operation.key.includes(":memory:sync:")) outcomes.push(outcome)
        }),
      onCheckpoint: () => Effect.void,
    })
    const modelLayer = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" }))),
      }),
    )
    const agent = Agent.make({ name: "bounded-session-sync-agent" })

    return provideScoped(
      Layer.mergeAll(Session.layerMemory, modelLayer, journalLayer),
      Effect.gen(function* () {
        const before = yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* Session.acquire("bounded-session-sync")
            for (let index = 0; index < 256; index += 1) {
              yield* store.append({
                _tag: "Message",
                message: Prompt.makeMessage("user", {
                  content: [Prompt.makePart("text", { text: `history-${index}-${"x".repeat(32)}` })],
                }),
              })
            }
            return yield* store.path()
          }),
        )

        yield* Agent.stream(agent, {
          prompt: "continue",
          logicalOperationId: "bounded-session-sync",
          sessionId: "bounded-session-sync",
        }).pipe(Stream.runDrain)

        const path = yield* Effect.scoped(
          Session.acquire("bounded-session-sync").pipe(Effect.flatMap((store) => store.path())),
        )
        const succeeded = outcomes.flatMap((outcome) => (outcome._tag === "Succeeded" ? [outcome.value] : []))
        expect(path).toHaveLength(before.length + 2)
        expect(Json.stringify(path).length).toBeGreaterThan(10_000)
        expect(succeeded.length).toBeGreaterThanOrEqual(2)
        for (const value of succeeded) {
          expect(Schema.is(leafValueSchema)(value)).toBe(true)
          expect(Json.stringify(value).length).toBeLessThanOrEqual(100)
        }
      }),
    )
  })

  it.effect("gives same-turn same-count syncs with different transcripts distinct durable keys", () => {
    const recorded = new Map<
      string,
      { operation: DurableDriver.DriverOperation; outcome: DurableDriver.OperationOutcome }
    >()
    const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: (operation) =>
        Effect.gen(function* () {
          if (operation.kind !== "memory" || !operation.key.includes(":memory:sync:")) return undefined
          const existing = recorded.get(operation.key)
          if (existing === undefined) return undefined
          if (existing.operation.inputDigest !== operation.inputDigest) {
            return yield* Effect.die(
              new Error(`Persisted operation ${operation.key} does not match the scheduled operation`),
            )
          }
          return existing.outcome
        }),
      onCompleted: (operation, outcome) =>
        Effect.sync(() => {
          if (operation.kind === "memory" && operation.key.includes(":memory:sync:")) {
            recorded.set(operation.key, { operation, outcome })
          }
        }),
      onCheckpoint: () => Effect.void,
    })
    const modelLayer = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" }))),
      }),
    )
    const agent = Agent.make({ name: "sync-key-collision-agent" })
    const run = (prompt: string) =>
      provideScoped(
        Layer.mergeAll(Session.layerMemory, modelLayer, journalLayer),
        Agent.stream(agent, {
          prompt,
          history: Prompt.empty,
          logicalOperationId: "sync-key-collision",
          sessionId: "sync-key-collision",
        }).pipe(Stream.runDrain),
      )

    return Effect.gen(function* () {
      yield* run("first transcript")
      const firstKeys = new Set(recorded.keys())
      yield* run("other transcript")
      const secondKeys = [...recorded.keys()].filter((key) => !firstKeys.has(key))
      expect(firstKeys.size).toBeGreaterThan(0)
      expect(secondKeys.length).toBe(firstKeys.size)
      for (const { operation } of recorded.values()) {
        const input = yield* Schema.decodeUnknownEffect(transcriptInputSchema)(operation.input)
        expect(operation.key.endsWith(`:${input.transcriptDigest}`)).toBe(true)
      }
    })
  })

  it.effect("replays the exact Session path from its cursor without re-appending", () => {
    const recorded = new Map<string, DurableDriver.OperationOutcome>()
    const recordedOperations = new Map<string, DurableDriver.DriverOperation>()
    const modelParents = new Array<string | null>()
    const remembered = new Array<Prompt.Prompt>()
    let replayMemory = false
    let appendCalls = 0
    const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: (operation) =>
        Effect.sync(() =>
          replayMemory && operation.kind === "memory" && operation.key.includes(":memory:sync:")
            ? recorded.get(operation.key)
            : undefined,
        ),
      onCompleted: (operation, outcome) =>
        Effect.sync(() => {
          if (operation.kind === "memory" && operation.key.includes(":memory:sync:")) {
            recorded.set(operation.key, outcome)
            recordedOperations.set(operation.key, operation)
          }
          if (operation.kind === "model" && outcome._tag === "Succeeded") {
            const parent = Schema.decodeUnknownOption(sessionParentValueSchema)(outcome.value)
            if (Option.isSome(parent)) modelParents.push(parent.value.sessionParentId)
          }
        }),
      onCheckpoint: () => Effect.void,
    })
    const countedSessionLayer = Layer.effect(
      Session.SessionDirectory,
      Effect.gen(function* () {
        const directory = yield* Session.SessionDirectory
        return Session.SessionDirectory.of({
          acquire: (sessionId) =>
            directory.acquire(sessionId).pipe(
              Effect.map((inner) => ({
                ...inner,
                append: (entry, options) =>
                  Effect.sync(() => {
                    appendCalls += 1
                  }).pipe(Effect.andThen(inner.append(entry, options))),
              })),
            ),
        })
      }),
    ).pipe(Layer.provide(Session.layerMemory))
    const memoryLayer = Memory.layerTest({
      recall: () => Effect.succeed([]),
      remember: (input) =>
        Effect.sync(() => {
          remembered.push(input.transcript)
        }),
      forget: () => Effect.void,
    })
    const modelLayer = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" }))),
      }),
    )
    const agent = Agent.make({ name: "session-sync-replay-agent" })
    const run = (prompt = "reply") =>
      Agent.stream(agent, {
        prompt,
        history: Prompt.empty,
        logicalOperationId: "session-sync-replay",
        sessionId: "session-sync-replay",
        memory: { key: { agent: "session-sync-replay-agent", subject: "session-sync-replay" } },
      }).pipe(Stream.runDrain)

    return provideScoped(
      Layer.mergeAll(countedSessionLayer, memoryLayer, modelLayer, journalLayer),
      Effect.gen(function* () {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* Session.acquire("session-sync-replay")
            const compactionId = yield* store.reserveEntryId
            yield* store.appendCheckpoint({
              id: compactionId,
              parentId: null,
              projectedHistory: Prompt.empty,
              telemetry: [],
              summary: "prior summary",
            })
          }),
        )
        yield* run()
        const completedPath = yield* Effect.scoped(
          Session.acquire("session-sync-replay").pipe(Effect.flatMap((store) => store.path())),
        )
        expect(completedPath[0]?._tag).toBe("Compaction")
        const completedLeaf = completedPath.at(-1)?.id ?? null
        const expectedReplayPath = Session.buildMemoryContext(completedPath)
        expect(remembered).toEqual([expectedReplayPath])
        const advancedPath = yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* Session.acquire("session-sync-replay")
            yield* store.append({
              _tag: "Message",
              message: Prompt.makeMessage("user", {
                content: [Prompt.makePart("text", { text: "newer unrelated continuation" })],
              }),
            })
            return yield* store.path()
          }),
        )
        const firstSyncEntry = [...recorded.entries()].find(([, outcome]) => {
          if (outcome._tag !== "Succeeded") return false
          const leaf = Schema.decodeUnknownOption(leafValueSchema)(outcome.value)
          return Option.isSome(leaf) && leaf.value.leafId === modelParents[0]
        })
        const firstSync = firstSyncEntry?.[1]
        const firstSyncInput = yield* Schema.decodeUnknownEffect(transcriptInputSchema)(
          firstSyncEntry === undefined ? undefined : recordedOperations.get(firstSyncEntry[0])?.input,
        )
        expect(firstSyncInput.transcriptDigest).toMatch(/^[0-9a-f]{64}$/)
        expect(firstSync?._tag).toBe("Succeeded")
        if (firstSync?._tag !== "Succeeded" || firstSyncEntry === undefined) return
        const { leafId: cursorLeaf } = yield* Schema.decodeUnknownEffect(leafValueSchema)(firstSync.value)
        expect(cursorLeaf).not.toBe(completedLeaf)
        expect(modelParents).toEqual([cursorLeaf])
        const appendsBeforeReplay = appendCalls

        replayMemory = true
        yield* run()

        expect(appendCalls).toBe(appendsBeforeReplay)
        expect(
          yield* Effect.scoped(Session.acquire("session-sync-replay").pipe(Effect.flatMap((store) => store.path()))),
        ).toEqual(advancedPath)
        expect(modelParents).toEqual([cursorLeaf, cursorLeaf])
        expect(remembered).toEqual([expectedReplayPath, expectedReplayPath])

        recorded.set(firstSyncEntry[0], { ...firstSync, value: { leafId: "missing-session-cursor" } })
        const missingCursor = yield* run().pipe(Effect.flip)
        expect(missingCursor).toMatchObject({
          _tag: "tenetkit/core/AgentError",
          turn: 0,
        })
        expect(appendCalls).toBe(appendsBeforeReplay)
        expect(modelParents).toEqual([cursorLeaf, cursorLeaf])
        for (const malformed of [{}, [], "cursor", 1, { leafId: undefined }]) {
          recorded.set(firstSyncEntry[0], { ...firstSync, value: malformed })
          const invalidCursor = yield* run().pipe(Effect.flip)
          expect(invalidCursor).toMatchObject({ _tag: "tenetkit/core/AgentError", turn: 0 })
          expect(appendCalls).toBe(appendsBeforeReplay)
          expect(modelParents).toEqual([cursorLeaf, cursorLeaf])
        }
      }),
    )
  })

  it.effect("replays one semantic model result without contacting the provider", () =>
    Effect.gen(function* () {
      const recorded = new Map<string, DurableDriver.OperationOutcome>()
      let replay = false
      let providerCalls = 0
      const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
        onScheduled: (operation) => Effect.sync(() => (replay ? recorded.get(operation.key) : undefined)),
        onCompleted: (operation, outcome) =>
          Effect.sync(() => {
            recorded.set(operation.key, outcome)
          }),
        onCheckpoint: () => Effect.void,
      })
      const modelLayer = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () => {
            providerCalls += 1
            return withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "text", delta: "durable" })))
          },
        }),
      )
      const agent = Agent.make({ name: "semantic-replay-agent" })
      const run = (prompt: string) =>
        provideScoped(
          Layer.mergeAll(modelLayer, journalLayer),
          Agent.stream(agent, {
            prompt,
            logicalOperationId: "semantic-replay",
            sessionId: "semantic-replay",
          }).pipe(Stream.runCollect),
        )

      const live = yield* run("reply")
      replay = true
      const replayed = yield* run("reply")

      expect(providerCalls).toBe(1)
      expect(live.at(-1)).toEqual(replayed.at(-1))
      const outcome = recorded.get("semantic-replay:model:0:0:conversation")
      expect(outcome?._tag).toBe("Succeeded")
      if (outcome?._tag === "Succeeded") {
        expect(outcome.value).toMatchObject({ turn: 0 })
        expect(outcome.value).toHaveProperty("content.0", expect.objectContaining({ type: "text", text: "durable" }))
        expect(outcome.value).not.toHaveProperty("values")
        expect(outcome.value).not.toHaveProperty("messages")
      }
    }),
  )

  it.effect("surfaces a model completion acknowledgement failure through Agent.stream", () =>
    Effect.gen(function* () {
      const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
        onScheduled: () => Effect.void,
        onCompleted: (operation: DurableDriver.DriverOperation) =>
          operation.kind === "model"
            ? Effect.fail(DurableDriver.DriverError.make({ message: "model completion unavailable" }))
            : Effect.void,
        onCheckpoint: () => Effect.void,
      })
      const modelLayer = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () =>
            withProviderFinish(
              Stream.make(
                Response.makePart("tool-call", {
                  id: "paid-call",
                  name: "echo",
                  params: { text: "must not execute" },
                  providerExecuted: false,
                }),
              ),
            ),
        }),
      )

      const failure = yield* provideScoped(
        Layer.mergeAll(modelLayer, journalLayer, unusedToolHandlerLayer),
        Agent.stream(Agent.make({ name: "model-completion-failure", toolkit: Toolkit.make(echoTool) }), {
          prompt: "reply",
          sessionId: "model-completion-failure",
        }).pipe(Stream.runDrain, Effect.flip),
      )
      expect(failure).toMatchObject({
        _tag: "tenetkit/core/DriverError",
        message: "model completion unavailable",
      })
    }),
  )

  it.effect("replays a settled compacted Session model request after outcome-before-checkpoint interruption", () =>
    Effect.gen(function* () {
      const rawPrompt = Prompt.fromMessages([
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "raw " }), Prompt.makePart("text", { text: "provider request" })],
        }),
      ])
      const compactedRequest = Prompt.make("exact compacted provider request")
      const normalizedCompactionInputs = new Array<Prompt.Prompt>()
      const providerPrompts = {
        baseline: new Array<Prompt.Prompt>(),
        recovery: new Array<Prompt.Prompt>(),
      }
      let activeRun: keyof typeof providerPrompts = "baseline"
      const compactionLayer = Compaction.layerTest({
        maybeCompact: (request) =>
          Effect.sync(() => {
            const context = Prompt.concat(request.history, request.prompt)
            if (Json.stringify(context.content).includes("exact compacted provider request")) return Option.none()
            normalizedCompactionInputs.push(request.prompt)
            return Option.some({
              _tag: "Microcompact" as const,
              history: Prompt.empty,
              prompt: compactedRequest,
            })
          }),
      })
      const modelLayer = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: (options) => {
            const prompt = Prompt.fromMessages(options.prompt.content)
            providerPrompts[activeRun].push(prompt)
            const isDownstream = Json.stringify(prompt.content).includes('"type":"tool-result"')
            return withProviderFinish(
              isDownstream
                ? Stream.make(Response.makePart("text-delta", { id: "final", delta: "final answer" }))
                : Stream.make(
                    Response.makePart("tool-call", {
                      id: "durable-echo",
                      name: "echo",
                      params: { text: "replayed" },
                      providerExecuted: false,
                    }),
                  ),
            )
          },
        }),
      )
      const targetOperation = "compacted-recovery:model:0:0:conversation"
      let pendingCheckpoint: DurableDriver.DriverCheckpoint | undefined
      let settledOutcome: DurableDriver.OperationOutcome | undefined
      let replaySettled = false
      const completionStarted = yield* Deferred.make<void>()
      const completionRelease = yield* Deferred.make<void>()
      const journal: DurableDriver.Journal = {
        onScheduled: (operation, checkpoint) =>
          Effect.sync(() => {
            if (operation.key !== targetOperation) return undefined
            if (replaySettled) return settledOutcome
            pendingCheckpoint = checkpoint
            return undefined
          }),
        onCompleted: (operation, outcome) => {
          if (operation.key !== targetOperation || replaySettled) return Effect.void
          return Effect.sync(() => {
            settledOutcome = outcome
          }).pipe(
            Effect.andThen(Deferred.succeed(completionStarted, undefined)),
            Effect.andThen(Deferred.await(completionRelease)),
            Effect.andThen(
              Effect.fail(DurableDriver.DriverError.make({ message: "simulated lost completion acknowledgement" })),
            ),
          )
        },
        onCheckpoint: () => Effect.void,
      }
      const agent = Agent.make({
        name: "compacted-recovery-agent",
        toolkit: Toolkit.make(echoTool),
      })
      const executable = ExecutableManifest.makeTest(agent.name, undefined)

      yield* provideScoped(
        Layer.mergeAll(
          modelLayer,
          compactionLayer,
          ToolExecutor.layerTest({
            execute: () => Effect.succeed({ _tag: "Success", result: "echoed", encodedResult: "echoed" }),
          }),
          Layer.succeed(DurableDriver.DriverJournal, journal),
          unusedToolHandlerLayer,
          Session.layerMemory,
        ),
        Effect.gen(function* () {
          const sessionContext = (sessionId: string) =>
            Effect.scoped(
              Session.acquire(sessionId).pipe(
                Effect.flatMap((session) => session.path()),
                Effect.map(Session.buildContext),
              ),
            )
          const baseline = yield* Agent.stream(agent, {
            prompt: rawPrompt,
            logicalOperationId: "compacted-baseline",
            executableRef: executable.ref,
            sessionId: "compacted-baseline",
            compaction: { contextWindow: 1 },
          }).pipe(Stream.runCollect)
          const baselineFinal = yield* sessionContext("compacted-baseline")

          activeRun = "recovery"
          const recoveryFiber = yield* Agent.stream(agent, {
            prompt: rawPrompt,
            logicalOperationId: "compacted-recovery",
            executableRef: executable.ref,
            sessionId: "compacted-recovery",
            compaction: { contextWindow: 1 },
          }).pipe(Stream.runDrain, Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(completionStarted)
          yield* Deferred.succeed(completionRelease, undefined)
          const interrupted = yield* Fiber.await(recoveryFiber)
          expect(interrupted._tag).toBe("Failure")
          expect(providerPrompts.recovery).toHaveLength(1)
          expect(pendingCheckpoint).toBeDefined()
          expect(settledOutcome?._tag).toBe("Succeeded")
          const pendingState = yield* Schema.decodeUnknownEffect(pendingPromptStateSchema)(pendingCheckpoint?.state)
          expect(pendingState.pending.key).toBe(targetOperation)
          expect(pendingState.pending.input.promptDigest).toMatch(/^[0-9a-f]{64}$/)
          if (settledOutcome?._tag === "Succeeded") {
            expect(settledOutcome.value).toMatchObject({ replayFromHistory: false })
          }
          expect((yield* sessionContext("compacted-recovery")).content).toEqual(compactedRequest.content)

          replaySettled = true
          const recovered = yield* Agent.stream(agent, {
            prompt: Prompt.empty,
            logicalOperationId: "compacted-recovery",
            executableRef: executable.ref,
            driverCheckpoint: pendingCheckpoint!,
            sessionId: "compacted-recovery",
            compaction: { contextWindow: 1 },
          }).pipe(Stream.runCollect)
          const recoveredFinal = yield* sessionContext("compacted-recovery")

          expect(normalizedCompactionInputs).toHaveLength(2)
          for (const input of normalizedCompactionInputs) {
            const message = input.content[0]
            expect(message?.role).toBe("user")
            expect(Array.isArray(message?.content) ? message.content : []).toEqual([
              expect.objectContaining({ type: "text", text: "raw provider request" }),
            ])
          }
          expect(providerPrompts.baseline).toHaveLength(2)
          expect(providerPrompts.recovery).toHaveLength(2)
          const expectedRequest = withCacheBreakpoints(compactedRequest, "conversation", undefined)
          expect(providerPrompts.baseline[0]?.content).toEqual(expectedRequest.content)
          expect(providerPrompts.recovery[0]?.content).toEqual(expectedRequest.content)
          expect(providerPrompts.recovery[1]?.content).toEqual(providerPrompts.baseline[1]?.content)
          expect(recoveredFinal.content).toEqual(baselineFinal.content)
          expect(recovered.at(-1)).toEqual(baseline.at(-1))
        }),
      )
    }),
  )

  it.effect("replays reordered parallel tool calls by stable call id", () =>
    Effect.gen(function* () {
      const recorded = new Map<string, DurableDriver.OperationOutcome>()
      let replayTools = false
      let executions = 0
      const journalLayer = Layer.succeed(DurableDriver.DriverJournal, {
        onScheduled: (operation) =>
          Effect.sync(() => (replayTools && operation.kind === "tool" ? recorded.get(operation.key) : undefined)),
        onCompleted: (operation, outcome) =>
          Effect.sync(() => {
            if (operation.kind === "tool") recorded.set(operation.key, outcome)
          }),
        onCheckpoint: () => Effect.void,
      })
      const modelLayer = (ids: ReadonlyArray<string>) => {
        let modelCalls = 0
        return Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              modelCalls += 1
              return withProviderFinish(
                modelCalls === 1
                  ? Stream.fromIterable(
                      ids.map((id) =>
                        Response.makePart("tool-call", {
                          id,
                          name: "echo",
                          params: { text: id },
                          providerExecuted: false,
                        }),
                      ),
                    )
                  : Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" })),
              )
            },
          }),
        )
      }
      const agent = Agent.make({
        name: "parallel-replay-agent",
        toolkit: Toolkit.make(echoTool),
        toolScheduling: { maxConcurrency: 2, parallelSafe: ["echo"] },
      })
      const run = (ids: ReadonlyArray<string>) =>
        provideScoped(
          Layer.mergeAll(
            modelLayer(ids),
            ToolExecutor.layerTest({
              execute: (request) =>
                Effect.sync(() => {
                  executions += 1
                  return { _tag: "Success" as const, result: request.call.id, encodedResult: request.call.id }
                }),
            }),
            journalLayer,
            unusedToolHandlerLayer,
          ),
          Agent.stream(agent, {
            prompt: "use echo twice",
            logicalOperationId: "parallel-replay",
            sessionId: "parallel-replay",
          }).pipe(Stream.runDrain),
        )

      yield* run(["call-a", "call-b"])
      expect(executions).toBe(2)
      replayTools = true
      yield* run(["call-b", "call-a"])
      expect(executions).toBe(2)
      expect([...recorded.keys()].toSorted()).toEqual([
        "parallel-replay:tool:0:call-a:echo",
        "parallel-replay:tool:0:call-b:echo",
      ])
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
      expect(error._tag).toBe("tenetkit/core/DriverUnknownReplay")
    }),
  )

  it.effect("records interruption after a non-replayable effect as unknown without losing interruption", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "interrupt", sessionId: "interrupt" })
      const initial = yield* driver.initial({ prompt: Prompt.make("interrupt"), budget: RunBudget.make({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.void,
          onCompleted: (_operation, outcome) =>
            Effect.sync(() => lifecycle.push(outcome._tag === "Unknown" ? "unknown persisted" : outcome._tag)),
          onCheckpoint: () => Effect.void,
        },
      })
      const exit = yield* interpreter
        .run(
          { kind: "tool", key: "interrupt:tool", input: {}, replayPolicy: "never" },
          Effect.acquireUseRelease(
            Effect.sync(() => lifecycle.push("effect committed")),
            () => Effect.interrupt,
            () => Effect.sync(() => lifecycle.push("handler finalized")),
          ),
        )
        .pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(exit.cause.reasons.every(Cause.isInterruptReason)).toBe(true)
      expect(lifecycle).toEqual(["effect committed", "handler finalized", "unknown persisted"])
      expect((yield* interpreter.recorded)[0]?.outcome).toEqual({
        _tag: "Unknown",
        operationId: "interrupt:tool",
      })
    }),
  )

  it.effect("preserves typed failures and defects while classifying only defects as uncertain", () =>
    Effect.gen(function* () {
      const outcomes: Array<DurableDriver.OperationOutcome> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "classification", sessionId: "classification" })
      const initial = yield* driver.initial({ prompt: Prompt.make("classification"), budget: RunBudget.make({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.void,
          onCompleted: (_operation, outcome) => Effect.sync(() => outcomes.push(outcome)),
          onCheckpoint: () => Effect.void,
        },
      })
      const typed = { _tag: "TypedHandlerFailure" as const, detail: "kept" }
      expect(
        yield* interpreter
          .run({ kind: "tool", key: "classification:typed", input: {}, replayPolicy: "never" }, Effect.fail(typed))
          .pipe(Effect.flip),
      ).toBe(typed)
      const defect = new Error("handler defect")
      const defectExit = yield* interpreter
        .run({ kind: "tool", key: "classification:defect", input: {}, replayPolicy: "never" }, Effect.die(defect))
        .pipe(Effect.exit)
      expect(defectExit._tag).toBe("Failure")
      if (defectExit._tag === "Failure") expect(Cause.squash(defectExit.cause)).toBe(defect)
      expect(outcomes).toEqual([
        { _tag: "Failed", error: typed },
        { _tag: "Unknown", operationId: "classification:defect" },
      ])
    }),
  )

  it.effect("leaves interrupted retry-safe effects pending under the same identity", () =>
    Effect.gen(function* () {
      const completed: Array<DurableDriver.OperationOutcome> = []
      const scheduled: Array<string> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "retry-safe", sessionId: "retry-safe" })
      const initial = yield* driver.initial({ prompt: Prompt.make("retry-safe"), budget: RunBudget.make({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: (operation) =>
            Effect.sync(() => {
              scheduled.push(operation.key)
              return undefined
            }),
          onCompleted: (_operation, outcome) => Effect.sync(() => completed.push(outcome)),
          onCheckpoint: () => Effect.void,
        },
      })
      const spec = {
        kind: "model" as const,
        key: "retry-safe:model",
        input: {},
        replayPolicy: "provider-idempotent" as const,
      }
      yield* interpreter.run(spec, Effect.interrupt).pipe(Effect.exit)
      expect(yield* interpreter.run(spec, Effect.succeed("retried"))).toBe("retried")
      expect(scheduled).toEqual([spec.key, spec.key])
      expect(completed).toEqual([{ _tag: "Succeeded", value: "retried" }])
    }),
  )

  it.effect("replays a pending journaled stream without recharging or redispatching the provider", () =>
    Effect.gen(function* () {
      const logicalOperationId = "stream-replay"
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId, sessionId: logicalOperationId })
      const allocated = RunBudget.make({ modelCalls: 3 })
      const charged = yield* RunBudget.charge(allocated, { modelCalls: 1 })
      const pendingSpec = {
        kind: "model" as const,
        key: `${logicalOperationId}:model:0:0`,
        input: { turn: 0, modelCallOrdinal: 0 },
        replayPolicy: "provider-idempotent" as const,
      }
      const initial: DurableDriver.DriverCheckpoint = {
        driverVersion: DurableDriver.currentDriverVersion,
        turn: 0,
        budget: charged,
        state: {
          logicalOperationId,
          sessionId: logicalOperationId,
          modelCallOrdinal: 1,
          modelCallOrdinalStart: 0,
          pending: pendingSpec,
        },
      }
      const scheduled = new Array<string>()
      let providerDispatches = 0
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: (operation) =>
            Effect.sync(() => {
              scheduled.push(operation.key)
              return operation.key === pendingSpec.key
                ? ({ _tag: "Succeeded", value: ["first", "second", "third"] } as const)
                : undefined
            }),
          onCompleted: () => Effect.void,
          onCheckpoint: () => Effect.void,
        },
      })
      const providerStream = (values: ReadonlyArray<string>) =>
        Stream.unwrap(
          Effect.sync(() => {
            providerDispatches += 1
            return Stream.fromIterable(values)
          }),
        )

      expect(yield* Stream.runCollect(interpreter.runStream(pendingSpec, providerStream(["redispatched"])))).toEqual([
        "first",
        "second",
        "third",
      ])
      const replayedCheckpoint = yield* interpreter.checkpoint
      expect(replayedCheckpoint.state).not.toHaveProperty("pending")
      expect(replayedCheckpoint.state).toMatchObject({ modelCallOrdinal: 1 })
      expect(replayedCheckpoint.budget.remaining.modelCalls).toBe(2)
      expect(providerDispatches).toBe(0)

      const nextSpec = {
        ...pendingSpec,
        key: `${logicalOperationId}:model:0:1`,
        input: { turn: 0, modelCallOrdinal: 1 },
      }
      expect(yield* Stream.runCollect(interpreter.runStream(nextSpec, providerStream(["next"])))).toEqual(["next"])
      const nextCheckpoint = yield* interpreter.checkpoint
      expect(nextCheckpoint.state).not.toHaveProperty("pending")
      expect(nextCheckpoint.state).toMatchObject({ modelCallOrdinal: 2 })
      expect(nextCheckpoint.budget.remaining.modelCalls).toBe(1)
      expect(scheduled).toEqual([pendingSpec.key, nextSpec.key])
      expect(providerDispatches).toBe(1)
    }),
  )

  it.effect("journals and replays a custom stream success without retaining emitted values", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "stream-codec", sessionId: "stream-codec" })
      const initial = yield* driver.initial({ prompt: Prompt.make("stream-codec"), budget: RunBudget.make({}) })
      const outcomes = new Map<string, DurableDriver.OperationOutcome>()
      let replay = false
      let sourceRuns = 0
      let total = 0
      let count = 0
      let completions = 0
      const successCodec: DurableDriver.StreamSuccessCodec<number, { readonly total: number; readonly count: number }> =
        {
          observe: (value) => {
            total += value
            count += 1
          },
          complete: () => {
            completions += 1
            return { total, count }
          },
          replay: (success) => Stream.fromIterable([success.total, success.count]),
        }
      const makeInterpreter = DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: (operation) => Effect.succeed(replay ? outcomes.get(operation.key) : undefined),
          onCompleted: (operation, outcome) => Effect.sync(() => void outcomes.set(operation.key, outcome)),
          onCheckpoint: () => Effect.void,
        },
      })
      const spec = { kind: "tool" as const, key: "stream-codec:tool", input: {}, replayPolicy: "never" as const }
      const source = Stream.unwrap(
        Effect.sync(() => {
          sourceRuns += 1
          return Stream.fromIterable([1, 2, 3])
        }),
      )

      expect(yield* Stream.runCollect((yield* makeInterpreter).runStream(spec, source, { successCodec }))).toEqual([
        1, 2, 3,
      ])
      expect(outcomes.get(spec.key)).toEqual({ _tag: "Succeeded", value: { total: 6, count: 3 } })

      replay = true
      expect(
        yield* Stream.runCollect(
          (yield* makeInterpreter).runStream(spec, Stream.die("replayed stream source must not execute"), {
            successCodec,
          }),
        ),
      ).toEqual([6, 3])
      expect(sourceRuns).toBe(1)

      replay = false
      const failedSpec = { ...spec, key: "stream-codec:failed" }
      const failure = yield* (yield* makeInterpreter)
        .runStream(failedSpec, Stream.make(4).pipe(Stream.concat(Stream.fail("stream failed"))), { successCodec })
        .pipe(Stream.runDrain, Effect.flip)
      expect(failure).toBe("stream failed")
      expect(completions).toBe(1)
      expect(outcomes.get(failedSpec.key)).toEqual({ _tag: "Failed", error: "stream failed" })
    }),
  )

  it.effect("surfaces successful stream acknowledgement failure in the typed channel", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "stream-ack", sessionId: "stream-ack" })
      const initial = yield* driver.initial({ prompt: Prompt.make("stream-ack"), budget: RunBudget.make({}) })
      let completionAttempts = 0
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.void,
          onCompleted: () => {
            completionAttempts += 1
            return DurableDriver.DriverError.make({ message: "completion acknowledgement unavailable" })
          },
          onCheckpoint: () => Effect.void,
        },
      })

      const failure = yield* interpreter
        .runStream(
          { kind: "tool", key: "stream-ack:tool", input: {}, replayPolicy: "pure" },
          Stream.make("paid result"),
        )
        .pipe(Stream.runDrain, Effect.flip)

      expect(failure).toMatchObject({
        _tag: "tenetkit/core/DriverError",
        message: "completion acknowledgement unavailable",
      })
      expect(completionAttempts).toBe(1)
    }),
  )

  it.effect("records a defective non-replayable stream as unknown after stream finalizers", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "stream", sessionId: "stream" })
      const initial = yield* driver.initial({ prompt: Prompt.make("stream"), budget: RunBudget.make({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.void,
          onCompleted: (_operation, outcome) => Effect.sync(() => lifecycle.push(outcome._tag)),
          onCheckpoint: () => Effect.void,
        },
      })
      const defect = new Error("stream defect")
      const exit = yield* interpreter
        .runStream(
          { kind: "tool", key: "stream:tool", input: {}, replayPolicy: "never" },
          Stream.die(defect).pipe(Stream.ensuring(Effect.sync(() => lifecycle.push("stream finalized")))),
        )
        .pipe(Stream.runDrain, Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.squash(exit.cause)).toBe(defect)
      expect(lifecycle).toEqual(["stream finalized", "Unknown"])
    }),
  )

  {
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
      Session.layerMemory,
      unusedToolHandlerLayer,
    )
    layer(services)("binds suspension checkpoints to resume tokens", (suite) => {
      suite.effect("binds suspension checkpoints to resume tokens", () =>
        Effect.gen(function* () {
          const agent = Agent.make({ name: "driver-suspend-agent", toolkit: Toolkit.make(echoTool) })
          const suspended = yield* Agent.stream(agent, {
            prompt: "wait",
            logicalOperationId: "suspend-run",
            sessionId: "driver-suspend",
          }).pipe(Stream.runDrain, Effect.flip)
          if (suspended._tag !== "tenetkit/core/AgentSuspended") return expect.unreachable()
          expect(
            scheduled.filter((operation) => operation.kind === "tool" && operation.key === suspended.waits[0]?.waitId),
          ).toHaveLength(1)
          expect(scheduled.some((operation) => operation.kind === "wait")).toBe(false)
          streamPhase = "resume"
          yield* Agent.stream(agent, {
            prompt: "ignored",
            logicalOperationId: "suspend-run",
            sessionId: "driver-suspend",
            resume: {
              suspension: suspended,
              resolutions: [
                {
                  waitId: suspended.waits[0]!.waitId,
                  resolution: { _tag: "ToolResult", result: "done", encodedResult: "done" },
                },
              ],
            },
          }).pipe(Stream.runDrain)
          expect(scheduled.filter((operation) => operation.kind === "tool")).toHaveLength(1)
          expect(scheduled.some((operation) => operation.kind === "wait")).toBe(false)
        }),
      )
    })
  }
})
