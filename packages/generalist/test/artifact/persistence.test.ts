/* oxlint-disable effecttsgo/strict-effect-provide -- This persistence test owns two fresh Layer scopes. */
import { BunCrypto } from "@effect/platform-bun"
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
import { TestModel } from "generalist/testing"
import { Artifact, Yjs, layer as artifactLayer } from "generalist/unstable/artifact"
import { tempDbPath } from "../runtime/sql/scenario.js"

const filename = tempDbPath("artifact-persistence")
const services = () => {
  const sql = sqliteClientLayer({ filename })
  return Layer.mergeAll(
    SqliteRuntime.layerSqlite({ filename, addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([])),
    ),
    BlobStore.layerSql().pipe(Layer.provide(Layer.merge(BunCrypto.layer, sql))),
    artifactLayer,
    TestModel.layer([]),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
  )
}

const withServices = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(Layer.build(services()).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it.effect("reopens BlobStore snapshots and the Runtime operation log", () =>
  Effect.gen(function* () {
    yield* withServices(
      Effect.gen(function* () {
        const document = yield* Artifact.open("persistent.md", { crdt: Yjs.layer(), initial: "saved" })
        const host = yield* Generalist.create({ agents: [] })
        yield* host.artifacts.edit(document.name, {
          base: 0,
          operation: { _tag: "Insert", at: 5, text: " state" },
          attribution: { _tag: "Human", actor: "alice" },
        })
      }),
    )

    yield* withServices(
      Effect.gen(function* () {
        const document = yield* Artifact.open("persistent.md", { crdt: Yjs.layer(), initial: "ignored" })
        const host = yield* Generalist.create({ agents: [] })
        expect(yield* Artifact.read(document)).toMatchObject({ version: 1, content: "saved state" })
        const updates = yield* host.artifacts.subscribe(document.name)
        expect(Array.from(yield* updates.pipe(Stream.take(1), Stream.runCollect))).toMatchObject([
          { base: 0, result: 1, attribution: { _tag: "Human", actor: "alice" } },
        ])
      }),
    )
  }),
)
