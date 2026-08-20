import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { LocalScheduler, Runtime, RunStore } from "../../src/runtime/index.js"
import { assistantAddress, parentRelativeOptions, textPrompt } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R extends A>(effect: Effect.Effect<B, E2, R>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

it.effect("SQLite startup reconciles a poisoned running cancellation and stale claim", () => {
  const filename = tempDbPath("poisoned-cancellation")
  const runtimeLayer = Runtime.layerSqlite({
    ...parentRelativeOptions,
    filename,
    scheduler: { pollInterval: "1 day" },
  })
  let runId = ""
  let childRunId = ""
  let grandchildRunId = ""
  return Effect.gen(function* () {
    yield* scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: "thread:poisoned",
          idempotencyKey: "root",
          prompt: textPrompt("root"),
        })
        runId = receipt.runId
        yield* store.claimExecution({ runId, ownerId: "sqlite" })
        const child = yield* runtime.spawn({
          parentRunId: runId,
          invocationId: "child",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        childRunId = child.runId
        yield* store.claimExecution({ runId: childRunId, ownerId: "sqlite" })
        const grandchild = yield* runtime.spawn({
          parentRunId: childRunId,
          invocationId: "grandchild",
          selection: "analyst",
          prompt: textPrompt("grandchild"),
        })
        grandchildRunId = grandchild.runId
        yield* store.claimExecution({ runId: grandchildRunId, ownerId: "sqlite" })
        yield* runtime.cancel({ runId, reason: "close" })
      }),
    )
    const db = new Database(filename)
    const canonical = db.query("SELECT cancellation_requested FROM tenetkit_runs WHERE run_id = ?").get(runId) as {
      readonly cancellation_requested?: unknown
    } | null
    expect(canonical?.cancellation_requested).toBe(1)
    db.run("UPDATE tenetkit_runs SET status = 'running', cancellation_requested = 'true' WHERE run_id = ?", [
      childRunId,
    ])
    db.close()

    yield* scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        expect((yield* runtime.inspect(runId)).status).toBe("cancelling")
        expect((yield* runtime.inspect(childRunId)).status).toBe("cancelling")
        yield* runtime.cancelSession({ sessionId: "thread:poisoned", reason: "close" })
        yield* scheduler.tick
        yield* runtime.awaitSessionTerminal({ sessionId: "thread:poisoned" })
        expect((yield* runtime.inspect(runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(grandchildRunId)).status).toBe("cancelled")
      }),
    )
  })
})
