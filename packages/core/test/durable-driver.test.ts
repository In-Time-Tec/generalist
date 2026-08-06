import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Layer, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent, AgentManifest, DurableDriver, ExecutableManifest, Pins, RunBudget, ToolExecutor } from "../src/index"

import { Json } from "./json.js"
import { withProviderFinish } from "./provider-finish.js"
import { unusedToolHandlerLayer } from "./tool-handler-layer.js"
import { sha256Text } from "../src/durable/canonical-json.js"
import { edgeCount, incrementEdge } from "../src/agent/handoff-state.js"
import { applyHandoffCommit } from "../src/durable/loop-driver.js"
import { makeAgent, makeExecutable } from "../src/durable/pin.js"

const persistenceLayer = Chat.layerPersisted({ storeId: "durable-driver-test" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const roundTrip = (value: unknown): unknown => Json.parse(Json.stringify(value))
const agentEntry = (agent: AgentManifest.PinnedAgent) => ({ _tag: "Agent" as const, ...agent })

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
    const transcript = Prompt.make("committed transcript")
    const commit = {
      _tag: "HandoffCommit" as const,
      state: {
        root: "a",
        active: "b",
        path: [{ handoffId: "h1", source: "a", target: "b", turn: 0 }],
        edgeCounts: [{ source: "a", target: "b", count: 1 }],
        handoffCount: 1,
        pendingContinuation: { prompt: Prompt.make("continue"), instructions: "Act as B." },
      },
      transcript,
      targetAgentPin: child,
    }
    return Effect.gen(function* () {
      const checkpoint = yield* applyHandoffCommit(
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
      base({
        children: [
          {
            selection: "delegate",
            agent: Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"d".repeat(64)}`),
          },
        ],
      }),
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
    const original = base({ compaction })
    for (const changed of [
      base({ compaction: { ...compaction, contextWindow: 64_000 } }),
      base({ compaction: { ...compaction, reserveTokens: 4_000 } }),
      base({ compaction: { ...compaction, keepRecentTokens: 8_000 } }),
      base({ compaction: { ...compaction, strategyIdentity: "default:v2" } }),
      base({ compaction: { ...compaction, summaryPromptIdentity: "summary:v2" } }),
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
    const missing = Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"c".repeat(64)}`)
    expect(() => ExecutableManifest.make({ root: missing, entries: [agentEntry(agent)] })).toThrow("Root")
    expect(() => ExecutableManifest.make({ root: agent.pin, active: missing, entries: [agentEntry(agent)] })).toThrow(
      "Active",
    )
    const dangling = base({ children: [{ selection: "child", agent: missing }] })
    expect(() => ExecutableManifest.make({ root: dangling.pin, entries: [agentEntry(dangling)] })).toThrow(
      "Agent binding",
    )
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
        ref: { ...executable.ref, executable: ExecutableManifest.makeTest("wrong").ref.executable },
      }
      yield* ExecutableManifest.decode(wrongExecutable).pipe(Effect.flip)
      const altered = {
        ...executable,
        manifest: {
          ...executable.manifest,
          entries: [{ ...executable.manifest.entries[0]!, manifest: { ...agent.manifest, name: "altered" } }],
        },
      }
      yield* ExecutableManifest.decode(altered).pipe(Effect.flip)
    }),
  )

  it("pins root and active selection, canonicalizes entries, and rejects cycles", () => {
    const child = base({ name: "child", tools: [] })
    const root = base({ children: [{ selection: "delegate", agent: child.pin }] })
    const left = ExecutableManifest.make({ root: root.pin, entries: [agentEntry(root), agentEntry(child)] })
    const reordered = ExecutableManifest.make({ root: root.pin, entries: [agentEntry(child), agentEntry(root)] })
    const activeChild = ExecutableManifest.make({
      root: root.pin,
      active: child.pin,
      entries: [agentEntry(root), agentEntry(child)],
    })
    expect(left.ref.executable).toBe(reordered.ref.executable)
    expect(left.ref.executable).toBe(activeChild.ref.executable)
    expect(activeChild.ref.active).toBe(child.pin)
    expect("active" in left.manifest).toBe(false)
    expect(() => ExecutableManifest.validateRef(activeChild.ref, left.manifest)).not.toThrow()
    const absent = Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"d".repeat(64)}`)
    expect(() => ExecutableManifest.validateRef({ ...left.ref, active: absent }, left.manifest)).toThrow()

    const pinA = Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"a".repeat(64)}`)
    const pinB = Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"b".repeat(64)}`)
    const manifestA = { ...base({ name: "a" }).manifest, children: [{ selection: "b", agent: pinB }] }
    const manifestB = { ...base({ name: "b" }).manifest, children: [{ selection: "a", agent: pinA }] }
    expect(() =>
      ExecutableManifest.make({
        root: pinA,
        entries: [
          { _tag: "Agent", pin: pinA, manifest: manifestA },
          { _tag: "Agent", pin: pinB, manifest: manifestB },
        ],
      }),
    ).toThrow("Cyclic")
  })

  it("rejects malformed pin kinds, duplicate names and unsupported JSON", () => {
    expect(() => Schema.decodeUnknownSync(Pins.AgentPin)(String(model))).toThrow()
    expect(() =>
      base({
        tools: [
          { name: "same", pin: weather },
          { name: "same", pin: Pins.makeCapability("x") },
        ],
      }),
    ).toThrow("Duplicate")
    const child = Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"e".repeat(64)}`)
    expect(() =>
      base({
        children: [
          { selection: "same", agent: child },
          {
            selection: "same",
            agent: Schema.decodeUnknownSync(Pins.AgentPin)(`agent-pin:v1:sha256:${"f".repeat(64)}`),
          },
        ],
      }),
    ).toThrow("Duplicate child selection")
    expect(() =>
      base({
        children: [
          { selection: "one", agent: child },
          { selection: "two", agent: child },
        ],
      }),
    ).toThrow("Duplicate child pin")
    expect(() => base({ toolScheduling: { maxConcurrency: 2, parallelSafe: ["missing"] } })).toThrow("undeclared tool")
    expect(() => base({ toolScheduling: { maxConcurrency: 2, parallelSafe: ["weather", "weather"] } })).toThrow(
      "duplicate tool",
    )
    expect(() => Pins.makeCapability({ invalid: () => undefined })).toThrow("Unsupported value")
    expect(() => Pins.makeCapability(Symbol("invalid"))).toThrow("Unsupported value")
    const hidden = { visible: true }
    Object.defineProperty(hidden, "hidden", { value: true })
    expect(() => Pins.makeCapability(hidden)).toThrow("Unsupported property")
    const accessor = {}
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => true })
    expect(() => Pins.makeCapability(accessor)).toThrow("Unsupported property")
    const sparse: Array<unknown> = []
    sparse.length = 1
    expect(() => Pins.makeCapability(sparse)).toThrow("Sparse array")
    const extra = [1]
    Object.assign(extra, { extra: true })
    expect(() => Pins.makeCapability(extra)).toThrow("extra array property")
    const symbolKey = { value: true }
    Object.defineProperty(symbolKey, Symbol("hidden"), { value: true })
    expect(() => Pins.makeCapability(symbolKey)).toThrow("symbol property")
    expect(() =>
      Schema.decodeUnknownSync(AgentManifest.AgentManifest, { onExcessProperty: "error" })({
        ...base().manifest,
        extra: true,
      }),
    ).toThrow()
  })
})

describe("RunBudget", () => {
  it("rejects negative, fractional, and unsafe dimensions", () => {
    for (const modelCalls of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => RunBudget.allocate({ modelCalls })).toThrow()
    }
    expect(() => RunBudget.make({}, -1)).toThrow()
  })

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
  const input = {
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
      expect(error._tag).toBe("@batonfx/core/DriverError")
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
  it.effect("rejects a checkpoint with no executable identity for another standalone Agent", () =>
    Effect.gen(function* () {
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "first", sessionId: "first" })
      const checkpoint = yield* driver.initial({ prompt: Prompt.make("first"), budget: RunBudget.allocate({}) })
      const second = Agent.make({ name: "second" })
      const failure = yield* Agent.stream(second, { prompt: "second", driverCheckpoint: checkpoint }).pipe(
        Stream.runDrain,
        Effect.provide(makeToolCallModelLayer()),
        Effect.flip,
      )
      expect(failure._tag).toBe("@batonfx/core/DriverStateInvalid")
      expect(failure.message).toContain("explicit executable identity")
    }),
  )

  for (const kind of ["model", "structured-output"] as const) {
    it.effect(`reconciles a pending ${kind} without recharging its ordinal or budget`, () =>
      Effect.gen(function* () {
        const allocated = RunBudget.allocate({ modelCalls: 3 })
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
          budget: RunBudget.allocate({ modelCalls: 2 }),
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
      expect(failure._tag).toBe("@batonfx/core/DriverStateInvalid")
    }),
  )

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

  it.effect("records interruption after a non-replayable effect as unknown without losing interruption", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "interrupt", sessionId: "interrupt" })
      const initial = yield* driver.initial({ prompt: Prompt.make("interrupt"), budget: RunBudget.allocate({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.succeed(undefined),
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
      const initial = yield* driver.initial({ prompt: Prompt.make("classification"), budget: RunBudget.allocate({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.succeed(undefined),
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
      const initial = yield* driver.initial({ prompt: Prompt.make("retry-safe"), budget: RunBudget.allocate({}) })
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

  it.effect("records a defective non-replayable stream as unknown after stream finalizers", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId: "stream", sessionId: "stream" })
      const initial = yield* driver.initial({ prompt: Prompt.make("stream"), budget: RunBudget.allocate({}) })
      const interpreter = yield* DurableDriver.makeInline({
        driver,
        initial,
        journal: {
          onScheduled: () => Effect.succeed(undefined),
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
