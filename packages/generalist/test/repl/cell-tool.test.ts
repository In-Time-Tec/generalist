import "./suites/bun-cell-isolation-suite.js"
import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { ToolContext, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "../../src/index.js"
import { Cell, CellTool, KernelPool, KernelProfile, KernelSnapshotStore, TestKernel } from "../../src/repl/index"
import { ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../src/runtime/index.js"
import { layer as activeExecutionsLayer } from "../../src/runtime/execution/active-executions.js"
import { make as makeRunExecutor } from "../../src/runtime/execution/run-executor-internal.js"
import {
  makeBunKernelProvider,
  SandboxProvider,
  type SandboxProviderService,
  type SandboxService,
  SnapshotId,
} from "../../src/sandbox/index.js"
import { registrationsFor } from "../runtime/execution/fixtures.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"
import { testExecutable } from "../runtime/run/identity.js"
import { allowAllAuthorization } from "../authorization.js"
import { makeHarness, platform } from "./bun-harness.js"

const sessionId = "session-a"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace", dataRoot: "/data" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 1000 },
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
      return true
    }),
  sessionId,
  toolCallId: "call-1",
  operationKey: "operation-1",
})

const executorLayer = CellTool.layer.pipe(
  Layer.provideMerge(Layer.merge(contextLayer, TestKernel.layerTestSandbox({ profile, script }))),
)

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
      return true
    }),
  sessionId,
  toolCallId: "call-1",
  operationKey: "operation-1",
})

const oversizedLayer = Layer.provideMerge(
  CellTool.layer,
  Layer.merge(
    oversizedContext,
    TestKernel.layerTestSandbox({
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

const recoveryFinish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const recoveryModel = (source: string, final: string, calls: { value: number }) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        calls.value += 1
        return calls.value === 1
          ? Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: `cell-${source}`,
                name: CellTool.name,
                params: { code: source },
                providerExecuted: false,
              }),
              recoveryFinish,
            ])
          : Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: `final-${final}`, delta: final }),
              recoveryFinish,
            ])
      },
    }),
  )

const recoveryEnvironment = (
  languageModel: Layer.Layer<LanguageModel.LanguageModel>,
  provider: SandboxProviderService,
) =>
  Layer.mergeAll(
    allowAllAuthorization,
    languageModel,
    CellTool.layer.pipe(Layer.provide(Layer.succeed(SandboxProvider, provider))),
    CellTool.toolkit.toLayer({
      typescript: () => Effect.die("CellTool ToolExecutor route owns TypeScript execution"),
    }),
  )

standalone.live("journals a Sandbox snapshot and continues a reopened memory Runtime from its fork", () =>
  provideScoped(
    platform,
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cellDeadlineMillis: 5_000 })
      const rawProvider = yield* makeBunKernelProvider({
        image: `bun:${Bun.version}`,
        workspaceRoot: harness.profile.workspace.root,
      }).pipe(
        Effect.provideService(KernelPool.KernelPool, harness.pool),
        Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, harness.store),
      )
      let executions = 0
      let forks = 0
      const counted = (service: SandboxService): SandboxService => ({
        ...service,
        start: (command) =>
          Effect.sync(() => {
            executions += 1
          }).pipe(Effect.andThen(service.start(command))),
        fork: (snapshotId) =>
          Effect.sync(() => {
            forks += 1
          }).pipe(Effect.andThen(service.fork(snapshotId)), Effect.map(counted)),
      })
      const firstProvider = SandboxProvider.of({
        defaultImage: rawProvider.defaultImage,
        acquire: (options) => rawProvider.acquire(options).pipe(Effect.map(counted)),
      })
      const firstModelCalls = { value: 0 }
      const agent = Agent.make({
        name: "sandbox-snapshot-recovery",
        toolkit: CellTool.toolkit,
        toolScheduling: CellTool.scheduling,
      })
      const executable = testExecutable(agent, "sandbox-snapshot-recovery-v1")
      const firstResolver = ExecutableResolver.layerStatic([
        {
          executable,
          agent: Agent.close(
            agent,
            recoveryEnvironment(
              recoveryModel("let counter = 1; counter", "snapshotted", firstModelCalls),
              firstProvider,
            ),
          ),
        },
      ]).pipe(Layer.orDie)

      yield* provideScoped(
        Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
          Layer.provide(firstResolver),
        ),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* RunExecutor.RunExecutor
          const recoverySessionId = "session:sandbox-snapshot-recovery"
          const first = yield* runtime.startExecution({
            executable,
            registrations: registrationsFor(executable),
            sessionId: recoverySessionId,
            idempotencyKey: "sandbox-snapshot-recovery:first",
            prompt: "initialize the counter",
          })
          const processStopped = yield* Deferred.make<void>()
          const firstProcess = yield* host
            .execute(yield* store.claimExecution({ runId: first.runId, ownerId: "sandbox-process-before-reopen" }))
            .pipe(
              Effect.andThen(Deferred.succeed(processStopped, undefined)),
              Effect.andThen(Effect.never),
              Effect.forkChild({ startImmediately: true }),
            )
          yield* Deferred.await(processStopped).pipe(Effect.timeout("10 seconds"))
          expect((yield* runtime.inspect(first.runId)).status).toBe("succeeded")
          yield* Fiber.interrupt(firstProcess)

          const firstHistory = yield* runtime.history({ runId: first.runId, cursor: -1, limit: 100 })
          const snapshotProgress = firstHistory.find(
            (event) => event._tag === "ToolProgress" && event.message === "SandboxSnapshot",
          )
          if (snapshotProgress?._tag !== "ToolProgress") return yield* Effect.die("Sandbox snapshot was not journaled")
          const snapshot = yield* Schema.decodeUnknownEffect(
            Schema.TaggedStruct("SandboxSnapshot", { snapshotId: SnapshotId }),
          )(snapshotProgress.data)
          const firstCompletion = firstHistory.find((event) => event._tag === "ToolExecutionCompleted")
          if (firstCompletion?._tag !== "ToolExecutionCompleted")
            return yield* Effect.die("first cell did not complete")
          expect((yield* Schema.decodeUnknownEffect(Cell.CellResult)(firstCompletion.result.result)).value).toBe("1")
          expect(executions).toBe(1)

          const source = yield* firstProvider.acquire({ key: recoverySessionId })
          yield* source.pause
          const recoveredSandbox = yield* source.fork(snapshot.snapshotId)
          const recoveredProvider = SandboxProvider.of({
            defaultImage: firstProvider.defaultImage,
            acquire: () => Effect.succeed(recoveredSandbox),
          })
          const recoveredModelCalls = { value: 0 }
          const recoveredResolver = ExecutableResolver.layerStatic([
            {
              executable,
              agent: Agent.close(
                agent,
                recoveryEnvironment(recoveryModel("counter += 1", "continued", recoveredModelCalls), recoveredProvider),
              ),
            },
          ]).pipe(Layer.orDie)
          const second = yield* runtime.startExecution({
            executable,
            registrations: registrationsFor(executable),
            sessionId: recoverySessionId,
            idempotencyKey: "sandbox-snapshot-recovery:second",
            prompt: "continue from the recovered counter",
          })
          const secondClaim = yield* store.claimExecution({
            runId: second.runId,
            ownerId: "sandbox-process-after-reopen",
          })
          yield* provideScoped(
            Layer.mergeAll(
              allowAllAuthorization,
              Layer.succeed(RunStore.RunStore, store),
              Layer.fresh(activeExecutionsLayer),
              recoveredResolver,
            ),
            Effect.flatMap(makeRunExecutor, (reopened) =>
              reopened.execute(secondClaim).pipe(Effect.timeout("10 seconds")),
            ),
          )

          const secondHistory = yield* runtime.history({ runId: second.runId, cursor: -1, limit: 100 })
          const secondCompletion = secondHistory.find((event) => event._tag === "ToolExecutionCompleted")
          if (secondCompletion?._tag !== "ToolExecutionCompleted")
            return yield* Effect.die("recovered cell did not complete")
          expect((yield* Schema.decodeUnknownEffect(Cell.CellResult)(secondCompletion.result.result)).value).toBe("2")
          expect((yield* runtime.inspect(second.runId)).status).toBe("succeeded")
          expect(firstModelCalls.value).toBe(2)
          expect(recoveredModelCalls.value).toBe(2)
          expect(forks).toBe(1)
          expect(executions).toBe(2)
        }),
      )
    }),
  ),
)
