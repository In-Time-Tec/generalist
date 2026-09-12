import { Cause, Clock, Effect, Option, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import { ToolContext } from "../tools/tool-context.js"
import { type InvalidToolCallParameters, isInvalidToolCallParameters } from "./tool-call-validation.js"
import { invokeStreamText, type StreamTextOptions } from "./service.js"
import type { EventPayload, FailureCategory } from "./telemetry/events.js"

export type StreamTextPart = Response.StreamPart<Record<string, Tool.Any>>

export interface Context {
  readonly clock: Clock.Clock
  readonly modelCallId: string
  readonly turn: number
  readonly correctionLimit: number
  readonly attempt: () => number
  readonly categorize: <E>(error: E) => FailureCategory
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly settleFailure: Effect.Effect<void>
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
  context.settleFailure.pipe(
    Effect.andThen(context.clock.currentTimeMillis),
    Effect.flatMap((at) =>
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
    ),
  )

/**
 * Whether a released part is content a correction retry would duplicate.
 * `text-start`/`text-end` and `reasoning-start`/`reasoning-end` are lifecycle
 * markers without content, and metadata plus `tool-params-*` staging never
 * becomes transcript content on their own, so they do not count as escaped
 * output. Non-empty text or reasoning and any escaped tool call remain strict
 * correction barriers.
 */
const blocksCorrection = (part: StreamTextPart): boolean => {
  switch (part.type) {
    case "response-metadata":
    case "text-start":
    case "text-end":
    case "reasoning-start":
    case "reasoning-end":
    case "tool-params-start":
    case "tool-params-delta":
    case "tool-params-end":
      return false
    case "text-delta":
      return part.delta.length > 0
    case "reasoning-delta":
      return part.delta.length > 0
    default:
      return true
  }
}

const correctLoop = (
  context: Context,
  model: LanguageModel.Service,
  options: StreamTextOptions,
  corrections: number,
): Stream.Stream<StreamTextPart, AiError.AiError | InvalidToolCallParameters, ToolContext | Tool.Handler<string>> =>
  Stream.suspend(() => {
    let consumed = false
    return invokeStreamText(model, options).pipe(
      Stream.flatMap((part): Stream.Stream<StreamTextPart, AiError.AiError | InvalidToolCallParameters> => {
        if (
          !consumed &&
          corrections < context.correctionLimit &&
          part.type === "error" &&
          isInvalidToolCallParameters(part.error)
        ) {
          // A released lifecycle marker lets the resilience wrapper turn the
          // discarded attempt's validation failure into an in-band error
          // part. Surface it as the attempt failure so correction can retry.
          return Stream.fail(part.error)
        }
        if (blocksCorrection(part)) consumed = true
        return Stream.make(part)
      }),
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
}): Stream.Stream<StreamTextPart, AiError.AiError | InvalidToolCallParameters, ToolContext | Tool.Handler<string>> =>
  correctLoop(input.context, input.model, input.options, 0)
