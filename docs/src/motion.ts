import { Function, Schema } from "effect"

export const Spring = Schema.Struct({ value: Schema.Finite, target: Schema.Finite, velocity: Schema.Finite })
export type Spring = typeof Spring.Type

export const at = (value: number): Spring => ({ value, target: value, velocity: 0 })
export const aim: {
  (target: number, reducedMotion: boolean): (spring: Spring) => Spring
  (spring: Spring, target: number, reducedMotion: boolean): Spring
} = Function.dual(
  3,
  (spring: Spring, target: number, reducedMotion: boolean): Spring =>
    reducedMotion ? at(target) : { ...spring, target },
)
export const moving = (spring: Spring): boolean => spring.value !== spring.target || spring.velocity !== 0

export const advance: {
  (deltaMillis: number, frequency: number): (spring: Spring) => Spring
  (spring: Spring, deltaMillis: number, frequency: number): Spring
} = Function.dual(3, (spring: Spring, deltaMillis: number, frequency: number): Spring => {
  if (!moving(spring)) return spring
  const seconds = Math.min(Math.max(deltaMillis, 0), 64) / 1000
  const offset = spring.value - spring.target
  const impulse = (spring.velocity + frequency * offset) * seconds
  const decay = Math.exp(-frequency * seconds)
  const value = spring.target + (offset + impulse) * decay
  const velocity = (spring.velocity - frequency * impulse) * decay
  if (Math.abs(value - spring.target) < 0.001 && Math.abs(velocity) < 0.01) return at(spring.target)
  return { value, target: spring.target, velocity }
})

export const springs = { fast: 55, moderate: 30, slow: 22 } as const
