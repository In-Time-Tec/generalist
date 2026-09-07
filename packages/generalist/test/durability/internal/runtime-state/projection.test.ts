import { expect, it } from "@effect/vitest"
import { Effect, Scheduler, Schema } from "effect"
import { encode, diff, encodeCommandValue, decodeReceipt } from "../../../../src/durability/internal/runtime-state.js"
import { apply, freeze, isImmutable } from "../../../../src/durability/internal/protocol.js"
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

it.effect("keeps authoritative changed-field decoding independent of unchanged table population", () =>
  Effect.gen(function* () {
    const operations: Array<number> = []
    for (const size of [10, 1000]) {
      const local = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })
      const persisted = freeze(
        yield* encode({
          ...local,
          agentNames: new Map(Array.from({ length: size }, (_, index) => [String(index), String(index)])),
        }),
      )
      const projection = make({ originals: new WeakMap(), diff })
      yield* projection.decode(persisted)
      projection.accept()
      const updated = yield* apply(
        persisted,
        [{ op: "set", path: ["data", "fields", "agentNames", "entries", "s:0"], value: "changed" }],
        "corruption",
      )
      const count = yield* Effect.gen(function* () {
        const before = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
        const decoded = yield* projection.decode(updated)
        const after = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
        expect(decoded.agentNames.get("0")).toBe("changed")
        return after - before
      }).pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))
      operations.push(count)
    }
    expect(operations[1]).toBe(operations[0])
  }),
)

it.effect("retains validated command wire without retaining mutable command or receipt values", () =>
  Effect.gen(function* () {
    const receiptSchema = Schema.Struct({ values: Schema.Array(Schema.Int) })
    const operations: Array<number> = []
    for (const size of [10, 1000]) {
      const input = { values: Array.from({ length: size }, (_, index) => index) }
      const wire = yield* encodeCommandValue(input, receiptSchema)
      expect(isImmutable(wire)).toBe(true)
      input.values[0] = -1
      const result = yield* Effect.gen(function* () {
        const before = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
        const decoded = yield* decodeReceipt(wire, receiptSchema)
        const after = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
        return { decoded, operations: after - before }
      }).pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))
      expect(result.decoded.values[0]).toBe(0)
      Reflect.set(result.decoded.values, "0", -2)
      expect((yield* decodeReceipt(wire, receiptSchema)).values[0]).toBe(0)
      operations.push(result.operations)
    }
    expect(operations[1]).toBe(operations[0])
  }),
)
