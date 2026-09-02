import { Function, Schema } from "effect"

export const SpecVersion = Schema.Literals(["1"])
export type SpecVersion = typeof SpecVersion.Type

export const Sequence = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
export type Sequence = typeof Sequence.Type

export const eventIdFor: {
  (sequence: number): (runId: string) => string
  (runId: string, sequence: number): string
} = Function.dual(2, (runId: string, sequence: number): string => `${runId}:${sequence}`)
