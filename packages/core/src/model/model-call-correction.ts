import { Cause, Clock, Effect, Option, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import { type InvalidToolCallParameters, isInvalidToolCallParameters } from "./model-tool-call-validation.js"
import type { EventPayload, ModelFailureCategory } from "./model-telemetry.js"

export type StreamTextOptions = LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>
export type StreamTextPart = Response.StreamPart<Record<string, Tool.Any>>

export interface Context {
  readonly modelCallId: string
  readonly turn: number
  readonly correctionLimit: number
  readonly attempt: () => number
  readonly categorize: (error: unknown) => ModelFailureCategory
  readonly emit: (event: EventPayload) => Effect.Effect<void>
}

const singleFailure = (cause: Cause.Cause<unknown>): Option.Option<unknown> => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
}

const feedback = (error: InvalidToolCallParameters): Prompt.Prompt =>
  Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [
        Prompt.makePart("text", {
          text: `Tool "${error.toolName}" was called with arguments that did not match its supplied schema. Re-issue the intended call using the schema.`,
        }),
      ],
    }),
  ])

const scheduled = (context: Context, error: InvalidToolCallParameters): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (at) =>
    context.emit({
      _tag: "ModelRetryScheduled",
      turn: context.turn,
      modelCallId: context.modelCallId,
      attempt: context.attempt(),
      reason: "invalid-tool-call-correction",
      category: context.categorize(error),
      delayMillis: 0,
      at,
    }),
  )

const correctLoop = (
  context: Context,
  model: LanguageModel.Service,
  options: StreamTextOptions,
  corrections: number,
): Stream.Stream<StreamTextPart, AiError.AiError | InvalidToolCallParameters, any> =>
  Stream.suspend(() => {
    let consumed = false
    const invoke = model.streamText as unknown as (
      input: StreamTextOptions,
    ) => Stream.Stream<StreamTextPart, AiError.AiError, any>
    return invoke(options).pipe(
      Stream.tap((part) =>
        Effect.sync(() => {
          if (part.type !== "response-metadata") consumed = true
        }),
      ),
      Stream.catchCause((cause) => {
        if (consumed || Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
        const failure = singleFailure(cause)
        if (
          Option.isNone(failure) ||
          !isInvalidToolCallParameters(failure.value) ||
          corrections >= context.correctionLimit
        ) {
          return Stream.failCause(cause)
        }
        const error = failure.value
        const nextOptions = {
          ...options,
          prompt: Prompt.concat(Prompt.make(options.prompt), feedback(error)),
        }
        return Stream.unwrap(
          scheduled(context, error).pipe(Effect.as(correctLoop(context, model, nextOptions, corrections + 1))),
        )
      }),
    )
  })

export const correct = (input: {
  readonly context: Context
  readonly model: LanguageModel.Service
  readonly options: StreamTextOptions
}): Stream.Stream<StreamTextPart, AiError.AiError | InvalidToolCallParameters, any> =>
  correctLoop(input.context, input.model, input.options, 0)
