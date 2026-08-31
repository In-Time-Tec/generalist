import { Effect, Function, Option, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { AgentError } from "../event.js"
import type { Agent, ProgressOverflowPolicy, RunOptions } from "../service.js"
import { validationFailure as toolSchedulingFailure } from "../tools/scheduler.js"
import { defaultProgressOverflowPolicy, progressOverflowPolicySchema } from "./construction.js"

const invalidNonNegativeFinite = (value: number | undefined) =>
  value !== undefined && (!Number.isFinite(value) || value < 0)
const invalidNonNegativeSafeInteger = (value: number | undefined) =>
  value !== undefined && (!Number.isSafeInteger(value) || value < 0)
const invalidPositiveFinite = (value: number | undefined) =>
  value !== undefined && (!Number.isFinite(value) || value <= 0)

const numericOptionFailures = (options: RunOptions): ReadonlyArray<AgentError | undefined> => [
  invalidNonNegativeFinite(options.toolOutputMaxBytes)
    ? AgentError.make({ message: "RunOptions.toolOutputMaxBytes must be a non-negative finite number", turn: 0 })
    : undefined,
  invalidNonNegativeSafeInteger(options.modelCallOrdinalStart)
    ? AgentError.make({ message: "RunOptions.modelCallOrdinalStart must be a non-negative safe integer", turn: 0 })
    : undefined,
  invalidNonNegativeSafeInteger(options.turnStart)
    ? AgentError.make({ message: "RunOptions.turnStart must be a non-negative safe integer", turn: 0 })
    : undefined,
  invalidPositiveFinite(options.compaction?.contextWindow)
    ? AgentError.make({ message: "RunOptions.compaction.contextWindow must be a positive finite number", turn: 0 })
    : undefined,
  invalidNonNegativeSafeInteger(options.compaction?.reserveTokens)
    ? AgentError.make({
        message: "RunOptions.compaction.reserveTokens must be a non-negative safe integer",
        turn: 0,
      })
    : undefined,
]

export const validate: {
  <T extends Record<string, Tool.Any>>(
    agent: Pick<Agent<T, unknown>, "toolScheduling" | "toolkit">,
  ): (options: RunOptions) => Effect.Effect<ProgressOverflowPolicy, AgentError>
  <T extends Record<string, Tool.Any>>(
    options: RunOptions,
    agent: Pick<Agent<T, unknown>, "toolScheduling" | "toolkit">,
  ): Effect.Effect<ProgressOverflowPolicy, AgentError>
} = Function.dual(
  2,
  <T extends Record<string, Tool.Any>>(
    options: RunOptions,
    agent: Pick<Agent<T, unknown>, "toolScheduling" | "toolkit">,
  ): Effect.Effect<ProgressOverflowPolicy, AgentError> => {
    const numericFailure = numericOptionFailures(options).find((failure) => failure !== undefined)
    if (numericFailure !== undefined) return numericFailure
    const decoded = Schema.decodeOption(progressOverflowPolicySchema)(
      options.toolProgress === undefined ? defaultProgressOverflowPolicy : options.toolProgress,
    )
    if (Option.isNone(decoded)) {
      return AgentError.make({
        message: "RunOptions.toolProgress must select a supported policy with a positive safe-integer capacity",
        turn: 0,
      })
    }
    const schedulingFailure = toolSchedulingFailure(agent.toolScheduling, Object.keys(agent.toolkit.tools))
    return schedulingFailure === undefined
      ? Effect.succeed(decoded.value)
      : AgentError.make({ message: schedulingFailure, turn: 0 })
  },
)
