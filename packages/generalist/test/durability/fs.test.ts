import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { make } from "../../src/durability/fs.js"
import { unsupportedPreconditions } from "../../src/testing/durability/index.js"
import { exercise, objectConformance, recover } from "./local-operations.js"

layer(bunLayer, { excludeTestServices: true })(
  "local filesystem transport over a single-host directory (not remote qualification)",
  (it) => {
    it.effect("passes shared object-store conformance against a local directory", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        yield* objectConformance(make({ dir }))
        yield* unsupportedPreconditions(make({ dir, pageSize: 0 }))
      }),
    )

    it.effect("recovers journal head and receipts from a fresh transport over the same directory", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        const expected = yield* exercise(make({ dir }))
        const store = yield* make({ dir })
        yield* recover({ store, expected })
      }),
    )

    it.effect("keeps write temporaries and foreign files out of listings", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        const store = yield* make({ dir })
        yield* store.create("a/b/object", Uint8Array.of(7))
        yield* fs.writeFile(`${dir}/a/b/.object.tmp-orphan`, Uint8Array.of(0))
        yield* fs.writeFile(`${dir}/a/b/foreign$name`, Uint8Array.of(0))
        yield* fs.makeDirectory(`${dir}/a/b/nested`, { recursive: true })
        const page = yield* store.list("a/b/")
        expect(page.keys).toEqual(["a/b/object"])
      }),
    )
  },
)
