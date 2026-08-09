import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { ToolContext, ToolExecutor } from "@batonfx/core"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, KernelProfile, TestKernel } from "@batonfx/repl"

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace", dataRoot: "/tmp/baton" },
  limits: { sourceBytes: CellTool.maxSourceBytes, channelBytes: 262_144, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
})

const script = (request: { readonly code: string }): TestKernel.Script =>
  request.code === "boom"
    ? { _tag: "Throw", name: "TypeError", message: "boom", stderr: "boom" }
    : { _tag: "Value", value: request.code, stdout: "printed\n" }

const call = Response.makePart("tool-call", {
  id: "call-1",
  name: CellTool.name,
  params: { code: "1 + 1" },
  providerExecuted: false,
})

const program = Effect.gen(function* () {
  const executor = yield* ToolExecutor.ToolExecutor
  const outcome = yield* executor.execute({
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "assistant",
    sessionId: "session-a",
  })
  if (outcome._tag !== "Success") return yield* Console.log(`outcome: ${outcome._tag}`)
  const result = outcome.result as Cell.CellResult
  yield* Console.log(`value: ${result.value}`)
  yield* Console.log(`stdout: ${result.stdout.trimEnd()}`)
  yield* Console.log(`epoch: ${result.epoch}, truncation entries: ${result.truncation.length}`)
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ToolContext.layerDefault, TestKernel.layerTestPool({ profile, script }))),
)

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
