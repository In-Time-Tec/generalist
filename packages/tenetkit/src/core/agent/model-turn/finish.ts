import { Effect, Function } from "effect"
import { Prompt, Response, Telemetry, Tool } from "effect/unstable/ai"
import {
  addUsage,
  type Completed,
  RunEndedWithoutOutput,
  type TurnCompleted,
  TurnLimitExceeded,
  PolicyStopped,
} from "../event.js"
import type { AgentRunState } from "../run-state.js"
import type { ProviderUsage } from "../../model/attempt/observation.js"

const missingOutputFailure = (state: AgentRunState, turn: number) => {
  const common = {
    turn,
    providerTextCharacters: state.providerOutput.textCharacters,
    reasoningCharacters: state.providerOutput.reasoningCharacters,
  }
  return state.providerOutput.finishReason === undefined
    ? RunEndedWithoutOutput.make(common)
    : RunEndedWithoutOutput.make({ ...common, finishReason: state.providerOutput.finishReason })
}

const policyStopFailure = (
  decision: Extract<import("../../turn/policy.js").Decision, { readonly _tag: "Stop" }>,
  turn: number,
  pending: ReadonlyArray<{ readonly tool_call_id: string; readonly tool_name: string }>,
) =>
  decision.reason._tag === "TurnLimit"
    ? TurnLimitExceeded.make({ turn, limit: decision.reason.limit, pending })
    : PolicyStopped.make({ turn, reason: decision.reason, pending })

export const TurnFinish = { missingOutputFailure, policyStopFailure }

export const turnCompletedEvent: {
  (turn: number, transcript: Prompt.Prompt): (state: AgentRunState) => TurnCompleted
  (state: AgentRunState, turn: number, transcript: Prompt.Prompt): TurnCompleted
} = Function.dual(
  3,
  (state: AgentRunState, turn: number, transcript: Prompt.Prompt): TurnCompleted =>
    state.finish === undefined
      ? { _tag: "TurnCompleted", turn, transcript }
      : {
          _tag: "TurnCompleted",
          turn,
          transcript,
          usage: state.finish.usage,
          finishReason: state.finish.reason,
        },
)

export const terminalCompletedEvent: {
  (turn: number, transcript: Prompt.Prompt): (state: AgentRunState) => Completed
  (state: AgentRunState, turn: number, transcript: Prompt.Prompt): Completed
} = Function.dual(
  3,
  (state: AgentRunState, turn: number, transcript: Prompt.Prompt): Completed =>
    state.usage === undefined
      ? { _tag: "Completed", turns: turn + 1, text: state.text, transcript }
      : { _tag: "Completed", turns: turn + 1, text: state.text, transcript, usage: state.usage },
)

const safeTokenSum = (left: number, right: number): number => Math.min(left + right, Number.MAX_SAFE_INTEGER)
const providerUsageTokens = (usage: ProviderUsage | undefined): number =>
  usage?.totalTokens ?? safeTokenSum(usage?.inputTokens ?? 0, usage?.outputTokens ?? 0)

export const modelBudgetCharge = (input: {
  readonly usage: Response.Usage | undefined
  readonly failedAttemptUsage: ProviderUsage | undefined
  readonly fallbackTokens: number | undefined
}): number => {
  const finalReported =
    input.usage === undefined
      ? 0
      : safeTokenSum(input.usage.inputTokens.total ?? 0, input.usage.outputTokens.total ?? 0)
  const terminalCharge = finalReported > 0 ? finalReported : (input.fallbackTokens ?? 0)
  return safeTokenSum(terminalCharge, providerUsageTokens(input.failedAttemptUsage))
}

export const captureFinishPart: {
  (part: Response.FinishPart): (state: AgentRunState) => Effect.Effect<void>
  (state: AgentRunState, part: Response.FinishPart): Effect.Effect<void>
} = Function.dual(
  2,
  (state: AgentRunState, part: Response.FinishPart): Effect.Effect<void> =>
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan
      state.finish = {
        usage: state.finish === undefined ? part.usage : addUsage(state.finish.usage, part.usage),
        reason: part.reason,
      }
      state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
      const reportedTokens = part.usage.inputTokens.total
      if (state.currentContextTokens !== undefined && state.currentContext !== undefined) {
        state.reportedContextUsage =
          reportedTokens !== undefined && Number.isSafeInteger(reportedTokens) && reportedTokens >= 0
            ? {
                prompt: state.currentContext,
                estimatedTokens: state.currentContextTokens,
                reportedTokens,
              }
            : undefined
      }
      Telemetry.addGenAIAnnotations(span, {
        operation: { name: "chat" },
        usage: {
          inputTokens: part.usage.inputTokens.total,
          outputTokens: part.usage.outputTokens.total,
        },
        response: { finishReasons: [part.reason] },
      })
    }).pipe(Effect.orDie),
)

export const captureStructuredUsage: {
  (content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>): (state: AgentRunState) => Effect.Effect<void>
  (state: AgentRunState, content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>): Effect.Effect<void>
} = Function.dual(
  2,
  (state: AgentRunState, content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>): Effect.Effect<void> =>
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan
      for (const part of content) {
        if (part.type === "finish") {
          state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
          state.finish = {
            usage: state.usage,
            reason: part.reason,
          }
          Telemetry.addGenAIAnnotations(span, {
            operation: { name: "chat" },
            usage: {
              inputTokens: part.usage.inputTokens.total,
              outputTokens: part.usage.outputTokens.total,
            },
            response: { finishReasons: [part.reason] },
          })
        }
      }
    }).pipe(Effect.orDie),
)
