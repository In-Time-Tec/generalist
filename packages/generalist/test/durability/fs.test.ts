import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Result } from "effect"
import { make, makeMaintenance } from "../../src/durability/fs.js"
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

    it.effect("classifies a key beneath an existing object as a deterministic invalid-response", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        const store = yield* make({ dir })
        expect(yield* store.create("seg", Uint8Array.of(1))).toBe("created")
        // A file at the immediate parent segment surfaces as AlreadyExists from makeDirectory.
        const outcome = yield* Effect.result(store.create("seg/child", Uint8Array.of(2)))
        expect(Result.isFailure(outcome)).toBe(true)
        if (Result.isFailure(outcome)) {
          expect(outcome.failure.reason).toBe("invalid-response")
          expect(outcome.failure.operation).toBe("create")
          expect(outcome.failure.message).toBe("A stored object occupies a segment of this key")
        }
        // A deeper parent segment surfaces as BadResource; both tags are the same condition.
        const deep = yield* Effect.result(store.create("seg/deep/child", Uint8Array.of(3)))
        expect(Result.isFailure(deep)).toBe(true)
        if (Result.isFailure(deep)) {
          expect(deep.failure.reason).toBe("invalid-response")
          expect(deep.failure.message).toBe("A stored object occupies a segment of this key")
        }
        // Control: a child key with no occupying parent object creates normally.
        expect(yield* store.create("other/child", Uint8Array.of(4))).toBe("created")
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

    it.effect("rejects empty, leading, and trailing key segments instead of aliasing normalized keys", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-fs-" })
        const store = yield* make({ dir })
        const maintenance = yield* makeMaintenance({ dir })

        for (const key of ["alpha//beta", "gamma/", "/delta-key"]) {
          expect((yield* Effect.flip(store.create(key, Uint8Array.of(1)))).reason).toBe("invalid-response")
          expect((yield* Effect.flip(store.read(key, { maxBytes: 1 }))).reason).toBe("invalid-response")
          expect((yield* Effect.flip(maintenance.remove(key))).reason).toBe("invalid-response")
        }

        // Normalized neighbors stay independent and list their created spellings.
        expect(yield* store.create("alpha/beta", Uint8Array.of(2))).toBe("created")
        expect(yield* store.create("gamma", Uint8Array.of(3))).toBe("created")
        expect(yield* store.create("delta-key", Uint8Array.of(4))).toBe("created")
        expect((yield* store.list("alpha/")).keys).toEqual(["alpha/beta"])
        expect((yield* store.list("gamma")).keys).toEqual(["gamma"])
        expect(Array.from((yield* store.read("delta-key", { maxBytes: 1 }))!.bytes)).toEqual([4])

        // Listing prefixes with empty or leading segments must not invent a spelling.
        for (const prefix of ["alpha//", "/alpha/", "alpha//beta", "a/../b"]) {
          expect((yield* Effect.flip(store.list(prefix))).reason).toBe("invalid-response")
        }
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
