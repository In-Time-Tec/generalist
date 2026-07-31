import { Cause, Clock, Effect, Option, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
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

export const isInvalidToolCallOutput = (error: unknown): error is AiError.AiError =>
  AiError.isAiError(error) && error.method === "streamText" && error.reason._tag === "InvalidOutputError"

const singleFailure = (cause: Cause.Cause<unknown>): Option.Option<unknown> => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
}

const feedback = (error: AiError.AiError): Prompt.Prompt => {
  const detail = error.reason._tag === "InvalidOutputError" ? error.reason.description.slice(0, 512) : "invalid output"
  return Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [
        Prompt.makePart("text", {
          text: `Your previous response contained an invalid tool call: ${detail}. Re-issue the intended tool calls with arguments that match the supplied tool schemas.`,
        }),
      ],
    }),
  ])
}

const scheduled = (context: Context, error: AiError.AiError): Effect.Effect<void> =>
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
): Stream.Stream<StreamTextPart, AiError.AiError, any> =>
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
          !isInvalidToolCallOutput(failure.value) ||
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
}): Stream.Stream<StreamTextPart, AiError.AiError, any> => correctLoop(input.context, input.model, input.options, 0)
