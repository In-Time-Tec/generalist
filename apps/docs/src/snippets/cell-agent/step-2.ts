import { Console, Effect } from "effect"
import { CellTool, KernelProfile } from "tenetkit/repl"

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

const program = Effect.gen(function* () {
  yield* Console.log(`tool: ${CellTool.tool.name}`)
  yield* Console.log(`parameters: ${Object.keys(CellTool.Parameters.fields).join(", ")}`)
  yield* Console.log(
    `scheduling: maxConcurrency=${CellTool.scheduling.maxConcurrency} parallelSafe=${CellTool.scheduling.parallelSafe.length}`,
  )
  yield* Console.log(`epoch digest: ${KernelProfile.digest(profile)}`)
})

await Effect.runPromise(program)
