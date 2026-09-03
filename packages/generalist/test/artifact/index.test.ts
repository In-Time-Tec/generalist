import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Context, Effect, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime, RunStore } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { Artifact, ArtifactCrdt, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"

const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([])),
)
const blobStore = BlobStore.layerMemory().pipe(Layer.provide(BunCrypto.layer))
class ModelFixture extends Context.Service<ModelFixture, TestModel.Fixture>()(
  "generalist/test/artifact/index.test/ModelFixture",
) {}
const model = Layer.unwrap(
  TestModel.make([
    TestModel.toolCall("artifact_read_cGxhbi5tZA", {}, { id: "read-plan" }),
    TestModel.turn(
      [
        TestModel.toolCall(
          "artifact_edit_cGxhbi5tZA",
          { base: 0, operation: { _tag: "Replace", from: 1, to: 3, text: "agent" } },
          { id: "edit-plan" },
        ),
      ],
      { delay: "1 hour" },
    ),
    TestModel.text("done"),
  ]).pipe(Effect.map((fixture) => Layer.merge(fixture.layer, Layer.succeed(ModelFixture, fixture)))),
)
const services = Layer.mergeAll(
  runtime,
  blobStore,
  artifactLayer,
  Yjs.layer(),
  model,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

layer(services)("Artifact", (it) => {
  it.effect("merges overlapping human and Agent edits with attribution and replayable CRDT updates", () =>
    Effect.gen(function* () {
      const document = yield* Artifact.open("plan.md", { crdt: Yjs.layer(), initial: "abcd" })
      const writer = Agent.make({
        name: "writer",
        toolkit: Toolkit.make(Artifact.readTool(document), Artifact.tool(document)),
      })
      const host = yield* Generalist.create({ agents: [] })
      const run = yield* Agent.stream(writer, "edit the plan").pipe(Stream.runCollect, Effect.forkChild)

      const fixture = yield* ModelFixture
      yield* fixture.awaitRequests(2)
      yield* host.artifacts.edit(document.name, {
        base: 0,
        operation: { _tag: "Replace", from: 1, to: 3, text: "human" },
        attribution: { _tag: "Human", actor: "alice" },
      })
      yield* Effect.yieldNow
      yield* TestClock.adjust("1 hour")

      const agentEvents = Array.from(yield* Fiber.join(run))
      expect(agentEvents.at(-1)).toMatchObject({ _tag: "Completed", output: "done" })
      expect(agentEvents.find((event) => event._tag === "ToolExecutionCompleted" && event.artifactRead)).toMatchObject({
        artifactRead: { artifact: document.name, version: 0 },
      })
      expect(
        agentEvents.find((event) => event._tag === "ToolExecutionCompleted" && event.artifactUpdated),
      ).toMatchObject({
        artifactUpdated: {
          artifact: document.name,
          base: 0,
          result: 2,
          attribution: { _tag: "Agent", actor: "writer" },
        },
      })
      const updates = yield* host.artifacts.subscribe(document.name)
      const observed = Array.from(yield* updates.pipe(Stream.take(2), Stream.runCollect))
      expect(observed).toHaveLength(2)
      expect(observed.map(({ attribution }) => attribution._tag).toSorted()).toEqual(["Agent", "Human"])
      expect(observed.map(({ result }) => result)).toEqual([1, 2])

      const current = yield* Artifact.read(document)
      const store = yield* RunStore.RunStore
      const blobs = yield* BlobStore.BlobStore
      const crdt = yield* ArtifactCrdt
      const initial = yield* store.artifactSnapshot({ artifact: document.name, version: 0 })
      let replayed = (yield* blobs.get(initial.snapshot.sha256)).data
      for (const update of observed) replayed = yield* crdt.apply(replayed, update.update)
      expect(yield* crdt.read(replayed)).toBe(current.content)
    }),
  )
})
