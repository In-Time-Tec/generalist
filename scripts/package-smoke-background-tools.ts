export const backgroundToolConsumer = `import { Crypto, Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { Host, ToolIdentity } from "generalist/host"
import * as Durability from "generalist/durability"
import { ExecutableResolver, RunExecutor, RunStore } from "generalist/runtime"
import * as TestDurability from "generalist/testing/durability"

const work = Tool.make("packed_work", { parameters: Schema.Struct({}), success: Schema.FiniteFromString })
  .annotate(ToolIdentity, { implementation: "packed-work-v1", policy: "packed-policy-v1" })
const toolkit = Toolkit.make(work)
const agent = Agent.make({ name: "packed-background", toolkit, toolExecution: "background" })
const cryptoLayer = Layer.succeed(Crypto.Crypto, Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, bytes) => Effect.promise(() => globalThis.crypto.subtle.digest(algorithm, bytes)).pipe(
    Effect.map((buffer) => new Uint8Array(buffer)),
  ),
}))
const finish = (reason) => Response.makePart("finish", { reason, response: undefined,
  usage: Response.Usage.make({
    inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
})
await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const bucket = yield* TestDurability.make()
  const entered = yield* Deferred.make()
  const release = yield* Deferred.make()
  const admitted = yield* Deferred.make()
  let calls = 0
  const model = Layer.effect(LanguageModel.LanguageModel, LanguageModel.make({
    generateText: () => Effect.die("Unexpected generateText"),
    streamText: (options) => {
      calls += 1
      if (calls === 1) return Stream.make(
        Response.makePart("tool-call", { id: "packed-call", name: work.name, params: {}, providerExecuted: false }),
        finish("tool-calls"),
      )
      return Stream.unwrap(Effect.gen(function* () {
        const receipt = options.prompt.content.flatMap((message) => message.role === "tool" ? message.content : [])
          .find((part) => part.type === "tool-result")?.result
        if (receipt?._tag !== "ToolRunAdmitted" || receipt.tool !== work.name) throw new Error("Dishonest admission receipt")
        yield* Deferred.succeed(admitted, receipt.runId)
        yield* Deferred.await(entered)
        if (yield* Deferred.isDone(release)) throw new Error("Tool settled before parent continuation")
        return Stream.make(Response.makePart("text-delta", { id: "answer", delta: "continued" }), finish("stop"))
      }))
    },
  }))
  const runtimeLayer = Durability.layer({
    environment: "package", tenant: "consumer", partition: "background", workerId: "packed-host",
    addresses: [], schedulerMode: "external",
  }).pipe(Layer.provide(Layer.mergeAll(
    TestDurability.layer(bucket), cryptoLayer, ExecutableResolver.layerStatic([]).pipe(Layer.orDie),
  )))
  const services = yield* Layer.build(Layer.mergeAll(
    Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(runtimeLayer)),
    Permissions.layerAllowAll, Approvals.layerAutoApprove, model,
    toolkit.toLayer({ packed_work: () => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Deferred.await(release)), Effect.as(7),
    ) }),
  ))
  yield* Effect.gen(function* () {
    const host = yield* Host.make({ revision: "local", agents: [agent], tools: [work] })
    const session = yield* host.sessions.create({ id: "packed-session" })
    const parent = yield* host.runs.start(session.id, agent, "work")
    const store = yield* RunStore.RunStore
    const executor = yield* RunExecutor.RunExecutor
    const execute = (runId) => store.claimExecution({ runId, ownerId: "packed-host", commandId: "execute:" + runId })
      .pipe(Effect.flatMap(executor.execute))
    const parentFiber = yield* execute(parent.id).pipe(Effect.forkChild)
    const childId = yield* Deferred.await(admitted).pipe(Effect.raceFirst(Fiber.join(parentFiber).pipe(
      Effect.andThen(parent.await), Effect.flatMap((value) => Effect.die("No receipt: " + value)),
    )))
    const childFiber = yield* execute(childId).pipe(Effect.forkChild)
    yield* Fiber.join(parentFiber)
    if ((yield* parent.await) !== "continued" || calls !== 2) throw new Error("Parent did not continue")
    if ((yield* store.inspect(childId)).status !== "running") throw new Error("Tool was not held open")
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(childFiber)
    const history = yield* store.history({ runId: childId, cursor: -1, limit: 100 })
    const completed = history.at(-1)
    if (completed?._tag !== "RunCompleted" || completed.result.value !== "7") throw new Error("Typed output was not retained")
  }).pipe(Effect.provide(services))
})))
console.log("background Tool receipt and concurrent parent continuation verified")
`
