import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Agent, Approvals, Permissions } from "../../../../../src/index.js"
import { TestModel } from "../../../../../src/testing/index.js"

layer(
  Layer.mergeAll(
    TestModel.layer([TestModel.text("allocated"), TestModel.text("streamed"), TestModel.text("ran")]),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
  ),
)("public hosted option boundary", (it) => {
  it.effect("discards injected restoration state for every curried entrypoint without mutating caller options", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const agent = Agent.make({ name: "curried-public-options" })
        const invocationOptions = {}
        const allocationOptions = { prompt: "allocated" }
        const hiddenKeys = ["initialSteering", "driverCheckpoint", "executableRef", "executableManifest"]
        for (const key of hiddenKeys) {
          Reflect.set(invocationOptions, key, {})
          Reflect.set(allocationOptions, key, {})
        }
        const handle = yield* Agent.allocateRun(allocationOptions)(agent)
        const allocated = yield* Stream.runCollect(handle.events)
        expect(allocated.at(-1)).toMatchObject({ _tag: "Completed", output: "allocated" })
        const streamed = yield* Agent.stream("streamed", invocationOptions)(agent).pipe(Stream.runCollect)
        expect(streamed.at(-1)).toMatchObject({ _tag: "Completed", output: "streamed" })
        expect(yield* Agent.run("ran", invocationOptions)(agent)).toBe("ran")
        for (const key of hiddenKeys) {
          expect(invocationOptions).toHaveProperty(key, {})
          expect(allocationOptions).toHaveProperty(key, {})
        }
      }),
    ),
  )
})
