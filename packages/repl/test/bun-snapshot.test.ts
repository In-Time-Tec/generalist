import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Path, Schema } from "effect"
import { KernelStateStore } from "../src/index.js"
import { BunKernelStateStore } from "../src/repl/bun.js"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel snapshot", (it) => {
  /**
   * A snapshot is best-effort namespace persistence, never authority. It carries three tiers —
   * v8-serializable values, functions and classes re-evaluated from source, and recorded imports —
   * and it names every binding it could not carry rather than pretending nothing was lost.
   */
  it.effect("restores plain values into a new epoch", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "const count = 12; const label = 'kept'; const list = [1, 2, 3]",
          })
          yield* pool.restart("s", "requested")
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "[count, label, list.length].join('|')",
          })
          expect(result.value).toBe("12|kept|3")
        }),
    }),
  )

  it.effect("restores a function by re-evaluating its source in the new epoch", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["const base = 10", "function addBase(value) { return value + base }"].join("\n"),
          })
          yield* pool.restart("s", "requested")
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "addBase(32)" })
          expect(result.value).toBe("42")
        }),
    }),
  )

  it.effect("names a dropped module binding in the restart account", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: 'const mod = await import("effect")' })
          const restart = yield* pool.restart("s", "requested")
          expect(restart.droppedNames).toContain("mod")
          expect(restart.restoredNames).not.toContain("mod")
        }),
    }),
  )

  it.effect("names restored values and dropped live handles separately", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["const plain = 5", "const handle = new AbortController()"].join("\n"),
          })
          const restart = yield* pool.restart("s", "requested")
          expect(restart.restoredNames).toContain("plain")
          expect(restart.droppedNames).toContain("handle")
        }),
    }),
  )

  it.effect("writes a manifest that satisfies the manifest contract", () =>
    withPool({
      use: ({ pool, dataRoot }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const value = 1" })
          yield* pool.close("s")
          const store = yield* BunKernelStateStore.make({ dataRoot })
          const snapshot = yield* store.load("s")
          expect(snapshot).toBeDefined()
          if (snapshot !== undefined) {
            expect(Schema.is(KernelStateStore.Manifest)(snapshot.manifest)).toBe(true)
            expect(snapshot.manifest.sessionId).toBe("s")
            expect(snapshot.payload.byteLength).toBeGreaterThan(0)
          }
        }),
    }),
  )

  it.effect("treats a corrupt snapshot as non-fatal and still boots a kernel", () =>
    withPool({
      use: ({ pool, dataRoot }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const value = 1" })
          yield* pool.close("s")
          const fileSystem = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          yield* fileSystem.writeFileString(
            path.join(dataRoot, "kernel-state", "s", "payload.bin"),
            "this is not a capture",
          )
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "1 + 1" })
          expect(result.value).toBe("2")
        }),
    }),
  )

  it.effect("treats a corrupt manifest as missing rather than failing the Session", () =>
    withPool({
      use: ({ pool, dataRoot }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const value = 1" })
          yield* pool.close("s")
          const fileSystem = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          yield* fileSystem.writeFileString(path.join(dataRoot, "kernel-state", "s", "manifest.json"), "{ not json")
          const store = yield* BunKernelStateStore.make({ dataRoot })
          const failure = yield* Effect.flip(store.load("s"))
          expect(failure.reason).toBe("corrupt")
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "2 + 3" })
          expect(result.value).toBe("5")
        }),
    }),
  )

  it.effect("reports no snapshot for a Session that never ran", () =>
    withPool({
      use: ({ dataRoot }) =>
        Effect.gen(function* () {
          const store = yield* BunKernelStateStore.make({ dataRoot })
          expect(yield* store.load("never-ran")).toBeUndefined()
        }),
    }),
  )
})
