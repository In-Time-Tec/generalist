import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { State, Store, Refinement } from "../../src/harness/index.js"
import { applied, create, entry, proposal, scope } from "./fixtures.js"

layer(Store.layerMemory)("Store.layerMemory", (test) => {
  test.effect("loads an empty state for an unknown scope", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      expect(yield* store.load(scope)).toEqual(State.empty(scope))
    }),
  )

  test.effect("returns the exact saved state", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      const state = State.make({ scope, entries: [entry({ id: "a", kind: "memory" })] })
      yield* store.save(state)
      expect(yield* store.load(scope)).toEqual(state)
    }),
  )

  test.effect("keeps scopes independent", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      yield* store.save(
        State.make({ scope: "isolated-a", entries: [entry({ id: "a", kind: "memory", scope: "isolated-a" })] }),
      )
      yield* store.save(
        State.make({ scope: "isolated-b", entries: [entry({ id: "b", kind: "skill", scope: "isolated-b" })] }),
      )
      expect(State.allEntries(yield* store.load("isolated-a")).map((value) => value.id)).toEqual(["a"])
      expect(State.allEntries(yield* store.load("isolated-b")).map((value) => value.id)).toEqual(["b"])
    }),
  )

  test.effect("replaces a scope on a later save", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      const first = State.make({
        scope: "replaced",
        entries: [entry({ id: "a", kind: "memory", scope: "replaced" })],
      })
      yield* store.save(first)
      const next = applied({ state: first, proposal: proposal({ edits: [create({ kind: "memory", id: "b" })] }) }).state
      yield* store.save(next)
      expect(yield* store.load("replaced")).toEqual(next)
    }),
  )

  test.effect("round-trips a full apply through the store", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      const loaded = yield* store.load("applied-scope")
      const result = applied({
        state: loaded,
        proposal: proposal({ edits: [create({ kind: "skill", id: "runner", value: { reference: "pkg.run" } })] }),
      })
      yield* store.save(result.state)
      const reloaded = yield* store.load("applied-scope")
      expect(State.snapshotId(reloaded)).toBe(result.event.after)
      expect(reloaded.refinements.map((event) => event.proposal)).toEqual(["proposal-1"])
    }),
  )

  test.effect("supports the whole propose, apply, save, rollback cycle", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      const start = yield* store.load("cycle")
      const change = applied({
        state: start,
        proposal: proposal({ edits: [create({ kind: "memory", id: "learned" })] }),
      })
      yield* store.save(change.state)
      const undone = applied({
        state: yield* store.load("cycle"),
        proposal: Refinement.rollbackProposal(change, { id: "rollback-1", at: "2024-01-01T00:09:00.000Z" }),
      })
      yield* store.save(undone.state)
      const final = yield* store.load("cycle")
      expect(State.snapshotId(final)).toBe(State.snapshotId(start))
      expect(final.refinements.map((event) => event.proposal)).toEqual(["proposal-1", "rollback-1"])
    }),
  )
})

const fixed = State.make({ scope, entries: [entry({ id: "fixed", kind: "prompt" })] })

layer(
  Store.layerTest({
    load: () => Effect.succeed(fixed),
    save: (state) =>
      Effect.fail(Store.StoreError.make({ reason: "unwritable", scope: state.scope, message: "read only" })),
  }),
)("Store.layerTest", (test) => {
  test.effect("uses the supplied implementation", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      expect(yield* store.load(scope)).toEqual(fixed)
    }),
  )

  test.effect("surfaces the supplied store failure", () =>
    Effect.gen(function* () {
      const store = yield* Store.Store
      const failure = yield* store.save(fixed).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/agent-guidance/StoreError")
      expect(failure.scope).toBe(scope)
      expect(failure.message).toBe("read only")
    }),
  )
})

describe("Store.StoreError", () => {
  it("encodes as a tagged boundary error", () => {
    const failure = Store.StoreError.make({ reason: "unwritable", scope, message: "disk full" })
    expect(Schema.encodeSync(Store.StoreError)(failure)).toMatchObject({
      reason: "unwritable",
      scope,
      message: "disk full",
    })
  })
})
