import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TurnPolicy } from "../src/index"

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
    const custom = TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.stop))

    expect(custom.snapshot).toBeUndefined()
    expect(TurnPolicy.both(TurnPolicy.recurs(2), custom).snapshot).toBeUndefined()
    expect(TurnPolicy.both(custom, TurnPolicy.untilToolCall("done")).snapshot).toBeUndefined()
  })

  it("keeps non-finite recurrence counts opaque because JSON cannot preserve them", () => {
    expect(TurnPolicy.recurs(Number.NaN).snapshot).toBeUndefined()
    expect(TurnPolicy.recurs(Number.POSITIVE_INFINITY).snapshot).toBeUndefined()
    expect(TurnPolicy.recurs(Number.NEGATIVE_INFINITY).snapshot).toBeUndefined()
  })
})
