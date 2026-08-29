import { Console, Effect, Layer, ManagedRuntime, Option, Schema } from "effect"
import { ToolContext, ToolExecutor } from "tenetkit"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, HostModules, KernelProfile, TestKernel } from "tenetkit/repl"

class NotFound extends Schema.TaggedError<NotFound>()("@tenetkit/tutorial/NotFound", {
  path: Schema.String,
}) {}

const workspace: HostModules.Module = {
  name: "workspace",
  operations: [
    {
      name: "read",
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ text: Schema.String }),
      failure: NotFound,
      handle: (input) => {
        const { path } = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.String }))(input).pipe(
          Option.getOrThrow,
        )
        return path === "/README.md" ? Effect.succeed({ text: "# cell-agent" }) : Effect.fail(NotFound.make({ path }))
      },
    },
  ],
}

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
})

/**
 * TestKernel evaluates nothing: it enforces the observable contract and returns what this script
 * says. The script therefore stands in for what the real Bun kernel would compute for this cell.
 */
const script = (): TestKernel.Script => ({ _tag: "Value", value: '"# cell-agent"' })

const call = Schema.decodeSync(Response.ToolCallPart(CellTool.name, Schema.Struct({ code: Schema.String })))(
  Response.makePart("tool-call", {
    id: "call-1",
    name: CellTool.name,
    params: { code: 'const file = await workspace.read({ path: "/README.md" }); file.text' },
    providerExecuted: false,
  }),
)

const program = Effect.gen(function* () {
  const registry = yield* HostModules.HostModules
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
    const result = Schema.decodeUnknownOption(Cell.CellResult)(outcome.result).pipe(Option.getOrThrow)
    yield* Console.log(`value: ${result.value}`)
  }
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      ToolContext.layerDefault,
      HostModules.layer([workspace]),
      TestKernel.layerTestPool({ profile, script }),
    ),
  ),
)

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
