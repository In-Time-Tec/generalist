import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { ToolContext, ToolExecutor } from "@batonfx/core"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, HostBindingRegistry, KernelProfile, TestKernel } from "@batonfx/repl"

class NotFound extends Schema.TaggedErrorClass<NotFound>()("@batonfx/tutorial/NotFound", {
  path: Schema.String,
}) {}

const workspace: HostBindingRegistry.Module = {
  name: "workspace",
  operations: [
    {
      name: "read",
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ text: Schema.String }),
      failure: NotFound,
      handle: (input) => {
        const { path } = input as { readonly path: string }
        return path === "/README.md" ? Effect.succeed({ text: "# cell-agent" }) : Effect.fail(NotFound.make({ path }))
      },
    },
  ],
}

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, channelBytes: 262_144, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
})

/**
 * TestKernel evaluates nothing: it enforces the observable contract and returns what this script
 * says. The script therefore stands in for what the real Bun kernel would compute for this cell.
 */
const script = (): TestKernel.Script => ({ _tag: "Value", value: '"# cell-agent"' })

const call = Response.makePart("tool-call", {
  id: "call-1",
  name: CellTool.name,
  params: { code: 'const file = await workspace.read({ path: "/README.md" }); file.text' },
  providerExecuted: false,
})

const program = Effect.gen(function* () {
  const registry = yield* HostBindingRegistry.HostBindingRegistry
  const mounted = registry.descriptors.map((entry) => `${entry.module}.${entry.operations.join("/")}`)
  yield* Console.log(`mounted: ${mounted.join(" ")}`)
  yield* Console.log(`bindings digest: ${profile.bindingsDigest}`)

  const executor = yield* ToolExecutor.ToolExecutor
  const outcome = yield* executor.execute({
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "assistant",
    sessionId: "session-a",
  })
  yield* Console.log(`outcome: ${outcome._tag}`)
  if (outcome._tag === "Success") {
    yield* Console.log(`value: ${(outcome.result as Cell.CellResult).value}`)
  }
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      ToolContext.layerDefault,
      HostBindingRegistry.layer([workspace]),
      TestKernel.layerTestPool({ profile, script }),
    ),
  ),
)

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
