import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { RunBudget } from "../../../src/index.js"

describe("RunBudget", () => {
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

  it("marks unknown USD without losing token accounting", () => {
    const budget = RunBudget.make({ tokens: 10, usd: 2 })
    expect(RunBudget.inspect(budget, { tokens: 3, usd: "unknown", duration: 0, toolCalls: 0, children: 0 })).toEqual({
      tokens: 7,
      usd: "unknown",
    })
  })
})
