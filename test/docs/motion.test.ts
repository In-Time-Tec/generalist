import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Spring, advance, aim, at, moving, springs } from "../../docs/src/motion.js"

describe("documentation motion", () => {
  it("glides to a target and stops scheduling when it settles", () => {
    let spring = aim(at(0), 180, false)
    spring = advance(spring, 16, springs.fast)
    expect(spring.value).toBeGreaterThan(0)
    expect(spring.value).toBeLessThan(180)
    expect(moving(spring)).toBe(true)
    for (let frame = 0; frame < 90; frame++) spring = advance(spring, 16, springs.fast)
    expect(spring).toEqual(at(180))
    expect(moving(spring)).toBe(false)
    expect(advance(spring, 16, springs.fast)).toBe(spring)
  })

  it("retains position and velocity when the target reverses", () => {
    const outward = advance(aim(at(0), 180, false), 32, springs.fast)
    const reversed = aim(outward, 0, false)
    expect(reversed.value).toBe(outward.value)
    expect(reversed.velocity).toBe(outward.velocity)
    expect(reversed.target).toBe(0)
    let current = reversed
    for (let frame = 0; frame < 90; frame++) current = advance(current, 16, springs.fast)
    expect(current).toEqual(at(0))
  })

  it("preserves frame-rate-independent movement", () => {
    const initial = aim(at(0), 1, false)
    const oneFrame = advance(initial, 32, springs.slow)
    const twoFrames = advance(advance(initial, 16, springs.slow), 16, springs.slow)
    expect(twoFrames.value).toBeCloseTo(oneFrame.value, 10)
    expect(twoFrames.velocity).toBeCloseTo(oneFrame.velocity, 10)
  })

  it("bounds hidden-tab time jumps and immediately honors reduced motion", () => {
    const initial = aim(at(0), 1, false)
    expect(advance(initial, 30_000, springs.slow)).toEqual(advance(initial, 64, springs.slow))
    expect(aim(initial, 1, true)).toEqual(at(1))
    expect(advance(initial, -1, springs.fast)).toEqual(initial)
  })

  it("rejects non-finite serialized animation state", () => {
    expect(Schema.is(Spring)({ value: Number.NaN, target: 0, velocity: 0 })).toBe(false)
    expect(Schema.is(Spring)(at(0))).toBe(true)
  })
})
