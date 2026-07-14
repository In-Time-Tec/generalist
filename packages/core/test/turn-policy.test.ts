import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { TurnPolicy } from "../src/index"

type EffectServices<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never

class LeftPolicyService extends Context.Service<LeftPolicyService, { readonly value: "left" }>()(
  "@batonfx/core/test/turn-policy.test/LeftPolicyService",
) {}

class RightPolicyService extends Context.Service<RightPolicyService, { readonly value: "right" }>()(
  "@batonfx/core/test/turn-policy.test/RightPolicyService",
) {}

describe("TurnPolicy snapshots", () => {
  it("describes portable built-in constructor data", () => {
    const recurs = TurnPolicy.recurs(3)
    const until = TurnPolicy.untilToolCall("submit_answer")

    expect(recurs.snapshot).toEqual({ _tag: "Recurs", count: 3 })
    expect(until.snapshot).toEqual({ _tag: "UntilToolCall", name: "submit_answer" })
    expect(TurnPolicy.both(recurs, until).snapshot).toEqual({
      _tag: "Both",
      first: { _tag: "Recurs", count: 3 },
      second: { _tag: "UntilToolCall", name: "submit_answer" },
    })
    expect(TurnPolicy.defaultPolicy.snapshot).toEqual({ _tag: "Recurs", count: 8 })
  })

  it("keeps custom policies and compositions containing them opaque", () => {
    const custom = TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.stop({ _tag: "GoalSatisfied" })))

    expect(custom.snapshot).toBeUndefined()
    expect(TurnPolicy.both(TurnPolicy.recurs(2), custom).snapshot).toBeUndefined()
    expect(TurnPolicy.both(custom, TurnPolicy.untilToolCall("done")).snapshot).toBeUndefined()
  })

  it("keeps non-finite recurrence counts opaque because JSON cannot preserve them", () => {
    expect(TurnPolicy.recurs(Number.NaN).snapshot).toBeUndefined()
    expect(TurnPolicy.recurs(Number.POSITIVE_INFINITY).snapshot).toBeUndefined()
    expect(TurnPolicy.recurs(Number.NEGATIVE_INFINITY).snapshot).toBeUndefined()
  })

  it.effect("classifies non-finite recurrence stops as policy reasons", () =>
    Effect.gen(function* () {
      const info = { turn: 0, history: Prompt.empty, pendingToolResults: [] }

      expect(yield* TurnPolicy.recurs(Number.NaN).decide(info)).toEqual(
        TurnPolicy.decision.stop({ _tag: "Policy", detail: "Non-finite recurrence count stopped: NaN" }),
      )
      expect(yield* TurnPolicy.recurs(Number.NEGATIVE_INFINITY).decide(info)).toEqual(
        TurnPolicy.decision.stop({ _tag: "Policy", detail: "Non-finite recurrence count stopped: -Infinity" }),
      )
      expect(yield* TurnPolicy.recurs(Number.POSITIVE_INFINITY).decide(info)).toEqual(TurnPolicy.decision.continue())
    }),
  )

  it.effect("round-trips every serializable stop reason", () =>
    Effect.gen(function* () {
      const reasons: ReadonlyArray<TurnPolicy.StopReason> = [
        { _tag: "TurnLimit", limit: 8 },
        { _tag: "GoalSatisfied" },
        { _tag: "BudgetExhausted", budget: "tokens" },
        { _tag: "Policy", detail: "operator requested stop" },
      ]

      for (const reason of reasons) {
        const jsonSchema = Schema.fromJsonString(TurnPolicy.StopReason)
        const encoded = yield* Schema.encodeEffect(jsonSchema)(reason)
        const decoded = yield* Schema.decodeUnknownEffect(jsonSchema)(encoded)
        expect(decoded).toEqual(reason)
        expect(TurnPolicy.decision.stop(reason)).toEqual({ _tag: "Stop", reason })
      }
    }),
  )

  it.effect("preserves typed policy evaluation failures", () => {
    const failure = TurnPolicy.TurnPolicyError.make({ message: "budget unavailable", cause: { code: "offline" } })
    const policy = TurnPolicy.make(() => Effect.fail(failure))

    return Effect.gen(function* () {
      const actual = yield* Effect.flip(policy.decide({ turn: 1, history: Prompt.empty, pendingToolResults: [] }))
      expect(actual).toBe(failure)
      expect(actual.cause).toEqual({ code: "offline" })
    })
  })

  it.effect("adapts legacy reasonless stop decisions", () =>
    Effect.gen(function* () {
      const policy = TurnPolicy.fromLegacy(() => Effect.succeed({ _tag: "Stop" }))
      const result = yield* policy.decide({ turn: 1, history: Prompt.empty, pendingToolResults: [] })
      expect(result).toEqual({ _tag: "Stop", reason: { _tag: "Policy", detail: "Legacy policy stopped" } })
      expect(policy.snapshot).toBeUndefined()
    }),
  )

  it.effect("passes legacy Continue overrides through unchanged", () => {
    const legacy = TurnPolicy.decision.continue({ instructions: "finish now" })
    return Effect.gen(function* () {
      const result = yield* TurnPolicy.fromLegacy(() => Effect.succeed(legacy)).decide({
        turn: 1,
        history: Prompt.empty,
        pendingToolResults: [],
      })
      expect(result).toBe(legacy)
    })
  })

  it.effect("unions both policy requirements and evaluates only to the first stop", () => {
    let leftEvaluations = 0
    let rightEvaluations = 0
    const first = TurnPolicy.make<LeftPolicyService>(() =>
      Effect.gen(function* () {
        yield* LeftPolicyService
        leftEvaluations += 1
        return TurnPolicy.decision.stop({ _tag: "Policy", detail: "left stopped" })
      }),
    )
    const second = TurnPolicy.make<RightPolicyService>(() =>
      Effect.gen(function* () {
        yield* RightPolicyService
        rightEvaluations += 1
        return TurnPolicy.decision.continue()
      }),
    )
    const combined = TurnPolicy.both(first, second)
    const evaluated = combined.decide({ turn: 1, history: Prompt.empty, pendingToolResults: [] })
    const leftProof: LeftPolicyService extends EffectServices<typeof evaluated> ? true : false = true
    const rightProof: RightPolicyService extends EffectServices<typeof evaluated> ? true : false = true

    return Effect.gen(function* () {
      const result = yield* evaluated.pipe(
        Effect.provideService(LeftPolicyService, { value: "left" }),
        Effect.provideService(RightPolicyService, { value: "right" }),
      )
      expect(leftProof).toBe(true)
      expect(rightProof).toBe(true)
      expect(result).toEqual(TurnPolicy.decision.stop({ _tag: "Policy", detail: "left stopped" }))
      expect(leftEvaluations).toBe(1)
      expect(rightEvaluations).toBe(0)
    })
  })
})
