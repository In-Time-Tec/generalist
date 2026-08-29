import { Runtime } from "tenetkit/runtime"
import { RunClaims } from "tenetkit/runtime/driver/sql/run/claims"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { assistantRef, registrationsFor, textPrompt } from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { provideScoped } from "../../../../tenetkit/test/runtime/execution/scoped-provide.js"
import { stagedRootSuite } from "../../../../tenetkit/test/runtime/operation/suites/staged-root.js"
import { postgresAvailable, postgresDatabase, postgresLayer } from "../database.js"

const database = postgresDatabase("staged-root")
const storeLayer = database.provision(postgresLayer(database.url))
const workerDatabase = postgresDatabase("staged-root-worker")
const workerStoreLayer = workerDatabase.provision(postgresLayer(workerDatabase.url))

stagedRootSuite({ name: "PostgreSQL", storeLayer, skip: !postgresAvailable })

const describePostgres = postgresAvailable ? describe : describe.skip

describePostgres("postgres staged root scheduler admission", () => {
  it.live("does not expose an admitted root to workers before activation", () =>
    provideScoped(
      workerStoreLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims
        const receipt = yield* runtime.admit({
          runId: "run:staged:postgres:worker-gate",
          executable: assistantRef,
          registrations: registrationsFor(assistantRef),
          sessionId: "session:staged:postgres:worker-gate",
          idempotencyKey: "staged:worker-gate",
          prompt: textPrompt("worker gate"),
        })

        expect(yield* claims.claimReadyRuns({ workerId: "premature", limit: 10 })).toEqual([])
        yield* runtime.activate({ runId: receipt.runId })
        expect(yield* claims.claimReadyRuns({ workerId: "activated", limit: 10 })).toMatchObject([
          { run: { runId: receipt.runId }, workerId: "activated" },
        ])
      }),
    ),
  )
})
