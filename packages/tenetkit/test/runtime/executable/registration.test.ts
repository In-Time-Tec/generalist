import "./suites/registration-pinned-content-suite.js"
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { ExecutionHost, Runtime, RunStore } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { agentMapProgramFixture } from "../program/fixture.js"
import { tempDbPath } from "../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
for (const backend of ["memory", "sqlite"] as const) {
  const fixture = agentMapProgramFixture()
  const filename = tempDbPath(`program-registration-parity-${backend}`)
  const options = {
    resolver: fixture.resolver,
    addresses: [
      {
        address: fixture.address,
        executable: fixture.executable,
        registrations: registrationsFor(fixture.executable),
      },
    ],
  }
  layer(backend === "memory" ? Runtime.layerMemory(options) : SqliteRuntime.layerSqlite({ ...options, filename }))(
    `${backend} gives each Program fan-out child only its required registrations`,
    (it) => {
      it.effect(`${backend} gives each Program fan-out child only its required registrations`, () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* ExecutionHost.ExecutionHost
          const root = yield* runtime.send({
            to: fixture.address,
            sessionId: backend,
            idempotencyKey: backend,
            prompt: "run",
          })
          yield* host.execute(yield* store.claimExecution({ runId: root.runId, ownerId: `${backend}-worker` }))
          const children = (yield* runtime.treeCheckpoint(root.runId)).inspection.runs.filter(
            (run) => run.parentRunId === root.runId,
          )
          const rootRegistrations = (yield* store.loadExecution(root.runId)).registrations
          expect(children).toHaveLength(3)
          for (const child of children) {
            const registrations = (yield* store.loadExecution(child.run.runId)).registrations
            expect(registrations.length).toBeLessThan(rootRegistrations.length)
            expect(
              registrations.every((registration) =>
                rootRegistrations.some((rootRegistration) => rootRegistration.pin === registration.pin),
              ),
            ).toBe(true)
          }
        }),
      )
    },
  )
}
