import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Schema } from "effect"
import { RunBudget } from "../../../src/index.js"

const schemaError = (build: () => void): boolean => {
  try {
    build()
    return false
  } catch (error) {
    return Schema.isSchemaError(error)
  }
}

describe("RunBudget", () => {
  it("rejects a NaN duration instead of silently zeroing or ignoring it", () => {
    expect(schemaError(() => RunBudget.make({ duration: Number.NaN }))).toBe(true)

    const budget = RunBudget.make({ tokens: 1, duration: 1_000 })
    expect(schemaError(() => RunBudget.extend(budget, { duration: Number.NaN }))).toBe(true)
    expect(budget.allocation.duration).toBe(1_000)
  })

  it("keeps the malformed-duration controls rejected and valid durations accepted", () => {
    const budget = RunBudget.make({ tokens: 1, duration: 1_000 })
    for (const duration of [Number.POSITIVE_INFINITY, -1]) {
      expect(schemaError(() => RunBudget.make({ duration }))).toBe(true)
      expect(schemaError(() => RunBudget.extend(budget, { duration }))).toBe(true)
    }
    expect(budget.allocation.duration).toBe(1_000)
    expect(RunBudget.make({ duration: 0 }).allocation.duration).toBe(0)
    expect(RunBudget.make({ duration: 1_000 }).allocation.duration).toBe(1_000)
    expect(RunBudget.make({ duration: "1 second" }).allocation.duration).toBe(1_000)
    expect(RunBudget.extend(budget, { duration: 500 }).allocation.duration).toBe(1_500)
  })

  it("constructs the current five-dimensional contract", () => {
    expect(RunBudget.make({ tokens: 10, usd: 2, duration: "3 seconds", toolCalls: 4, children: 5 })).toEqual({
      allocation: { tokens: 10, usd: 2, duration: 3_000, toolCalls: 4, children: 5 },
      remaining: { tokens: 10, usd: 2, duration: 3_000, toolCalls: 4, children: 5 },
    })
  })

  it.effect("charges and reports the exact exhausted dimension", () =>
    Effect.gen(function* () {
      const charged = yield* RunBudget.charge(RunBudget.make({ tokens: 3 }), { tokens: 3 })
      const error = yield* RunBudget.charge(charged, { tokens: 1 }).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "generalist/core/RunBudgetExhausted",
        budget: "tokens",
        requested: 1,
        remaining: 0,
      })
    }),
  )

  it.effect("reserves a child and refunds only its unused allocation", () =>
    Effect.gen(function* () {
      const reserved = yield* RunBudget.reserveChild(RunBudget.make({ tokens: 10, children: 1 }), { tokens: 6 })
      const child = yield* RunBudget.charge(reserved.child, { tokens: 2 })
      expect(RunBudget.refundUnused(reserved.parent, child).remaining).toEqual({ tokens: 8, children: 0 })
    }),
  )

  it.effect("fails malformed child grants with a typed error and preserves narrowing controls", () =>
    Effect.gen(function* () {
      const parent = RunBudget.make({ tokens: 10 })
      const child = RunBudget.make({ tokens: 5 })
      for (const narrower of [{ tokens: -1 }, { tokens: Number.NaN }, { tokens: Number.POSITIVE_INFINITY }]) {
        const exit = yield* Effect.exit(RunBudget.narrowChild(parent, child, narrower))
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.every(Cause.isFailReason)).toBe(true)
          const reason = exit.cause.reasons[0]
          if (reason === undefined || !Cause.isFailReason(reason)) {
            throw new Error(`expected a typed RunBudgetInvalid failure, received ${reason?._tag ?? "no reason"}`)
          }
          expect(reason.error._tag).toBe("generalist/core/RunBudgetInvalid")
        }
      }

      const reserveMalformed = yield* RunBudget.reserveChild(parent, { tokens: Number.NaN }).pipe(Effect.flip)
      expect(reserveMalformed._tag).toBe("generalist/core/RunBudgetInvalid")

      const reserved = yield* RunBudget.reserveChild(parent, { tokens: 6 })
      const narrowed = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { tokens: 2 })
      expect(narrowed.parent.remaining.tokens).toBe(8)
      expect(narrowed.child.allocation.tokens).toBe(2)
      expect(narrowed.child.remaining.tokens).toBe(2)

      const widened = yield* RunBudget.narrowChild(reserved.parent, reserved.child, { tokens: 7 }).pipe(Effect.flip)
      expect(widened._tag).toBe("generalist/core/RunBudgetInvalid")
    }),
  )

  it("marks unknown USD without losing token accounting", () => {
    const budget = RunBudget.make({ tokens: 10, usd: 2 })
    expect(RunBudget.inspect(budget, { tokens: 3, usd: "unknown", duration: 0, toolCalls: 0, children: 0 })).toEqual({
      tokens: 7,
      usd: "unknown",
    })
  })
})
