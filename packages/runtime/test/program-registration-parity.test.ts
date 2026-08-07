import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { ExecutionHost, Runtime, RunStore } from "../src/index.js"
import { registrationsFor } from "./helpers.js"
import { agentMapProgramFixture } from "./program-fixture.js"
import { tempDbPath } from "./sqlite-helpers.js"

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
  layer(backend === "memory" ? Runtime.layerMemory(options) : Runtime.layerSqlite({ ...options, filename }))(
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
          const children = (yield* runtime.inspectTree(root.runId)).runs.filter((run) => run.parentRunId === root.runId)
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
