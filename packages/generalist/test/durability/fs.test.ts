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

    it.effect("keeps case-variant keys distinct under filesystem case folding", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        const store = yield* make({ dir })
        yield* store.create("case/Team", Uint8Array.of(1))
        expect(yield* store.create("case/team", Uint8Array.of(2))).toBe("created")
        expect(Array.from((yield* store.read("case/Team", { maxBytes: 1 }))?.bytes ?? [])).toEqual([1])
        expect(Array.from((yield* store.read("case/team", { maxBytes: 1 }))?.bytes ?? [])).toEqual([2])
        expect((yield* store.list("case/")).keys).toEqual(["case/Team", "case/team"])
        // Distinct keys must never encode to file names that a case-insensitive volume folds together.
        const entries = yield* fs.readDirectory(dir, { recursive: true })
        const folded = entries.map((entry) => entry.toLowerCase())
        expect(new Set(folded).size).toBe(folded.length)
      }),
    )
  },
)
