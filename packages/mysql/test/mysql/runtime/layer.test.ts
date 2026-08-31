import { layer as backendLayer } from "@generalist/mysql"
import { beforeAll } from "vitest"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { RunExecutor, Runtime, RunStore } from "generalist/runtime"
import { RunClaims } from "generalist/runtime/sql-driver"
import { registrationsFor } from "../../../../generalist/test/runtime/execution/fixtures.js"
import { agentMapProgramFixture } from "../../../../generalist/test/runtime/program/fixture.js"
import { mysqlAvailable, mysqlDatabase } from "./environment.js"

const describeMysql = describe.runIf(mysqlAvailable)

const database = mysqlDatabase("runtime-layer-registration")

describeMysql("mysql runtime layer Program registration", () => {
  beforeAll(database.provisioned, 60_000)

  {
    const fixture = agentMapProgramFixture()
    const runtimeLayer = backendLayer({
      url: database.url,
      source: "mysql-test",
      addresses: [
        {
          address: fixture.address,
          executable: fixture.executable,
          registrations: registrationsFor(fixture.executable),
        },
      ],
    }).pipe(Layer.provide(fixture.resolverLayer))
    layer(database.provision(runtimeLayer), { excludeTestServices: true })(
      "persists a narrowed registration set for every Program fan-out child",
      (it) => {
        it.effect("persists a narrowed registration set for every Program fan-out child", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const claims = yield* RunClaims
            const host = yield* RunExecutor.RunExecutor
            const root = yield* runtime.send({
              to: fixture.address,
              sessionId: "registration-parity",
              idempotencyKey: "registration-parity",
              prompt: "run",
            })
            const [claim] = yield* claims.claimReadyRuns({ workerId: "registration-parity", limit: 1 })
            yield* host.execute({
              runId: root.runId,
              ownerId: claim!.workerId,
              attemptFence: claim!.attemptFence,
              session: claim!.session,
            })
            const rootRegistrations = (yield* store.loadExecution(root.runId)).registrations
            const children = (yield* runtime.treeCheckpoint(root.runId)).inspection.runs.filter(
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
