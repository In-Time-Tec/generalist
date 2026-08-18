import { Schema } from "effect"
import type { Tool } from "effect/unstable/ai"

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)
const appendInstructionFragment = (base: string | undefined, fragment: string | undefined): string | undefined => {
  if (fragment === undefined || fragment.length === 0) return base
  if (base === undefined || base.length === 0) return fragment
  return `${base}\n\n${fragment}`
}
const defaultProgressOverflowPolicy = { _tag: "Backpressure", capacity: 64 } as const
const progressCapacitySchema = Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
const progressOverflowPolicySchema = Schema.Union([
  Schema.TaggedStruct("Backpressure", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Dropping", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Sliding", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Fail", { capacity: progressCapacitySchema }),
])

type StaticDeclaration = { readonly origin: import("./agent-event.js").ToolOrigin; readonly tool: Tool.Any }

/** @internal Small setup codecs and normalizers kept outside the composition root. */
export const SetupHelpers = {
  errorMessage,
  appendInstructionFragment,
  defaultProgressOverflowPolicy,
  progressOverflowPolicySchema,
}
export type { StaticDeclaration }
