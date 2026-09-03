import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, RunExecutor, Runtime, RunStore } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { Artifact, ArtifactCrdt, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"

const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([])),
)
const blobStore = BlobStore.layerMemory().pipe(Layer.provide(BunCrypto.layer))
const model = TestModel.layer([
  TestModel.toolCall("artifact_read_Zm9yay5tZA", {}, { id: "read-source" }),
  TestModel.text("source done"),
  TestModel.toolCall(
    "artifact_edit_Zm9yay5tZA",
    { base: 0, operation: { _tag: "Insert", at: 4, text: " branch" } },
    { id: "edit-branch" },
  ),
  TestModel.text("branch done"),
])
const services = Layer.mergeAll(
  runtime,
  blobStore,
  artifactLayer,
  Yjs.layer(),
  model,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

layer(services)("Artifact Runtime fork", (it) => {
  it.effect("forks the artifact at the model-read version and keeps later edits private", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("fork.md", { crdt: Yjs.layer(), initial: "plan" })
      const writer = Agent.make({
        name: "fork-writer",
        toolkit: Toolkit.make(Artifact.readTool(document), Artifact.tool(document)),
      })
      const host = yield* Generalist.create({ agents: [writer] })
      const session = yield* host.sessions.create({ id: "session:artifact:fork" })
      const source = yield* host.runs.start(session.id, writer, "read the plan")
      const store = yield* RunStore.RunStore
      const executor = yield* RunExecutor.RunExecutor
      yield* executor.execute(yield* store.claimExecution({ runId: source.id, ownerId: "artifact-source" }))
      expect(yield* source.await).toBe("source done")

      const runtimeService = yield* Runtime.Runtime
      const history = yield* runtimeService.history({ runId: source.id, cursor: -1, limit: 100 })
      const read = history.find((event) => event._tag === "ToolExecutionCompleted" && event.artifactRead)
      if (read?._tag !== "ToolExecutionCompleted" || read.artifactRead === undefined) {
        return yield* Effect.die("source artifact read was not journaled")
      }
      expect(read.artifactRead).toEqual({ artifact: document.name, version: 0 })

      yield* host.artifacts.edit(document.name, {
        base: 0,
        operation: { _tag: "Replace", from: 0, to: 4, text: "main" },
        attribution: { _tag: "Human", actor: "alice" },
      })
      const branch = yield* host.sessions.fork(source.id, { atSequence: read.sequence })
      yield* executor.execute(yield* store.claimExecution({ runId: branch.id, ownerId: "artifact-branch" }))
      expect(yield* branch.await).toBe("branch done")
      expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "main" })

      const blobs = yield* BlobStore.BlobStore
      const crdt = yield* ArtifactCrdt
      const branchHead = yield* store.artifactHead({ artifact: document.name, branch: branch.id })
      const branchSnapshot = yield* blobs.get(branchHead.snapshot.sha256)
      expect(branchHead).toMatchObject({ version: 1, branch: branch.id })
      expect(yield* crdt.read(branchSnapshot.data)).toBe("plan branch")
    }),
  )
})
