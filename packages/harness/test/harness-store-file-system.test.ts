import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError } from "effect"
import { FileSystemHarnessStore, HarnessState, HarnessStore, Refinement } from "../src/index"
import { applied, at, create, entry, proposal, scope } from "./harness-fixtures"

interface Disk {
  readonly files: Map<string, string>
  readonly directories: Set<string>
  readonly modes: Map<string, number>
  readonly renames: Array<readonly [string, string]>
  readonly writes: Array<string>
}

const makeDisk = (): Disk => ({
  files: new Map(),
  directories: new Set(["/data"]),
  modes: new Map(),
  renames: [],
  writes: [],
})

const systemError = (tag: "NotFound" | "PermissionDenied" | "AlreadyExists", method: string, path: string) =>
  PlatformError.systemError({
    _tag: tag,
    module: "HarnessStoreTest",
    method,
    description: tag,
    pathOrDescriptor: path,
  })

interface Faults {
  readonly denyDirectory?: string
  readonly denyWrite?: string
  readonly failRename?: boolean
  readonly onWrite?: (disk: Disk) => void
  readonly onRename?: (disk: Disk) => void
}

const diskLayer = (disk: Disk, faults: Faults = {}) =>
  FileSystem.layerNoop({
    readFileString: (path) => {
      const content = disk.files.get(path)
      return content === undefined
        ? Effect.fail(systemError("NotFound", "readFileString", path))
        : Effect.succeed(content)
    },
    writeFileString: (path, data, options) => {
      if (faults.denyWrite !== undefined && path.startsWith(faults.denyWrite)) {
        return Effect.fail(systemError("PermissionDenied", "writeFileString", path))
      }
      const directory = path.slice(0, path.lastIndexOf("/"))
      if (!disk.directories.has(directory)) return Effect.fail(systemError("NotFound", "writeFileString", path))
      return Effect.sync(() => {
        disk.files.set(path, data)
        disk.writes.push(path)
        if (options?.mode !== undefined) disk.modes.set(path, options.mode)
        faults.onWrite?.(disk)
      }).pipe(Effect.andThen(Effect.yieldNow))
    },
    makeDirectory: (path, options) => {
      if (faults.denyDirectory !== undefined && path.startsWith(faults.denyDirectory)) {
        return Effect.fail(systemError("PermissionDenied", "makeDirectory", path))
      }
      return Effect.sync(() => {
        const segments = path.split("/").filter((value) => value.length > 0)
        let current = ""
        for (const segment of segments) {
          current = `${current}/${segment}`
          disk.directories.add(current)
          if (options?.mode !== undefined) disk.modes.set(current, options.mode)
        }
      })
    },
    rename: (from, to) => {
      if (faults.failRename === true) return Effect.fail(systemError("PermissionDenied", "rename", to))
      const content = disk.files.get(from)
      if (content === undefined) return Effect.fail(systemError("NotFound", "rename", from))
      return Effect.yieldNow.pipe(
        Effect.andThen(
          Effect.sync(() => {
            disk.files.delete(from)
            disk.files.set(to, content)
            const mode = disk.modes.get(from)
            if (mode !== undefined) disk.modes.set(to, mode)
            disk.renames.push([from, to])
            faults.onRename?.(disk)
          }),
        ),
      )
    },
    remove: (path) =>
      Effect.sync(() => {
        disk.files.delete(path)
      }),
  })

const storeLayer = (disk: Disk, faults: Faults = {}) =>
  FileSystemHarnessStore.layer({ path: (value) => `/data/${value}/harness.json` }).pipe(
    Layer.provide(Layer.merge(diskLayer(disk, faults), Path.layer)),
  )

const provide =
  <R, E>(layerValue: Layer.Layer<R, E>) =>
  <A, E2>(effect: Effect.Effect<A, E2, R>): Effect.Effect<A, E | E2> =>
    Layer.build(layerValue).pipe(
      Effect.flatMap((context) => Effect.provide(effect, context)),
      Effect.scoped,
    )

const stateWith = (id: string) => HarnessState.make({ scope, entries: [entry({ id, kind: "memory" })] })

const temporaries = (disk: Disk): ReadonlyArray<string> =>
  [...disk.files.keys()].filter((path) => path.endsWith(".tmp"))

describe("FileSystemHarnessStore", () => {
  it.effect("loads an empty state when no file exists", () =>
    Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      expect(yield* store.load(scope)).toEqual(HarnessState.empty(scope))
    }).pipe(provide(storeLayer(makeDisk()))),
  )

  it.effect("round-trips one exact state", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const state = applied({
        state: stateWith("a"),
        proposal: proposal({ edits: [create({ kind: "skill", id: "runner", value: { reference: "pkg.run" } })] }),
      }).state
      yield* store.save(state)
      expect(yield* store.load(scope)).toEqual(state)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("uses the host-supplied path for each scope", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      yield* store.save({ ...HarnessState.empty("global"), scope: "global" })
      expect([...disk.files.keys()].toSorted()).toEqual(
        ["/data/global/harness.json", `/data/${scope}/harness.json`].toSorted(),
      )
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("keeps scopes independent on disk", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      yield* store.save(
        HarnessState.make({ scope: "global", entries: [entry({ id: "b", kind: "skill", scope: "global" })] }),
      )
      expect(HarnessState.allEntries(yield* store.load(scope)).map((value) => value.id)).toEqual(["a"])
      expect(HarnessState.allEntries(yield* store.load("global")).map((value) => value.id)).toEqual(["b"])
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("writes owner-only files into owner-only directories", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      expect(disk.modes.get(`/data/${scope}/harness.json`)).toBe(0o600)
      expect(disk.modes.get(`/data/${scope}`)).toBe(0o700)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("creates a missing directory before writing", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      expect(disk.directories.has(`/data/${scope}`)).toBe(false)
      yield* store.save(stateWith("a"))
      expect(disk.directories.has(`/data/${scope}`)).toBe(true)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("replaces atomically through a temporary file and rename", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      const file = `/data/${scope}/harness.json`
      expect(disk.renames).toHaveLength(1)
      expect(disk.renames[0]![1]).toBe(file)
      expect(disk.renames[0]![0]).not.toBe(file)
      expect(disk.writes.every((path) => path.endsWith(".tmp"))).toBe(true)
      expect(temporaries(disk)).toEqual([])
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("never leaves a reader observing a partial state", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      const first = yield* store.load(scope)
      yield* store.save(stateWith("b"))
      const second = yield* store.load(scope)
      expect(HarnessState.allEntries(first).map((value) => value.id)).toEqual(["a"])
      expect(HarnessState.allEntries(second).map((value) => value.id)).toEqual(["b"])
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("keeps the prior state readable when a rename fails", () => {
    const disk = makeDisk()
    disk.directories.add(`/data/${scope}`)
    disk.files.set(`/data/${scope}/harness.json`, JSON.stringify(stateWith("a")))
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.save(stateWith("b")).pipe(Effect.flip)
      expect(failure.reason).toBe("unwritable")
      expect(HarnessState.allEntries(yield* store.load(scope)).map((value) => value.id)).toEqual(["a"])
      expect(temporaries(disk)).toEqual([])
    }).pipe(provide(storeLayer(disk, { failRename: true })))
  })

  it.effect("fails typed on a corrupt file instead of resetting the scope", () => {
    const disk = makeDisk()
    disk.files.set(`/data/${scope}/harness.json`, "{ not json")
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.load(scope).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/harness/HarnessStoreError")
      expect(failure.reason).toBe("corrupt")
      expect(failure.scope).toBe(scope)
      expect(disk.files.get(`/data/${scope}/harness.json`)).toBe("{ not json")
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("fails typed on well-formed JSON that is not a harness state", () => {
    const disk = makeDisk()
    disk.files.set(`/data/${scope}/harness.json`, JSON.stringify({ schemaVersion: "2", scope }))
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.load(scope).pipe(Effect.flip)
      expect(failure.reason).toBe("corrupt")
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("fails typed on a state holding an out-of-contract entry", () => {
    const disk = makeDisk()
    const state = stateWith("a")
    disk.files.set(
      `/data/${scope}/harness.json`,
      JSON.stringify({ ...state, entries: { ...state.entries, memory: [{ ...state.entries.memory[0], version: 0 }] } }),
    )
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      expect((yield* store.load(scope).pipe(Effect.flip)).reason).toBe("corrupt")
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("fails typed when the directory cannot be created", () =>
    Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.save(stateWith("a")).pipe(Effect.flip)
      expect(failure.reason).toBe("unwritable")
      expect(failure.message).toContain("directory")
    }).pipe(provide(storeLayer(makeDisk(), { denyDirectory: "/data" }))),
  )

  it.effect("fails typed when the file cannot be written", () =>
    Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.save(stateWith("a")).pipe(Effect.flip)
      expect(failure.reason).toBe("unwritable")
      expect(failure.scope).toBe(scope)
    }).pipe(provide(storeLayer(makeDisk(), { denyWrite: "/data" }))),
  )

  it.effect("fails typed when an existing file cannot be read", () =>
    Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const failure = yield* store.load(scope).pipe(Effect.flip)
      expect(failure.reason).toBe("unreadable")
    }).pipe(
      provide(
        FileSystemHarnessStore.layer({ path: (value) => `/data/${value}/harness.json` }).pipe(
          Layer.provide(
            Layer.merge(
              FileSystem.layerNoop({
                readFileString: (path) => Effect.fail(systemError("PermissionDenied", "readFileString", path)),
              }),
              Path.layer,
            ),
          ),
        ),
      ),
    ),
  )

  it.effect("serializes concurrent saves of one scope", () => {
    const disk = makeDisk()
    const observed: Array<number> = []
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* Effect.forEach(
        [stateWith("a"), stateWith("b"), stateWith("c"), stateWith("d")],
        (state) => store.save(state).pipe(Effect.tap(() => Effect.sync(() => observed.push(temporaries(disk).length)))),
        { concurrency: "unbounded" },
      )
      expect(observed.every((count) => count === 0)).toBe(true)
      expect(disk.renames).toHaveLength(4)
      expect(HarnessState.allEntries(yield* store.load(scope))).toHaveLength(1)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("never overlaps the write-then-rename window of one scope", () => {
    const disk = makeDisk()
    const window = { open: 0, maximum: 0 }
    const layerValue = storeLayer(disk, {
      onWrite: () => {
        window.open += 1
        window.maximum = Math.max(window.maximum, window.open)
      },
      onRename: () => {
        window.open -= 1
      },
    })
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* Effect.forEach([stateWith("a"), stateWith("b"), stateWith("c"), stateWith("d")], store.save, {
        concurrency: "unbounded",
      })
      expect(disk.renames).toHaveLength(4)
      expect(window.maximum).toBe(1)
      expect(window.open).toBe(0)
    }).pipe(provide(layerValue))
  })

  it.effect("detects overlap when the same window is left unguarded", () => {
    const disk = makeDisk()
    const window = { open: 0, maximum: 0 }
    const faults: Faults = {
      onWrite: () => {
        window.open += 1
        window.maximum = Math.max(window.maximum, window.open)
      },
      onRename: () => {
        window.open -= 1
      },
    }
    return Effect.gen(function* () {
      const unguarded = yield* FileSystemHarnessStore.make({ path: (value) => `/data/${value}/harness.json` })
      yield* Effect.forEach(
        ["a", "b", "c", "d"].map((id) =>
          HarnessState.make({
            scope: `${scope}-${id}`,
            entries: [entry({ id, kind: "memory", scope: `${scope}-${id}` })],
          }),
        ),
        unguarded.save,
        { concurrency: "unbounded" },
      )
      expect(window.maximum).toBeGreaterThan(1)
    }).pipe(provide(Layer.merge(diskLayer(disk, faults), Path.layer)))
  })

  it.effect("uses a distinct temporary name per save", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      yield* store.save(stateWith("b"))
      expect(new Set(disk.writes).size).toBe(disk.writes.length)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("keeps temporary files inside the destination directory", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      yield* store.save(stateWith("a"))
      expect(disk.writes.every((path) => path.startsWith(`/data/${scope}/`))).toBe(true)
    }).pipe(provide(storeLayer(disk)))
  })

  it.effect("survives the whole propose, apply, save, rollback cycle on disk", () => {
    const disk = makeDisk()
    return Effect.gen(function* () {
      const store = yield* HarnessStore.HarnessStore
      const start = yield* store.load(scope)
      const change = applied({
        state: start,
        proposal: proposal({ edits: [create({ kind: "memory", id: "learned" })] }),
      })
      yield* store.save(change.state)
      const undone = applied({
        state: yield* store.load(scope),
        proposal: Refinement.rollbackProposal(change, { id: "rollback-1", at: at(9) }),
      })
      yield* store.save(undone.state)
      const final = yield* store.load(scope)
      expect(HarnessState.snapshotId(final)).toBe(HarnessState.snapshotId(start))
      expect(final.refinements.map((event) => event.proposal)).toEqual(["proposal-1", "rollback-1"])
    }).pipe(provide(storeLayer(disk)))
  })
})
