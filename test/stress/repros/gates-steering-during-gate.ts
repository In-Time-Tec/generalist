/* oxlint-disable effecttsgo/strict-effect-provide -- this repro script is its own Effect application entry point. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- the Run failure cause is the framework's own tagged failure; only its tag and message are read. */
/**
 * Minimal repro: steering admitted while a completion gate is evaluating.
 *
 * Accepted pending steering should make terminal completion return to the
 * RunExecutor continuation instead of stranding the inbox. Instead, the
 * in-process continuation fails while scheduling the turn-0 model call:
 * the durability journal rejects the re-built `memory:recall:0` operation
 * input under an already-committed command identity, then terminalization
 * discards the still-pending steering.
 *
 * Exit code: 0 = the documented contract holds (steering continuation completes);
 *            1 = the defect signature was reproduced, or setup failed.
 *
 * Run: bun test/stress/repros/gates-steering-during-gate.ts
 */
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun"
import { Cause, Config, Console, Deferred, Effect, Exit, Fiber, FileSystem, Layer, Option, Schema } from "effect"
import type { LanguageModel } from "effect/unstable/ai"
import { Agent, Gate } from "generalist"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "generalist/runtime"
import { activate, layer as runtimeLayer } from "generalist/durability"
import { layer as fsLayer } from "generalist/durability/fs"
import { TestModel } from "generalist/testing"

const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const makeApp = (dir: string, workerId: string, fixtureLayer: Layer.Layer<LanguageModel.LanguageModel>) =>
  Layer.effectDiscard(activate).pipe(
    Layer.provideMerge(
      Layer.merge(
        runtimeLayer({
          environment: "stress",
          tenant: "gates",
          partition: "steering-during-gate",
          schedulerMode: "external",
          workerId,
          addresses: [],
        }).pipe(
          Layer.provide(Layer.mergeAll(fsLayer({ dir }), ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
          Layer.provide(BunCrypto.layer),
        ),
        fixtureLayer,
      ),
    ),
    Layer.provide(BunFileSystem.layer),
    Layer.provide(BunPath.layer),
  )

interface RunFailureEvent {
  readonly _tag?: string
  readonly error?: { readonly _tag?: string; readonly message?: string }
}

const runFailure = (exit: Exit.Exit<unknown, unknown>): RunFailureEvent | undefined =>
  // SAFETY: the Run failure cause is the framework's own tagged failure; only its tag and message are read.
  Exit.isFailure(exit) ? (Cause.squash(exit.cause) as RunFailureEvent) : undefined

const scenario = (runIndex: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tempRoot = Option.getOrUndefined(yield* Config.option(Config.string("STRESS_TEMP_ROOT")))
    const prefix = `gates-steer-repro-${runIndex}-`
    const root = yield* fs.makeTempDirectoryScoped(
      tempRoot === undefined ? { prefix } : { directory: tempRoot, prefix },
    )
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const fixture = yield* TestModel.make([TestModel.text("first"), TestModel.text("after-steer")])
    const agent = Agent.make({
      name: "steer-during-gate",
      gates: [
        Gate.predicate({
          name: "blocking",
          check: () =>
            Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(true)),
        }),
      ],
      onGateFailure: "fail",
    })
    const workerId = `repro-worker-${runIndex}`
    const app = makeApp(root, workerId, fixture.layer)
    return yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const executor = yield* RunExecutor.RunExecutor
      yield* runtime.register(agent)
      const handle = yield* runtime.start(agent, "start")
      const claim = yield* store.claimExecution({
        commandId: `claim-${runIndex}`,
        runId: handle.runId,
        ownerId: workerId,
      })
      const fiber = yield* Effect.forkScoped(executor.execute(claim))
      yield* Deferred.await(entered)
      const steering = yield* runtime.send(handle.runId, "STEER-DURING-GATE", {
        idempotencyKey: "s1",
        policy: "steer",
      })
      yield* Deferred.succeed(release, undefined)
      const execution = yield* Fiber.join(fiber).pipe(Effect.exit)
      const awaitExit = yield* handle.await.pipe(Effect.exit)
      const inspection = yield* runtime.inspect(handle.runId)
      const history = yield* runtime.history({ runId: handle.runId, limit: 200 })
      const failure = runFailure(awaitExit)
      const failureMessage = failure?.error?.message ?? (failure === undefined ? "" : stringify(failure))
      const count = (tag: string) => history.filter((event) => event._tag === tag).length
      return {
        runIndex,
        steeringAccepted: steering.entryId,
        executionFailed: execution._tag === "Failure",
        awaitFailed: awaitExit._tag === "Failure",
        runStatus: inspection.status,
        failureErrorTag: failure?.error?._tag,
        failureMessage: failureMessage.slice(0, 200),
        journalDetailPresent: failureMessage.includes("command identity already committed with different input"),
        runCompleted: count("RunCompleted"),
        steeringConsumed: count("SteeringConsumed"),
        steeringDiscarded: count("SteeringDiscarded"),
        requestCount: (yield* fixture.requests).length,
        ledger: history.map((event) => {
          const turn = "turn" in event ? `:${event.turn}` : ""
          return `${event.sequence}:${event._tag}${turn}`
        }),
      }
    }).pipe(Effect.provide(app))
  })

interface RunEvidence {
  readonly runIndex: number
  readonly awaitFailed: boolean
  readonly runStatus: string
  readonly failureErrorTag?: string
  readonly failureMessage: string
  readonly journalDetailPresent: boolean
  readonly runCompleted: number
  readonly steeringConsumed: number
  readonly steeringDiscarded: number
  readonly requestCount: number
}

const reproduced = (run: RunEvidence): boolean =>
  run.awaitFailed &&
  run.runStatus === "failed" &&
  run.failureErrorTag === "generalist/runtime/AgentExecutionFailure" &&
  // The clean-format failure names the recalled operation; the journal-conflict
  // cause detail is appended only by the pre-existing dirty journalFailure build.
  run.failureMessage.includes("run_1:memory:recall:0") &&
  run.runCompleted === 0 &&
  run.steeringConsumed === 0 &&
  run.steeringDiscarded === 1 &&
  run.requestCount === 1

const setFailureExitCode = Effect.sync(() => {
  process.exitCode = 1
})

const main = Effect.gen(function* () {
  const runs: Array<RunEvidence> = []
  for (let index = 1; index <= 3; index++) {
    const result = yield* scenario(index).pipe(Effect.timeoutOption("45 seconds"))
    if (result._tag === "None") {
      yield* Console.log(`run ${index}: TIMEOUT`)
      yield* setFailureExitCode
      return
    }
    runs.push(result.value)
    yield* Console.log(`run ${index}: ${stringify(result.value)}`)
  }
  const allReproduced = runs.every(reproduced)
  yield* Console.log(
    stringify({
      verdict: allReproduced ? "defect-reproduced" : "contract-satisfied",
      journalDetailObserved: runs.some((run) => run.journalDetailPresent),
      cleanFormatFailureObserved: runs.every((run) => run.failureMessage.includes("run_1:memory:recall:0")),
    }),
  )
  if (allReproduced) {
    yield* Console.error(
      "DEFECT REPRODUCED: steering accepted during gate evaluation failed the Run on " +
        "run_1:memory:recall:0 and discarded the accepted steering " +
        "(SteeringDiscarded:1, SteeringConsumed:0, RunCompleted:0)",
    )
    yield* setFailureExitCode
  }
})

const platform = Layer.mergeAll(BunFileSystem.layer.pipe(Layer.provide(BunPath.layer)), BunCrypto.layer)

await Effect.runPromise(
  Effect.scoped(main).pipe(
    Effect.provide(platform),
    Effect.catchCause((cause) =>
      Console.error("REPRO FAILED", Cause.pretty(cause)).pipe(Effect.andThen(setFailureExitCode)),
    ),
  ),
)
