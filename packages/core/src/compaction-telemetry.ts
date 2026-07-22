import { Clock, Effect, Exit, Function, Option } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { type Request, type Result, type Usage } from "./compaction.js"
import {
  type CompactionKind,
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  type SummaryCallCell,
} from "./model-telemetry.js"

const resultKind = (result: Option.Option<Result>): CompactionKind =>
  Option.isNone(result) ? "unchanged" : result.value._tag === "Summarize" ? "summarize" : "microcompact"

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
      yield* instrumentation.emit({
        _tag: "CompactionStarted",
        turn,
        compactionId,
        trigger: input.overflow ? "overflow" : "threshold",
        startedAt,
        contextTokensBefore: usage.contextTokens,
        entriesBefore: input.history.content.length + input.prompt.content.length,
      })
      const summaryCell: SummaryCallCell = { current: undefined }
      return yield* work.pipe(
        Effect.provideService(CurrentCompactionId, compactionId),
        Effect.provideService(CurrentPurpose, "compaction-summary"),
        Effect.provideService(CurrentSummaryCall, summaryCell),
        Effect.onExit((exit) =>
          Effect.flatMap(Clock.currentTimeMillis, (at) =>
            Exit.isSuccess(exit)
              ? instrumentation.emit({
                  _tag: "CompactionCompleted",
                  turn,
                  compactionId,
                  kind: resultKind(exit.value),
                  completedAt: at,
                  ...(summaryCell.current === undefined ? {} : { summaryModelCallId: summaryCell.current }),
                })
              : instrumentation.emit({ _tag: "CompactionFailed", turn, compactionId, failedAt: at }),
          ),
        ),
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
