import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"

const services = Layer.mergeAll(
  Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([])),
  ),
  BlobStore.layerMemory().pipe(Layer.provide(BunCrypto.layer)),
  artifactLayer,
  TestModel.layer([
    TestModel.toolCall("artifact_read_c3RhbGUubWQ", {}, { id: "read-stale" }),
    TestModel.toolCall(
      "artifact_edit_c3RhbGUubWQ",
      { base: 1, operation: { _tag: "Insert", at: 0, text: "no" } },
      { id: "edit-stale" },
    ),
    TestModel.text("handled"),
  ]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

layer(services)("Artifact stale model base", (it) => {
  it.effect("returns a typed tool error instead of silently rebasing", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("stale.md", { crdt: Yjs.layer(), initial: "unchanged" })
      const agent = Agent.make({
        name: "stale-writer",
        toolkit: Toolkit.make(Artifact.readTool(document), Artifact.tool(document)),
      })
      const events = Array.from(yield* Agent.stream(agent, "make a stale edit").pipe(Stream.runCollect))
      const edit = events.find(
        (event) => event._tag === "ToolExecutionCompleted" && event.call.name === document.editTool.name,
      )

      expect(edit).toMatchObject({
        _tag: "ToolExecutionCompleted",
        result: {
          isFailure: true,
          result: {
            _tag: "generalist/artifact/ArtifactBaseStale",
            artifact: document.name,
            base: 1,
            expected: 0,
          },
        },
      })
      expect(yield* Artifact.read(document)).toMatchObject({ version: 0, content: "unchanged" })
    }),
  )
})
