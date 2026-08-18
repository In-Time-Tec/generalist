import { Console, Effect } from "effect"
import { CellTool, KernelProfile } from "tenetkit/repl"

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, channelBytes: 262_144, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
})

const program = Effect.gen(function* () {
  yield* Console.log(`tool: ${CellTool.tool.name}`)
  yield* Console.log(`parameters: ${Object.keys(CellTool.Parameters.fields).join(", ")}`)
  yield* Console.log(
    `scheduling: maxConcurrency=${CellTool.scheduling.maxConcurrency} parallelSafe=${CellTool.scheduling.parallelSafe.length}`,
  )
  yield* Console.log(`epoch digest: ${KernelProfile.digest(profile)}`)
})

await Effect.runPromise(program)
