import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "../../../../src/index.js"
import { Cell, CellTool, KernelPool, KernelSnapshotStore } from "../../../../src/repl/index.js"
import {
  makeBunKernelProvider,
  SandboxProvider,
  type SandboxProviderService,
  type SandboxService,
  SnapshotId,
} from "../../../../src/sandbox/index.js"
import { RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { layer as activeExecutionsLayer } from "../../../../src/runtime/execution/active-executions.js"
import { make as makeRunExecutor } from "../../../../src/runtime/execution/run-executor-internal.js"
import { registrationsFor } from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { testExecutable } from "../../run/identity.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { makeHarness, platform } from "../../../repl/bun-harness.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const model = (source: string, final: string, calls: { value: number }) =>
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
              finish,
            ])
          : Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: `final-${final}`, delta: final }),
              finish,
            ])
      },
    }),
  )

const environment = (languageModel: Layer.Layer<LanguageModel.LanguageModel>, provider: SandboxProviderService) =>
  Layer.mergeAll(
    allowAllAuthorization,
    languageModel,
    CellTool.layer.pipe(Layer.provide(Layer.succeed(SandboxProvider, provider))),
    CellTool.toolkit.toLayer({
      typescript: () => Effect.die("CellTool ToolExecutor route owns TypeScript execution"),
    }),
  )

it.live("journals a Sandbox snapshot and continues a reopened memory Runtime from its fork", () =>
  Effect.scoped(
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
            environment(model("let counter = 1; counter", "snapshotted", firstModelCalls), firstProvider),
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
          const sessionId = "session:sandbox-snapshot-recovery"
          const first = yield* runtime.start({
            executable,
            registrations: registrationsFor(executable),
            sessionId,
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
            Schema.Struct({ _tag: Schema.Literal("SandboxSnapshot"), snapshotId: SnapshotId }),
          )(snapshotProgress.data)
          const firstCompletion = firstHistory.find((event) => event._tag === "ToolExecutionCompleted")
          if (firstCompletion?._tag !== "ToolExecutionCompleted")
            return yield* Effect.die("first cell did not complete")
          expect((yield* Schema.decodeUnknownEffect(Cell.CellResult)(firstCompletion.result.result)).value).toBe("1")
          expect(executions).toBe(1)

          const source = yield* firstProvider.acquire({ key: sessionId })
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
                environment(model("counter += 1", "continued", recoveredModelCalls), recoveredProvider),
              ),
            },
          ]).pipe(Layer.orDie)
          const second = yield* runtime.start({
            executable,
            registrations: registrationsFor(executable),
            sessionId,
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
  ).pipe(Effect.provide(platform)),
)
