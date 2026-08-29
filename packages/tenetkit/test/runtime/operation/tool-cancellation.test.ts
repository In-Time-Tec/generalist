import "./suites/sqlite-cancellation-reconciliation-suite.js"
import { cancellationConvergenceSuite } from "./suites/cancellation-convergence-suite.js"
import { expect, layer } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { LocalScheduler, Runtime, RunStore } from "../../../src/runtime/index.js"
import { assistantAddress, parentRelativeOptions, textPrompt } from "../execution/fixtures.js"
import { tempDbPath } from "../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"

cancellationConvergenceSuite({
  name: "memory",
  storeLayer: Runtime.layerMemory({ ...parentRelativeOptions, scheduler: { pollInterval: "1 day" } }),
})

cancellationConvergenceSuite({
  name: "sqlite",
  storeLayer: SqliteRuntime.layerSqlite({
    ...parentRelativeOptions,
    filename: tempDbPath("operation-cancellation-convergence"),
    scheduler: { pollInterval: "1 day" },
  }),
})

for (const backend of ["memory", "sqlite"] as const) {
  const runtimeLayer =
    backend === "memory"
      ? Runtime.layerMemory({ ...parentRelativeOptions, scheduler: { pollInterval: "1 day" } })
      : SqliteRuntime.layerSqlite({
          ...parentRelativeOptions,
          filename: tempDbPath("session-cancellation"),
          scheduler: { pollInterval: "1 day" },
        })

  layer(runtimeLayer)(`${backend} Session cancellation`, (it) => {
    it.effect("cancels every prior root tree and proves nested descendants terminal", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const scheduler = yield* LocalScheduler.LocalScheduler
        const sessionId = `thread:close:${backend}`

        const first = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "first",
          prompt: textPrompt("first"),
        })
        yield* store.claimExecution({ runId: first.runId, ownerId: "stale-root" })
        const child = yield* runtime.spawn({
          parentRunId: first.runId,
          invocationId: "child",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        yield* store.claimExecution({ runId: child.runId, ownerId: "stale-child" })
        const grandchild = yield* runtime.spawn({
          parentRunId: child.runId,
          invocationId: "grandchild",
          selection: "analyst",
          prompt: textPrompt("grandchild"),
        })
        yield* store.claimExecution({ runId: grandchild.runId, ownerId: "stale-grandchild" })

        const prior = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "prior-root",
          prompt: textPrompt("prior"),
        })

        yield* runtime.cancelSession({ sessionId, reason: "thread closed" })
        const awaiting = yield* runtime.awaitSessionTerminal({ sessionId }).pipe(Effect.forkChild)
        yield* scheduler.tick
        yield* Fiber.join(awaiting)

        for (const runId of [first.runId, child.runId, grandchild.runId, prior.runId]) {
          expect((yield* runtime.inspect(runId)).status).toBe("cancelled")
        }
      }),
    )
  })
}
