import { Clock, Effect, Exit, Function, Option } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { Request, Result, Usage } from "./compaction.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  type SummaryCallCell,
} from "../model/telemetry/events.js"

/** @experimental Emit the compaction lifecycle around one pass that decided to do work. */
export const withCompactionLifecycle: {
  (
    input: Request,
    usage: Usage,
  ): <E, R>(work: Effect.Effect<Option.Option<Result>, E, R>) => Effect.Effect<Option.Option<Result>, E, R>
  <E, R>(
    work: Effect.Effect<Option.Option<Result>, E, R>,
    input: Request,
    usage: Usage,
  ): Effect.Effect<Option.Option<Result>, E, R>
} = Function.dual(
  3,
  <E, R>(
    work: Effect.Effect<Option.Option<Result>, E, R>,
    input: Request,
    usage: Usage,
  ): Effect.Effect<Option.Option<Result>, E, R> =>
    Effect.gen(function* () {
      const instrumentation = yield* CurrentInstrumentation
      if (instrumentation === undefined) return yield* work
      const turn = input.turn
      const compactionId = input.compactionId
      const startedAt = yield* Clock.currentTimeMillis
      const started = {
        _tag: "CompactionStarted" as const,
        turn,
        compactionId,
        trigger: input.overflow ? ("overflow" as const) : ("threshold" as const),
        startedAt,
        contextTokensBefore: usage.contextTokens,
        entriesBefore: input.history.content.length + input.prompt.content.length,
      }
      const summaryCell: SummaryCallCell = { current: undefined }
      yield* instrumentation.emit(started)
      return yield* work.pipe(
        Effect.provideService(CurrentCompactionId, compactionId),
        Effect.provideService(CurrentPurpose, "compaction-summary"),
        Effect.provideService(CurrentSummaryCall, summaryCell),
        Effect.onExit((exit) => {
          if (!Exit.isSuccess(exit)) {
            return Effect.flatMap(Clock.currentTimeMillis, (failedAt) =>
              instrumentation.emit({ _tag: "CompactionFailed", turn, compactionId, failedAt }),
            )
          }
          if (Option.isSome(exit.value)) return Effect.void
          return Effect.flatMap(Clock.currentTimeMillis, (skippedAt) =>
            instrumentation.emit({ _tag: "CompactionSkipped", turn, compactionId, skippedAt }),
          )
        }),
      )
    }),
)

/** @experimental The active model wrapped with the enclosing run's telemetry, when present. */
export const summaryLanguageModel: Effect.Effect<LanguageModel.Service, never, LanguageModel.LanguageModel> =
  Effect.gen(function* () {
    const instrumentation = yield* CurrentInstrumentation
    const model = yield* LanguageModel.LanguageModel
    return instrumentation === undefined ? model : instrumentation.wrap(model)
  })
