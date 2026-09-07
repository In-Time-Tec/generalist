import { objectRuntimeLayer, makeObjectStorage } from "../runtime/execution/object.js"
import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"
import { ObjectStore } from "../../src/durability/object-store.js"

const storage = makeObjectStorage()
const runtime = objectRuntimeLayer(
  { addresses: [], scheduler: { pollInterval: "1 hour" }, schedulerMode: "poll" },
  storage,
).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
const blobStore = BlobStore.layer({ environment: "test", tenant: "artifact" }).pipe(
  Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, storage.store))),
)
const services = Layer.mergeAll(
  runtime,
  blobStore,
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
