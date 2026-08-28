import { layerPostgres } from "@tenetkit/pg"
import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { ExecutionHost, RunClaims, Runtime, RunStore } from "tenetkit/runtime"
import { registrationsFor } from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { agentMapProgramFixture } from "../../../../tenetkit/test/runtime/program/fixture.js"
import { postgresAvailable, postgresDatabase, postgresTestMaxConnections } from "../database.js"

const describePostgres = postgresAvailable ? describe : describe.skip

const database = postgresDatabase("program-registration-parity")

describePostgres("PostgreSQL Program registration parity", () => {
  {
    const fixture = agentMapProgramFixture()
    const runtimeLayer = layerPostgres({
      url: database.url,
      maxConnections: postgresTestMaxConnections,
      resolver: fixture.resolver,
      addresses: [
        {
          address: fixture.address,
          executable: fixture.executable,
          registrations: registrationsFor(fixture.executable),
        },
      ],
    })
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "persists a narrowed registration set for every Program fan-out child",
      (it) => {
        it.effect("persists a narrowed registration set for every Program fan-out child", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims.RunClaims
            const host = yield* ExecutionHost.ExecutionHost
            const root = yield* runtime.send({
              to: fixture.address,
              sessionId: "registration-parity",
              idempotencyKey: "registration-parity",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "registration-parity", limit: 1 })
            yield* host.execute({ runId: root.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence })
            const rootRegistrations = (yield* store.loadExecution(root.runId)).registrations
            const children = (yield* runtime.inspectTree(root.runId)).runs.filter(
              (run) => run.parentRunId === root.runId,
            )
            expect(children).toHaveLength(3)
            for (const child of children) {
              expect((yield* store.loadExecution(child.run.runId)).registrations.length).toBeLessThan(
                rootRegistrations.length,
              )
            }
          }),
        )
      },
    )
  }
})
