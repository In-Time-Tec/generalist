import { expect, it } from "@effect/vitest"
import { Effect, Scheduler } from "effect"
import { encode, diff } from "../../../../src/durability/internal/runtime-state.js"
import { apply, freeze } from "../../../../src/durability/internal/protocol.js"
import { make } from "../../../../src/durability/internal/runtime-state/projection.js"
import { emptyState } from "../../../../src/runtime/state/projection.js"

it.effect("validates changed root fields without running unchanged field codecs", () =>
  Effect.gen(function* () {
    const persisted = freeze(yield* encode(emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })))
    const projection = make({ originals: new WeakMap(), diff })
    const current = yield* projection.decode(persisted)
    projection.accept()
    const unchanged = yield* Effect.gen(function* () {
      const before = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
      const prepared = yield* projection.encode(current, persisted)
      const after = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
      return { prepared, operations: after - before }
    }).pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))
    expect(unchanged.operations).toBeLessThan(16)
    expect(unchanged.prepared.patches).toEqual([])
    expect(unchanged.prepared.state.runs).toBe(current.runs)
    const changed = yield* projection.encode({ ...current, nextRunCounter: 2 }, persisted)
    expect(changed.patches).toEqual([{ op: "set", path: ["data", "fields", "nextRunCounter"], value: 2 }])
    expect(changed.state.runs).toBe(current.runs)
    expect(changed.state.nextRunCounter).toBe(2)
    const negativeZero = yield* projection.encode({ ...current, nextRunCounter: -0 }, persisted)
    expect(negativeZero.patches).toEqual([
      { op: "set", path: ["data", "fields", "nextRunCounter"], value: { type: "number", value: "-0" } },
    ])
    expect(Object.is(negativeZero.state.nextRunCounter, -0)).toBe(true)
    expect((yield* projection.encode({ ...current, nextRunCounter: -1 }, persisted).pipe(Effect.flip))._tag).toBe(
      "SchemaError",
    )
    const missing = { ...current }
    Reflect.deleteProperty(missing, "nextRunCounter")
    expect((yield* projection.encode(missing, persisted).pipe(Effect.flip))._tag).toBe("SchemaError")
  }),
)

it.effect("reuses only unchanged authoritative fields and rejects malformed root replacements", () =>
  Effect.gen(function* () {
    const persisted = freeze(yield* encode(emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })))
    const projection = make({ originals: new WeakMap(), diff })
    const current = yield* projection.decode(persisted)
    projection.accept()
    const updated = yield* apply(
      persisted,
      [{ op: "set", path: ["data", "fields", "nextRunCounter"], value: 2 }],
      "corruption",
    )
    const changed = yield* projection.decode(updated)
    projection.accept()
    expect(changed.runs).toBe(current.runs)
    expect(changed.nextRunCounter).toBe(2)
    for (const patches of [
      [{ op: "remove", path: ["data", "fields", "runs"] }],
      [{ op: "set", path: ["data", "fields", "extra"], value: 0 }],
      [{ op: "set", path: ["data", "fields", "nextRunCounter"], value: -1 }],
      [{ op: "set", path: ["data", "fields", "runs"], value: 0 }],
    ] as const) {
      const malformed = yield* apply(updated, patches, "corruption")
      expect((yield* projection.decode(malformed).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
    expect(yield* projection.decode(updated)).toBe(changed)
  }),
)
