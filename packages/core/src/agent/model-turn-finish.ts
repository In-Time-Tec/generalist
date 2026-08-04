import { Effect } from "effect"
import { Prompt, Response, Telemetry, Tool } from "effect/unstable/ai"
import { addUsage, type Completed, type TurnCompleted } from "./agent-event.js"
import { chargeUsage } from "../durable/driver-run.js"
import type { RunError } from "./agent.js"
import type { AgentRunState } from "./agent-run-state.js"

export const turnCompletedEvent = (state: AgentRunState, turn: number, transcript: Prompt.Prompt): TurnCompleted => ({
  _tag: "TurnCompleted",
  turn,
  transcript,
  ...(state.finish === undefined ? {} : { usage: state.finish.usage, finishReason: state.finish.reason }),
})

export const terminalCompletedEvent = (state: AgentRunState, turn: number, transcript: Prompt.Prompt): Completed => ({
  _tag: "Completed",
  turns: turn + 1,
  text: state.text,
  transcript,
  ...(state.usage === undefined ? {} : { usage: state.usage }),
})

export const chargeAttemptUsage = (
  state: Pick<AgentRunState, "finish" | "currentContextTokens">,
): Effect.Effect<void, RunError, never> => {
  const input = state.finish?.usage.inputTokens.total ?? 0
  const output = state.finish?.usage.outputTokens.total ?? 0
  const reported = input + output
  const totalTokens = reported > 0 ? reported : state.currentContextTokens
  return totalTokens === undefined || totalTokens <= 0
    ? Effect.void
    : (chargeUsage({ totalTokens }) as Effect.Effect<void, RunError, never>)
}

export const captureFinishPart = (state: AgentRunState, part: Response.FinishPart): Effect.Effect<void> =>
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
  }).pipe(Effect.orDie)

export const captureStructuredUsage = (
  state: AgentRunState,
  content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
): Effect.Effect<void> =>
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
  }).pipe(Effect.orDie)
