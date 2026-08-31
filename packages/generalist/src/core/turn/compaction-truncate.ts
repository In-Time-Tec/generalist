import { Effect, Layer, Option } from "effect"
import { AiError, Prompt, Tokenizer } from "effect/unstable/ai"
import {
  Compaction,
  CompactionError,
  microcompactResult,
  type Request,
  type Result,
  type Service,
} from "./compaction-service.js"
import { withCompactionLifecycle } from "./compaction-telemetry.js"
import { estimatePromptTokens } from "./prompt-token-estimate.js"

const truncationDue = (input: Request): boolean =>
  input.overflow ||
  (Number.isFinite(input.usage.contextWindow) &&
    input.usage.contextTokens > input.usage.contextWindow - input.usage.reserveTokens)

const truncateService = (
  maxTokens: number,
  cut: (prompt: Prompt.Prompt) => Effect.Effect<Prompt.Prompt, AiError.AiError>,
): Service => ({
  maybeCompact: (input) =>
    Effect.suspend(() => {
      if (!truncationDue(input)) return Effect.succeed(Option.none<Result>())
      return cut(Prompt.concat(input.history, input.prompt)).pipe(
        Effect.map((prompt) => Option.some<Result>(microcompactResult({ history: Prompt.empty, prompt }))),
        Effect.mapError((error) => CompactionError.make({ message: String(error), cause: error })),
        withCompactionLifecycle(input, input.usage),
      )
    }),
})

/** @experimental Exact truncate-only compaction. The layer declares the `Tokenizer` requirement. */
export const layerTruncate = (maxTokens: number): Layer.Layer<Compaction, never, Tokenizer.Tokenizer> =>
  Layer.effect(
    Compaction,
    Effect.map(Tokenizer.Tokenizer, (tokenizer) =>
      Compaction.of(truncateService(maxTokens, (prompt) => tokenizer.truncate(prompt, maxTokens))),
    ),
  )

/** @experimental Approximate truncate-only compaction over the prompt token estimator; no `Tokenizer` required. */
export const layerTruncateEstimated = (maxTokens: number): Layer.Layer<Compaction> =>
  Layer.succeed(
    Compaction,
    Compaction.of(
      truncateService(maxTokens, (prompt) => {
        let kept = prompt.content
        while (kept.length > 1 && estimatePromptTokens(Prompt.fromMessages(kept)) > maxTokens) {
          kept = kept.slice(1)
        }
        return Effect.succeed(Prompt.fromMessages(kept))
      }),
    ),
  )
