import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { TurnPolicy } from "../../src/core/index"

type EffectServices<T> = T extends Effect.Effect<unknown, unknown, infer R> ? R : never

class LeftPolicyService extends Context.Service<LeftPolicyService, { readonly value: "left" }>()(
  "tenetkit/test/core/turn-policy.test/LeftPolicyService",
) {}

class RightPolicyService extends Context.Service<RightPolicyService, { readonly value: "right" }>()(
  "tenetkit/test/core/turn-policy.test/RightPolicyService",
) {}

const roundTrip = (snapshot: TurnPolicy.Snapshot): unknown => JSON.parse(JSON.stringify(snapshot))

describe("TurnPolicy snapshots", () => {
  it("describes portable built-in constructor data", () => {
    const recurs = TurnPolicy.recurs(3)
    const until = TurnPolicy.untilToolCall("submit_answer")

    expect(recurs.snapshot).toEqual({ _tag: "Recurs", count: 3 })
    expect(until.snapshot).toEqual({ _tag: "UntilToolCall", name: "submit_answer" })
    expect(TurnPolicy.forever.snapshot).toEqual({ _tag: "Forever" })
    expect(TurnPolicy.both(recurs, until).snapshot).toEqual({
      _tag: "Both",
      first: { _tag: "Recurs", count: 3 },
      second: { _tag: "UntilToolCall", name: "submit_answer" },
    })
    expect(TurnPolicy.defaultPolicy).toBe(TurnPolicy.forever)
    expect(TurnPolicy.defaultPolicy.snapshot).toEqual({ _tag: "Forever" })
  })

  it.effect("forever always continues regardless of turn count or pending results", () =>
    Effect.gen(function* () {
      const foreverProof: EffectServices<ReturnType<typeof TurnPolicy.forever.decide>> extends never ? true : false =
        true
      expect(foreverProof).toBe(true)
      const snapshot: TurnPolicy.Snapshot | undefined = TurnPolicy.forever.snapshot
      expect(snapshot).toEqual({ _tag: "Forever" })

      const pending = [
        Response.toolResultPart({
          id: "call-1",
          name: "echo",
          isFailure: false,
          result: "ok",
          encodedResult: "ok",
          providerExecuted: false,
          preliminary: false,
        }),
      ]
      const infos = [
        { turn: 0, history: Prompt.empty, pendingToolResults: [] },
        { turn: 9, history: Prompt.empty, pendingToolResults: pending },
        { turn: 10_000, history: Prompt.empty, pendingToolResults: pending },
      ]
      for (const info of infos) {
        expect(yield* TurnPolicy.forever.decide(info)).toEqual(TurnPolicy.decision.continue())
      }
    }),
  )

  it("round-trips Forever snapshots through JSON alone and inside both trees", () => {
    expect(roundTrip({ _tag: "Forever" })).toEqual({ _tag: "Forever" })

    const combined = TurnPolicy.both(TurnPolicy.forever, TurnPolicy.untilToolCall("done"))
    expect(combined.snapshot).toEqual({
      _tag: "Both",
      first: { _tag: "Forever" },
      second: { _tag: "UntilToolCall", name: "done" },
    })
    expect(roundTrip(combined.snapshot as TurnPolicy.Snapshot)).toEqual(combined.snapshot)

    const nested = TurnPolicy.both(TurnPolicy.recurs(2), combined)
    expect(roundTrip(nested.snapshot as TurnPolicy.Snapshot)).toEqual({
      _tag: "Both",
      first: { _tag: "Recurs", count: 2 },
      second: { _tag: "Both", first: { _tag: "Forever" }, second: { _tag: "UntilToolCall", name: "done" } },
    })

    const custom = TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.continue()))
    expect(TurnPolicy.both(TurnPolicy.forever, custom).snapshot).toBeUndefined()
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
