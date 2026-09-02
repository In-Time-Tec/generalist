import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolContext } from "../../src/index.js"
import { Cell, CellTool, KernelPool, KernelSnapshotStore } from "../../src/repl/index.js"
import { ExecutableResolver, RunEvent, RunExecutor, Runtime, RunStore } from "../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import {
  makeBunKernelProvider,
  SandboxProvider,
  type SandboxProviderService,
  type SandboxService,
} from "../../src/sandbox/index.js"
import { allowAllAuthorization } from "../authorization.js"
import { makeHarness, platform } from "../repl/bun-harness.js"
import { tempDbPath } from "./sql/scenario.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

interface ModelStep {
  readonly cell?: string
  readonly text?: string
}

const cellModel = (steps: ReadonlyArray<ModelStep>) => {
  let calls = 0
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        const step = steps[calls++]
        if (step === undefined) return Stream.die(new Error("cell model exhausted"))
        if (step.cell !== undefined) {
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: `cell-${calls}`,
              name: CellTool.name,
              params: { code: step.cell },
              providerExecuted: false,
            }),
            finish,
          ])
        }
        return Stream.fromIterable<Response.StreamPartEncoded>([
          Response.makePart("text-delta", { id: `text-${calls}`, delta: step.text ?? "done" }),
          finish,
        ])
      },
    }),
  )
}

const cellEnvironment = (model: Layer.Layer<LanguageModel.LanguageModel>, provider: SandboxProviderService) =>
  Layer.mergeAll(
    allowAllAuthorization,
    model,
    CellTool.layer.pipe(Layer.provide(Layer.succeed(SandboxProvider, provider))),
    CellTool.toolkit.toLayer({
      typescript: () => Effect.die("CellTool ToolExecutor route owns TypeScript execution"),
    }),
  )

const countedProvider = (provider: SandboxProviderService, forks: { value: number }): SandboxProviderService => {
  const counted = (sandbox: SandboxService): SandboxService => ({
    ...sandbox,
    fork: (snapshotId, options) =>
      Effect.sync(() => {
        forks.value += 1
      }).pipe(Effect.andThen(sandbox.fork(snapshotId, options)), Effect.map(counted)),
  })
  return {
    ...provider,
    acquire: (options) => provider.acquire(options).pipe(Effect.map(counted)),
  }
}

const completedCell = (events: ReadonlyArray<RunEvent.RunEvent>) =>
  events.findLast((event) => event._tag === "ToolExecutionCompleted" && event.call.name === CellTool.name)

const cellValue = (event: NonNullable<ReturnType<typeof completedCell>>) =>
  event._tag === "ToolExecutionCompleted"
    ? Schema.decodeUnknownEffect(Cell.CellResult)(event.result.result).pipe(Effect.map((result) => result.value))
    : Effect.die("expected completed cell")

it.live("replays a substituted tool result after reopen without redispatch", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("counterfactual-fork")
    const tool = Tool.make("lookup", { parameters: Schema.Struct({}), success: Schema.String }).addDependency(
      ToolContext.ToolContext,
    )
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "counterfactual-fork", toolkit })
    let toolCalls = 0
    const handlers = toolkit.toLayer({
      lookup: () =>
        Effect.gen(function* () {
          toolCalls += 1
          const context = yield* ToolContext.ToolContext
          yield* context.emit({
            toolCallId: context.toolCallId ?? "lookup-1",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshot", snapshotId: "snapshot:counterfactual" },
          })
          return "original"
        }),
    })
    const options = {
      filename,
      addresses: [],
      scheduler: { pollInterval: "1 hour" as const },
    }
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    let firstModelCalls = 0
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          firstModelCalls += 1
          if (firstModelCalls > 1) return Stream.never
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "lookup-1",
              name: "lookup",
              params: {},
              providerExecuted: false,
            }),
            finish,
          ])
        },
      }),
    )
    const firstLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      Layer.mergeAll(allowAllAuthorization, firstModel, handlers),
    )
    const source = yield* scopedWith(firstLayer)(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          const handle = yield* runtime.start(agent, "look it up", {
            sessionId: "session:counterfactual-fork",
            idempotencyKey: "counterfactual-fork",
          })
          yield* executor
            .execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "counterfactual-source" }))
            .pipe(Effect.forkScoped)
          const completed = yield* runtime.events({ runId: handle.runId }).pipe(
            Stream.filter((event) => event._tag === "ToolExecutionCompleted"),
            Stream.runHead,
          )
          expect(Option.isSome(completed)).toBe(true)
          const operation = yield* store.getOperationByKey({
            runId: handle.runId,
            operationKey: `${handle.runId}:tool:0:lookup-1:lookup`,
          })
          expect(operation?.status).toBe("succeeded")
          return {
            runId: handle.runId,
            operationId: operation!.operationId,
            atSequence: completed.pipe(Option.getOrThrow).sequence,
          }
        }),
      ),
    )

    let recoveredPrompt = ""
    let recoveredModelCalls = 0
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          recoveredModelCalls += 1
          recoveredPrompt = JSON.stringify(request.prompt.content)
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "counterfactual", delta: "counterfactual complete" }),
            finish,
          ])
        },
      }),
    )
    const recoveredLayer = Layer.merge(
      SqliteRuntime.layerSqlite(options).pipe(Layer.provide(resolver)),
      Layer.mergeAll(allowAllAuthorization, recoveredModel, handlers),
    )

    yield* scopedWith(recoveredLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const branch = yield* runtime.fork(source.runId, {
          atSequence: source.atSequence,
          substitute: {
            operationId: source.operationId,
            result: { _tag: "Success", result: "substituted", encodedResult: "substituted" },
          },
        })
        yield* executor.execute(yield* store.claimExecution({ runId: branch.runId, ownerId: "counterfactual-branch" }))
        expect(yield* branch.await).toBe("counterfactual complete")
        expect(toolCalls).toBe(1)
        expect(recoveredModelCalls).toBe(1)
        expect(recoveredPrompt).toContain("substituted")
        const history = yield* runtime.history({ runId: branch.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "Substituted")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
      }),
    )
  }),
)

it.live("restores a forked Run from a Sandbox snapshot persisted before SQLite reopen", () =>
  scopedWith(platform)(
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-fork-workspace-" })
        const harness = yield* makeHarness({ cellDeadlineMillis: 5_000, workspaceRoot })
        const rawProvider = yield* makeBunKernelProvider({ image: `bun:${Bun.version}`, workspaceRoot }).pipe(
          Effect.provideService(KernelPool.KernelPool, harness.pool),
          Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, harness.store),
        )
        const forks = { value: 0 }
        const provider = countedProvider(rawProvider, forks)
        const agent = Agent.make({
          name: "persisted-sandbox-fork",
          toolkit: CellTool.toolkit,
          toolScheduling: CellTool.scheduling,
        })
        const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
        const filename = tempDbPath("persisted-sandbox-fork")
        const sourceSessionId = "session:persisted-sandbox-fork"

        const source = yield* scopedWith(
          Layer.merge(
            SqliteRuntime.layerSqlite({
              addresses: [],
              filename,
              scheduler: { pollInterval: "1 hour" },
            }).pipe(Layer.provide(resolver)),
            cellEnvironment(
              cellModel([
                { cell: 'let branchCounter = 1; await Bun.write("inherited.txt", "source file"); branchCounter' },
                { text: "source complete" },
              ]),
              provider,
            ),
          ),
        )(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const executor = yield* RunExecutor.RunExecutor
            yield* runtime.register(agent)
            const handle = yield* runtime.start(agent, "write source state", { sessionId: sourceSessionId })
            yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "source-host" }))
            const history = yield* runtime.history({ runId: handle.runId, cursor: -1, limit: 100 })
            const completion = completedCell(history)
            if (completion === undefined) return yield* Effect.die("source cell did not complete")
            expect(yield* cellValue(completion)).toBe("1")
            return { runId: handle.runId, atSequence: completion.sequence }
          }),
        )

        const branch = yield* scopedWith(
          Layer.merge(
            SqliteRuntime.layerSqlite({
              addresses: [],
              filename,
              scheduler: { pollInterval: "1 hour" },
            }).pipe(Layer.provide(resolver)),
            cellEnvironment(
              cellModel([
                {
                  cell: 'const inheritedFile = await Bun.file("inherited.txt").text(); branchCounter += 1; `${inheritedFile}:${branchCounter}`',
                },
                { text: "branch complete" },
              ]),
              provider,
            ),
          ),
        )(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const executor = yield* RunExecutor.RunExecutor
            yield* runtime.register(agent)
            const handle = yield* runtime.fork(source.runId, { atSequence: source.atSequence })
            yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "branch-host" }))
            const history = yield* runtime.history({ runId: handle.runId, cursor: -1, limit: 100 })
            const completion = completedCell(history)
            if (completion === undefined) return yield* Effect.die("branch cell did not complete")
            expect(yield* cellValue(completion)).toBe("source file:2")
            return handle.runId
          }),
        )

        const sourceSandbox = yield* provider.acquire({ key: sourceSessionId })
        const sourceState = yield* sourceSandbox.exec({
          _tag: "TypeScript",
          cellId: "verify-source-after-fork",
          source: '`${await Bun.file("inherited.txt").text()}:${branchCounter}`',
        })
        expect((yield* Schema.decodeUnknownEffect(Cell.CellResult)(sourceState.value)).value).toBe("source file:1")
        expect(branch).not.toBe(source.runId)
        expect(forks.value).toBe(1)
      }),
    ).pipe(Effect.timeout("30 seconds")),
  ),
)

it.live("restores a rewound Run from the retained Sandbox snapshot", () =>
  scopedWith(platform)(
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-rewind-workspace-" })
        const harness = yield* makeHarness({ cellDeadlineMillis: 5_000, workspaceRoot })
        const rawProvider = yield* makeBunKernelProvider({ image: `bun:${Bun.version}`, workspaceRoot }).pipe(
          Effect.provideService(KernelPool.KernelPool, harness.pool),
          Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, harness.store),
        )
        const forks = { value: 0 }
        const provider = countedProvider(rawProvider, forks)
        const agent = Agent.make({
          name: "rewound-sandbox-snapshot",
          toolkit: CellTool.toolkit,
          toolScheduling: CellTool.scheduling,
        })
        const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
        const runtimeLayer = Layer.merge(
          Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(Layer.provide(resolver)),
          cellEnvironment(
            cellModel([
              { cell: "let rewindCounter = 1; rewindCounter" },
              { cell: "rewindCounter = 9; rewindCounter" },
              { text: "source complete" },
              { cell: "rewindCounter += 1; rewindCounter" },
              { text: "rewind complete" },
            ]),
            provider,
          ),
        )

        yield* scopedWith(runtimeLayer)(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const executor = yield* RunExecutor.RunExecutor
            yield* runtime.register(agent)
            const handle = yield* runtime.start(agent, "build state to rewind")
            yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "source-host" }))
            const sourceHistory = yield* runtime.history({ runId: handle.runId, cursor: -1, limit: 100 })
            const sourceCells = sourceHistory.filter(
              (event) => event._tag === "ToolExecutionCompleted" && event.call.name === CellTool.name,
            )
            const first = sourceCells[0]
            if (first?._tag !== "ToolExecutionCompleted") return yield* Effect.die("first source cell did not complete")
            expect(yield* cellValue(first)).toBe("1")
            expect(yield* cellValue(sourceCells[1]!)).toBe("9")

            yield* runtime.rewind(handle.runId, { toSequence: first.sequence })
            yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "rewound-host" }))
            const rewoundHistory = yield* runtime.history({ runId: handle.runId, cursor: -1, limit: 100 })
            const rewound = completedCell(rewoundHistory)
            if (rewound === undefined) return yield* Effect.die("rewound cell did not complete")
            expect(yield* cellValue(rewound)).toBe("2")
            expect(forks.value).toBe(1)
          }),
        )
      }),
    ).pipe(Effect.timeout("30 seconds")),
  ),
)
