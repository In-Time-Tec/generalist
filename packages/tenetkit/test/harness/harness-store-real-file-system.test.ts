import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError } from "effect"
import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { FileSystemHarnessStore, HarnessState, HarnessStore } from "../../src/harness/index"
import { applied, create, entry, proposal, scope } from "./harness-fixtures"

const permissions = (mode: number): string => (mode & 0o777).toString(8).padStart(3, "0")

const withStore = <A, E>(
  use: (input: {
    readonly store: HarnessStore.Interface
    readonly root: string
    readonly file: (value: string) => string
    readonly fileSystem: FileSystem.FileSystem
  }) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Effect.Effect<A, E | PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "tenetkit-harness-" })
    const file = (value: string) => path.join(root, value, "harness.json")
    const store = yield* FileSystemHarnessStore.make({ path: file })
    return yield* use({ store, root, file, fileSystem })
  }).pipe(Effect.scoped)

const stateWith = (id: string, content: string) =>
  HarnessState.make({ scope, entries: [entry({ id, kind: "memory", content })] })

layer(Layer.merge(bunLayer, Path.layer))("FileSystemHarnessStore on a real filesystem", (it) => {
  it.effect("round-trips one exact state through real files", () =>
    withStore(({ store }) =>
      Effect.gen(function* () {
        const state = applied({
          state: stateWith("a", "first"),
          proposal: proposal({ edits: [create({ kind: "skill", id: "runner", value: { reference: "pkg.run" } })] }),
        }).state
        yield* store.save(state)
        expect(yield* store.load(scope)).toEqual(state)
      }),
    ),
  )

  it.effect("replaces an existing file atomically and leaves no temporary behind", () =>
    withStore(({ file, fileSystem, store }) =>
      Effect.gen(function* () {
        yield* store.save(stateWith("a", "first"))
        yield* store.save(stateWith("a", "second"))
        yield* store.save(stateWith("a", "third"))
        const loaded = yield* store.load(scope)
        expect(HarnessState.findEntry(loaded, "memory", "a")!.content).toBe("third")
        const directory = file(scope).slice(0, file(scope).lastIndexOf("/"))
        expect((yield* fileSystem.readDirectory(directory)).toSorted()).toEqual(["harness.json"])
      }),
    ),
  )

  it.effect("writes owner-only files inside owner-only directories on real disk", () =>
    withStore(({ file, fileSystem, store }) =>
      Effect.gen(function* () {
        yield* store.save(stateWith("a", "first"))
        const target = file(scope)
        const directory = target.slice(0, target.lastIndexOf("/"))
        expect(permissions((yield* fileSystem.stat(target)).mode)).toBe("600")
        expect(permissions((yield* fileSystem.stat(directory)).mode)).toBe("700")
      }),
    ),
  )

  it.effect("keeps a corrupt file intact and fails typed", () =>
    withStore(({ file, fileSystem, store }) =>
      Effect.gen(function* () {
        yield* store.save(stateWith("a", "first"))
        const target = file(scope)
        yield* fileSystem.writeFileString(target, "{ not json")
        const failure = yield* store.load(scope).pipe(Effect.flip)
        expect(failure.reason).toBe("corrupt")
        expect(yield* fileSystem.readFileString(target)).toBe("{ not json")
      }),
    ),
  )

  it.effect("serializes concurrent saves of one scope into one readable state", () =>
    withStore(({ file, fileSystem, store }) =>
      Effect.gen(function* () {
        const contents = ["a", "b", "c", "d", "e", "f", "g", "h"]
        yield* Effect.forEach(contents, (content) => store.save(stateWith("entry", content)), {
          concurrency: "unbounded",
        })
        const loaded = yield* store.load(scope)
        const written = HarnessState.findEntry(loaded, "memory", "entry")!.content
        expect(contents).toContain(written)
        const target = file(scope)
        const directory = target.slice(0, target.lastIndexOf("/"))
        expect((yield* fileSystem.readDirectory(directory)).toSorted()).toEqual(["harness.json"])
      }),
    ),
  )

  it.effect("keeps every concurrent reader on a complete state", () =>
    withStore(({ store }) =>
      Effect.gen(function* () {
        yield* store.save(stateWith("entry", "initial"))
        const contents = ["one", "two", "three", "four"]
        const readers = Effect.forEach(
          Array.from({ length: 24 }),
          () =>
            store.load(scope).pipe(Effect.map((state) => HarnessState.findEntry(state, "memory", "entry")!.content)),
          { concurrency: "unbounded" },
        )
        const writers = Effect.forEach(contents, (content) => store.save(stateWith("entry", content)), {
          concurrency: "unbounded",
        })
        const [observed] = yield* Effect.all([readers, writers], { concurrency: "unbounded" })
        expect(observed.every((value) => value === "initial" || contents.includes(value))).toBe(true)
      }),
    ),
  )

  it.effect("creates a missing scope directory under the host root", () =>
    withStore(({ fileSystem, root, store }) =>
      Effect.gen(function* () {
        expect((yield* fileSystem.readDirectory(root)).toSorted()).toEqual([])
        yield* store.save(stateWith("a", "first"))
        expect((yield* fileSystem.readDirectory(root)).toSorted()).toEqual([scope])
      }),
    ),
  )
})
