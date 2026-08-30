import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { KernelPool, KernelProfile, CellTool, TestKernel } from "tenetkit/repl"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

const script = (request: { readonly code: string }): TestKernel.Script =>
  request.code === "boom"
    ? { _tag: "Throw", name: "TypeError", message: "boom", stderr: "boom\n" }
    : { _tag: "Value", value: request.code, stdout: "printed\n" }

const runCell = (cellId: string, code: string) =>
  Effect.gen(function* () {
    const pool = yield* KernelPool.KernelPool
    const execution = yield* pool.execute({ sessionId: "session-a", cellId, code })
    const events = yield* Stream.runCollect(execution.events)
    yield* Console.log(`${cellId} events: ${events.map((event) => `${event.sequence}:${event._tag}`).join(" ")}`)
    return yield* Effect.exit(execution.result)
  })

const program = Effect.gen(function* () {
  const ok = yield* runCell("c1", "1 + 1")
  yield* Console.log(`c1 outcome: ${ok._tag}`)
  const threw = yield* runCell("c2", "boom")
  yield* Console.log(`c2 outcome: ${threw._tag}`)
})

const runtime = ManagedRuntime.make(TestKernel.layerTestPool({ profile, script }))
await runtime.runPromise(Effect.scoped(program))
