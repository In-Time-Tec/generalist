import "./suites/bun-cell-isolation-suite.js"
import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { ToolContext, ToolExecutor } from "tenetkit"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, KernelProfile, TestKernel } from "../../src/repl/index"

const sessionId = "session-a"

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace", dataRoot: "/data" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 1000 },
  trustMode: "trusted-local",
})

interface ToolCallParams {
  readonly code?: string
}

const toolCall = (name: string, params: ToolCallParams): Response.ToolCallPart<string, unknown> =>
  Schema.decodeSync(Response.ToolCallPart(name, Schema.Unknown))({
    type: "tool-call",
    id: "call-1",
    name,
    params,
    providerExecuted: false,
  })

const request = (code: string): ToolExecutor.Request => {
  const call = toolCall(CellTool.name, { code })
  return { call, toolCallBatch: { calls: [call] }, turn: 0, toolCallIndex: 0, agentName: "agent", sessionId }
}

const script = (input: { readonly code: string }): TestKernel.Script => {
  if (input.code === "throw") return { _tag: "Throw", name: "Error", message: "boom", stderr: "boom" }
  if (input.code === "unavailable") {
    return {
      _tag: "Failure",
      failure: Cell.KernelUnavailable.make({ sessionId, reason: "start-failed", message: "no kernel" }),
    }
  }
  return { _tag: "Value", value: input.code, stdout: "out" }
}

const collected: Array<ToolContext.Progress> = []

const contextLayer = ToolContext.layerTest({
  signal: new AbortController().signal,
  emit: (progress) =>
    Effect.sync(() => {
      collected.push(progress)
    }),
  sessionId,
  toolCallId: "call-1",
  operationKey: "operation-1",
})

const poolLayer = TestKernel.layerTestPool({ profile, script })

const executorLayer = CellTool.layer.pipe(Layer.provideMerge(Layer.mergeAll(contextLayer, poolLayer)))

describe("cell tool schema", () => {
  standalone("advertises exactly one tool named typescript", () => {
    expect(CellTool.tool.name).toBe("typescript")
    expect(Object.keys(CellTool.toolkit.tools)).toEqual(["typescript"])
  })

  standalone("declares exactly one parameter named code", () => {
    expect(Object.keys(CellTool.Parameters.fields)).toEqual(["code"])
  })

  standalone("bounds the authored source", () => {
    expect(Schema.is(CellTool.Parameters)({ code: "x".repeat(CellTool.maxSourceBytes) })).toBe(true)
    expect(Schema.is(CellTool.Parameters)({ code: "x".repeat(CellTool.maxSourceBytes + 1) })).toBe(false)
  })

  standalone("accepts an empty cell", () => {
    expect(Schema.is(CellTool.Parameters)({ code: "" })).toBe(true)
  })

  standalone("rejects any additional parameter", () => {
    expect(() => Schema.decodeUnknownSync(CellTool.Parameters)({ code: "1", timeout: 5 })).not.toThrow()
    expect(Schema.encodeSync(CellTool.Parameters)(Schema.decodeSync(CellTool.Parameters)({ code: "1" }))).toEqual({
      code: "1",
    })
  })

  standalone("succeeds with CellResult and fails with CellFailure", () => {
    expect(CellTool.tool.successSchema).toBe(Cell.CellResult)
    expect(CellTool.tool.failureSchema).toBe(Cell.CellFailure)
  })

  standalone("returns cell failures to the model instead of failing the run", () => {
    expect(CellTool.tool.failureMode).toBe("return")
  })

  standalone("schedules cells as authored-order exclusive barriers", () => {
    expect(CellTool.scheduling).toEqual({ maxConcurrency: 1, parallelSafe: [] })
  })

  standalone("routes only the cell tool", () => {
    expect(CellTool.route.tools).toEqual([CellTool.name])
    expect(CellTool.route.matches(request("1"))).toBe(true)
    expect(CellTool.route.matches({ ...request("1"), call: toolCall("read", { code: "1" }) })).toBe(false)
  })
})

layer(executorLayer)("cell tool route", (it) => {
  it.effect("maps a completed cell to a Success outcome", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const outcome = yield* executor.execute(request("1 + 1"))
      expect(outcome._tag).toBe("Success")
      if (outcome._tag !== "Success") return
      const result = yield* Schema.decodeUnknownEffect(Cell.CellResult)(outcome.result)
      expect(result.value).toBe("1 + 1")
      expect(result.stdout).toBe("out")
      expect(Schema.is(Cell.CellResult)(result)).toBe(true)
    }),
  )

  it.effect("maps a thrown cell to a DomainFailure outcome", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const outcome = yield* executor.execute(request("throw"))
      expect(outcome._tag).toBe("DomainFailure")
      if (outcome._tag !== "DomainFailure") return
      expect(Schema.is(Cell.CellExecutionFailed)(outcome.failure)).toBe(true)
    }),
  )

  it.effect("maps an unavailable kernel to a DomainFailure outcome", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const outcome = yield* executor.execute(request("unavailable"))
      expect(outcome._tag).toBe("DomainFailure")
      if (outcome._tag !== "DomainFailure") return
      expect(Schema.is(Cell.KernelUnavailable)(outcome.failure)).toBe(true)
    }),
  )

  it.effect("emits one progress update per cell event", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      collected.length = 0
      yield* executor.execute(request("1 + 1"))
      const progress = [...collected]
      expect(progress.map((item) => item.message)).toEqual(["KernelReady", "Stdout", "Result"])
      expect(progress.map((item) => item.data?.sequence)).toEqual([0, 1, 2])
      expect(new Set(progress.map((item) => item.toolCallId))).toEqual(new Set(["call-1"]))
    }),
  )

  it.effect("carries the cell's output text in progress, in order", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      collected.length = 0
      yield* executor.execute(request("printed"))
      const stdout = collected.filter((item) => item.message === "Stdout")
      expect(stdout.length).toBeGreaterThan(0)
      expect(stdout.map((item) => item.data?.["text"])).toEqual(["out"])
      const sequences = collected.map((item) => item.data?.["sequence"])
      expect(sequences).toEqual(sequences.toSorted((left, right) => Number(left) - Number(right)))
    }),
  )

  it.effect("carries the whole encoded event, not only its identity", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      collected.length = 0
      yield* executor.execute(request("1 + 1"))
      const result = collected.find((item) => item.message === "Result")
      expect(result?.data?.["value"]).toBe("1 + 1")
      expect(result?.data?.["_tag"]).toBe("Result")
      expect(result?.data?.["cellId"]).toBe("operation-1")
    }),
  )

  it.effect("keeps the cell-local sequence dense across every progress record", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      collected.length = 0
      yield* executor.execute(request("1 + 1"))
      expect(collected.map((item) => item.data?.["sequence"])).toEqual(collected.map((_, index) => index))
    }),
  )

  it.effect("emits progress for a cell that fails, without changing the outcome", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      collected.length = 0
      const outcome = yield* executor.execute(request("throw"))
      expect(outcome._tag).toBe("DomainFailure")
      expect(collected.length).toBeGreaterThan(0)
      expect(collected.every((item) => item.toolCallId === "call-1")).toBe(true)
    }),
  )

  it.effect("fails typed when the model sends source over the bound", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const failure = yield* Effect.flip(executor.execute(request("x".repeat(CellTool.maxSourceBytes + 1))))
      expect(Schema.is(ToolExecutor.FrameworkFailure)(failure)).toBe(true)
      if (Schema.is(ToolExecutor.FrameworkFailure)(failure)) {
        expect(failure.stage).toBe("decode-input")
        expect(failure.tool).toBe(CellTool.name)
      }
    }),
  )

  it.effect("fails typed when the model omits the code parameter", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const call = toolCall(CellTool.name, {})
      const failure = yield* Effect.flip(executor.execute({ ...request(""), call }))
      expect(Schema.is(ToolExecutor.FrameworkFailure)(failure)).toBe(true)
    }),
  )

  it.effect("routes an unrelated tool to no matching route", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const call = toolCall("read", { code: "1" })
      const failure = yield* Effect.flip(executor.execute({ ...request("1"), call }))
      expect(Schema.is(ToolExecutor.FrameworkFailure)(failure)).toBe(true)
      if (Schema.is(ToolExecutor.FrameworkFailure)(failure)) expect(failure.stage).toBe("route")
    }),
  )
})

const oversizedCollected: Array<ToolContext.Progress> = []

const oversizedContext = ToolContext.layerTest({
  signal: new AbortController().signal,
  emit: (progress) =>
    Effect.sync(() => {
      oversizedCollected.push(progress)
    }),
  sessionId,
  toolCallId: "call-1",
  operationKey: "operation-1",
})

const oversizedLayer = Layer.provideMerge(
  CellTool.layer,
  Layer.merge(
    oversizedContext,
    TestKernel.layerTestPool({
      profile,
      script: () => ({ _tag: "Value", value: "done", stdout: "z".repeat(CellTool.maxProgressBytes * 2) }),
    }),
  ),
)

layer(oversizedLayer)("cell tool progress bounds", (it) => {
  /**
   * The kernel already bounds each output channel and reports what it dropped, so progress never
   * re-truncates text. It bounds the encoded record instead, and withholds an oversized payload
   * whole rather than trimming it, so no reported number ever disagrees with the kernel's.
   */
  it.effect("withholds an oversized event payload whole and reports its size", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      oversizedCollected.length = 0
      yield* executor.execute(request("oversized"))
      const stdout = oversizedCollected.find((item) => item.message === "Stdout")
      expect(stdout).toBeDefined()
      expect(stdout?.data?.["text"]).toBeUndefined()
      expect(Number(stdout?.data?.["withheldBytes"])).toBeGreaterThan(CellTool.maxProgressBytes)
      expect(stdout?.data?.["_tag"]).toBe("Stdout")
    }),
  )

  it.effect("keeps the sequence dense even when a payload is withheld", () =>
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      oversizedCollected.length = 0
      yield* executor.execute(request("oversized"))
      expect(oversizedCollected.map((item) => item.data?.["sequence"])).toEqual(
        oversizedCollected.map((_, index) => index),
      )
    }),
  )
})
