import "./suites/registration-pinned-content-suite.js"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { RunExecutor, Runtime, RunStore } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { agentMapProgramFixture } from "../program/fixture.js"
import { objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
const fixture = agentMapProgramFixture()
const options = {
  addresses: [
    {
      address: fixture.address,
      executable: fixture.executable,
      registrations: registrationsFor(fixture.executable),
    },
  ],
}
layer(
  objectRuntimeLayer(options).pipe(
    Layer.provide(fixture.resolverLayer),
  ),
)("gives each Program fan-out child only its required registrations", (it) => {
  it.effect("gives each Program fan-out child only its required registrations", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* RunExecutor.RunExecutor
      const root = yield* runtime.send({
        to: fixture.address,
        sessionId: "object",
        idempotencyKey: "object",
        prompt: "run",
      })
      yield* host.execute(
        yield* store.claimExecution({
          runId: root.runId,
          ownerId: objectWorkerId,
          commandId: "registration-root",
        }),
      )
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
})
