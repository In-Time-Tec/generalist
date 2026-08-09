import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import { Cell, KernelPool, KernelProfile, KernelStateStore, TestKernel } from "../src/index"

const sessionId = "session-a"
const otherSession = "session-b"

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace", dataRoot: "/data" },
  limits: { sourceBytes: 65_536, channelBytes: 4096, cellDeadlineMillis: 1000 },
  trustMode: "trusted-local",
})

const bindings: ReadonlyArray<KernelPool.Binding> = [
  { name: "files", type: "Array", snapshotable: true },
  { name: "summarize", type: "Function", snapshotable: false },
]

const script = (input: { readonly code: string }): TestKernel.Script =>
  input.code === "throw"
    ? { _tag: "Throw", name: "TypeError", message: "boom", stderr: "boom" }
    : { _tag: "Value", value: input.code, stdout: "out" }

const poolLayer = TestKernel.layerTestPool({ profile, script, bindings })

const execute = (code: string, cellId: string, session = sessionId) =>
  Effect.gen(function* () {
    const pool = yield* KernelPool.KernelPool
    const signal = yield* Effect.abortSignal
    return yield* pool.execute({ sessionId: session, cellId, code, signal })
  })

layer(poolLayer)("test KernelPool", (it) => {
  it.effect("streams a cell-local monotonic sequence starting at zero", () =>
    Effect.gen(function* () {
      const execution = yield* execute("1 + 1", "cell-1")
      const events = yield* Stream.runCollect(execution.events)
      expect(events.map((event) => event.sequence)).toEqual([0, 1, 2])
      expect(Cell.validateSequence({ sessionId: sessionId, events: events })).toBeUndefined()
      expect(events.map((event) => event._tag)).toEqual(["KernelReady", "Stdout", "Result"])
    }),
  )

  it.effect("carries the profile digest on KernelReady", () =>
    Effect.gen(function* () {
      const execution = yield* execute("1", "cell-2")
      const events = yield* Stream.runCollect(execution.events)
      const ready = events[0]
      expect(ready?._tag).toBe("KernelReady")
      if (ready?._tag === "KernelReady") expect(ready.profileDigest).toBe(KernelProfile.digest(profile))
    }),
  )

  it.effect("returns a decoded cell result", () =>
    Effect.gen(function* () {
      const execution = yield* execute("1 + 1", "cell-3")
      const result = yield* execution.result
      expect(Schema.is(Cell.CellResult)(result)).toBe(true)
      expect(result.value).toBe("1 + 1")
      expect(result.epoch).toBe(0)
      expect(result.truncation).toEqual([])
    }),
  )

  it.effect("returns a thrown cell as a typed execution failure", () =>
    Effect.gen(function* () {
      const execution = yield* execute("throw", "cell-4")
      const failure = yield* Effect.flip(execution.result)
      expect(Schema.is(Cell.CellExecutionFailed)(failure)).toBe(true)
      if (Schema.is(Cell.CellExecutionFailed)(failure)) expect(failure.name).toBe("TypeError")
    }),
  )

  it.effect("reports the live namespace and epoch", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      const inspection = yield* pool.inspect({ sessionId })
      expect(inspection.epoch).toBe(0)
      expect(inspection.profile).toEqual(profile)
      expect(inspection.bindings.map((binding) => binding.name)).toEqual(["files", "summarize"])
    }),
  )

  it.effect("narrows inspection to one binding", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      const inspection = yield* pool.inspect({ sessionId, name: "files" })
      expect(inspection.bindings.map((binding) => binding.name)).toEqual(["files"])
    }),
  )

  it.effect("reports an interrupt for a cell that is not running", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      const interruption = yield* pool.interrupt(sessionId, "cell-idle")
      expect(interruption._tag).toBe("NotRunning")
    }),
  )

  it.effect("interrupts the cell that is running", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      yield* execute("1", "cell-running")
      const interruption = yield* pool.interrupt(sessionId, "cell-running")
      expect(interruption._tag).toBe("Interrupted")
    }),
  )

  it.effect("starts a new epoch on restart and names restored and dropped bindings", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      const restart = yield* pool.restart(otherSession, "killed")
      expect(restart.epoch).toBe(1)
      expect(restart.reason).toBe("killed")
      expect(restart.restoredNames).toEqual(["files"])
      expect(restart.droppedNames).toEqual(["summarize"])
      const inspection = yield* pool.inspect({ sessionId: otherSession })
      expect(inspection.epoch).toBe(1)
    }),
  )

  it.effect("keeps epochs independent per Session", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      yield* pool.restart("session-c", "requested")
      const other = yield* pool.inspect({ sessionId: "session-d" })
      expect(other.epoch).toBe(0)
    }),
  )

  it.effect("reports a closed Session as unavailable", () =>
    Effect.gen(function* () {
      const pool = yield* KernelPool.KernelPool
      yield* pool.close("session-e")
      const failure = yield* Effect.flip(execute("1", "cell-x", "session-e"))
      expect(Schema.is(Cell.KernelUnavailable)(failure)).toBe(true)
      if (Schema.is(Cell.KernelUnavailable)(failure)) expect(failure.reason).toBe("closed")
      expect(Schema.is(Cell.KernelUnavailable)(yield* Effect.flip(pool.inspect({ sessionId: "session-e" })))).toBe(true)
    }),
  )
})

const snapshot = (session: string): KernelStateStore.Snapshot => ({
  manifest: KernelStateStore.Manifest.make({
    sessionId: session,
    epoch: 1,
    profileDigest: KernelProfile.digest(profile),
    savedAtMillis: 0,
    restored: [
      { name: "files", kind: "value" },
      { name: "summarize", kind: "source" },
    ],
    dropped: [{ name: "proc", reason: "live-handle" }],
  }),
  payload: new Uint8Array([1, 2, 3]),
})

layer(TestKernel.layerMemoryStore)("memory KernelStateStore", (it) => {
  it.effect("reports no snapshot before one is saved", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      expect(yield* store.load("session-none")).toBeUndefined()
    }),
  )

  it.effect("round-trips a snapshot and its manifest", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      yield* store.save(snapshot(sessionId))
      const loaded = yield* store.load(sessionId)
      expect(loaded?.manifest.restored.map((binding) => binding.kind)).toEqual(["value", "source"])
      expect(loaded?.manifest.dropped).toEqual([{ name: "proc", reason: "live-handle" }])
      expect(loaded?.payload).toEqual(new Uint8Array([1, 2, 3]))
    }),
  )

  it.effect("keeps snapshots keyed by Session identity", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      yield* store.save(snapshot("session-x"))
      expect(yield* store.load("session-y")).toBeUndefined()
    }),
  )

  it.effect("replaces a Session snapshot on save", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      const first = snapshot("session-z")
      yield* store.save(first)
      yield* store.save({ ...first, payload: new Uint8Array([9]) })
      expect((yield* store.load("session-z"))?.payload).toEqual(new Uint8Array([9]))
    }),
  )

  it.effect("drops a Session snapshot", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      yield* store.save(snapshot("session-drop"))
      yield* store.drop("session-drop")
      expect(yield* store.load("session-drop")).toBeUndefined()
    }),
  )

  it.effect("reports a corrupt manifest instead of storing it", () =>
    Effect.gen(function* () {
      const store = yield* KernelStateStore.KernelStateStore
      const failure = yield* Effect.flip(
        store.save({ manifest: { ...snapshot(sessionId).manifest, sessionId: "" }, payload: new Uint8Array() }),
      )
      expect(Schema.is(KernelStateStore.KernelStateUnavailable)(failure)).toBe(true)
      if (Schema.is(KernelStateStore.KernelStateUnavailable)(failure)) expect(failure.reason).toBe("corrupt")
    }),
  )
})

describe("snapshot manifest", () => {
  standalone("round-trips through its codec", () => {
    const manifest = snapshot(sessionId).manifest
    const encoded = Schema.encodeSync(KernelStateStore.Manifest)(manifest)
    expect(Schema.decodeUnknownSync(KernelStateStore.Manifest)(encoded)).toEqual(manifest)
  })

  standalone("rejects an unknown restore kind", () => {
    expect(() => Schema.decodeUnknownSync(KernelStateStore.RestoreKind)("closure")).toThrow()
  })

  standalone("rejects an unknown drop reason", () => {
    expect(() => Schema.decodeUnknownSync(KernelStateStore.DroppedBinding)({ name: "x", reason: "vibes" })).toThrow()
  })
})
