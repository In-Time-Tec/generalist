export const componentConsumer = `import { Crypto, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, DurableDriver, Permissions } from "generalist"
import * as Components from "generalist/components"
import * as Durability from "generalist/durability"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import * as TestDurability from "generalist/testing/durability"

if ("Registry" in Components || "SessionState" in Components) throw new Error("Component authority leaked")
let transitions = 0
const observations = []
const counter = Components.make({
  descriptor: {
    version: "1", key: "consumer-counter", instance: "default", schemaVersion: "1",
    handler: "increment", handlerVersion: "1", scope: "session", access: "session-owner",
    inheritance: "none", branch: "restore", redaction: "visible",
    maxStateBytes: 64, maxCommandBytes: 64, maxReceiptBytes: 4096,
  },
  state: Schema.Int,
  command: Schema.Int,
  initial: 0,
  transition: (state, amount) => { transitions += 1; return state + amount },
})
const add = Tool.make("counter_add", {
  parameters: Schema.Struct({ amount: Schema.Int }),
  success: Schema.Int,
  failure: Schema.Union([DurableDriver.DriverError, DurableDriver.DriverStateInvalid]),
}).annotate(Components.CommandTool, counter.registration)
const read = Tool.make("counter_read", {
  parameters: Schema.Struct({}), success: Schema.Int, failure: DurableDriver.DriverStateInvalid,
})
const toolkit = Toolkit.make(add, read)
const agent = Agent.make({ name: "components-package-consumer", toolkit })
const handlers = toolkit.toLayer({
  counter_add: ({ amount }) => Effect.gen(function* () {
    const before = yield* Components.read(counter)
    const result = yield* Components.command(counter, { command: amount })
    const after = yield* Components.read(counter)
    observations.push(["add", before, result, after])
    return result
  }),
  counter_read: () => Components.read(counter).pipe(Effect.tap((value) => Effect.sync(() => {
    observations.push(["read", value])
  }))),
})
const cryptoLayer = Layer.succeed(Crypto.Crypto, Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, bytes) => Effect.promise(() => globalThis.crypto.subtle.digest(algorithm, bytes)).pipe(
    Effect.map((buffer) => new Uint8Array(buffer)),
  ),
}))
await Effect.runPromise(Effect.gen(function* () {
  const bucket = yield* TestDurability.make()
  const open = (workerId, steps, prompts) => Effect.scoped(Effect.gen(function* () {
    const client = yield* bucket.connect
    const runtimeLayer = Durability.layer({
      environment: "package", tenant: "consumer", partition: "components", workerId,
      addresses: [], schedulerMode: "external",
    }).pipe(Layer.provide(Layer.mergeAll(
      TestDurability.layer(client), cryptoLayer, ExecutableResolver.layerStatic([]).pipe(Layer.orDie),
    )))
    const services = yield* Layer.build(Layer.mergeAll(
      Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(runtimeLayer)),
      Components.layer([counter.registration]).pipe(Layer.orDie),
      handlers, Permissions.layerAllowAll, Approvals.layerAutoApprove, TestModel.layer(steps),
    ))
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const executor = yield* RunExecutor.RunExecutor
      yield* runtime.register(agent)
      for (const prompt of prompts) {
        const handle = yield* runtime.start(agent, prompt, {
          sessionId: "retained-counter", idempotencyKey: workerId + ":" + prompt,
        })
        const claim = yield* store.claimExecution({ runId: handle.runId, ownerId: workerId, commandId: prompt })
        yield* executor.execute(claim)
        const status = (yield* runtime.inspect(handle.runId)).status
        if (status !== "succeeded") throw new Error("Component consumer Run failed: " + status)
      }
    }).pipe(Effect.provide(services))
  }))
  yield* open("first-host", [
    TestModel.toolCall("counter_add", { amount: 1 }), TestModel.text("first complete"),
  ], ["first"])
  yield* open("fresh-host", [
    TestModel.toolCall("counter_read", {}), TestModel.text("retained value"),
    TestModel.toolCall("counter_add", { amount: 2 }), TestModel.text("second complete"),
    TestModel.toolCall("counter_read", {}), TestModel.text("updated value"),
  ], ["read-after-reopen", "second", "read-after-second"])
  const expected = [["add", 0, 1, 1], ["read", 1], ["add", 1, 3, 3], ["read", 3]]
  if (JSON.stringify(observations) !== JSON.stringify(expected) || transitions !== 2) {
    throw new Error("Session component retention failed: " + JSON.stringify(observations))
  }
}))
console.log("Session components: public command/read across four Runs and fresh Runtime Layers passed")
`
