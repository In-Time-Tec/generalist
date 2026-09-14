import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { LiveProvider, type Capabilities, type Delivery, type Event, type TurnAssignment } from "../../live/index.js"
import { CurrentInvocation, forbidRetry, mark } from "../../core/model/completed-response.js"

/** Runtime binding options for one fresh provider connection per durable model operation. @experimental */
export interface Options {
  readonly capabilities: Capabilities
  readonly delivery?: Delivery
  /** Observe transient provider events. These events are not durable model output. */
  readonly onEvent?: (event: Event) => Effect.Effect<void>
}

const unknownOutcome = () =>
  forbidRetry(
    AiError.make({
      module: "generalist/runtime/live",
      method: "generateText",
      reason: AiError.UnknownError.make({ description: "Live turn outcome is unknown" }),
    }),
  )

const sameAssignment = (left: TurnAssignment, right: TurnAssignment): boolean =>
  left.turnId === right.turnId && left.assignmentId === right.assignmentId

/**
 * Adapt a scoped Live provider to the existing Runtime model-operation boundary.
 * Only `TurnCompleted.response` becomes semantic Agent output.
 * @experimental
 */
export const layer = (options: Options): Layer.Layer<LanguageModel.LanguageModel, never, LiveProvider> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    Effect.gen(function* () {
      const provider = yield* LiveProvider
      const run = (prompt: import("effect/unstable/ai").Prompt.Prompt) =>
        Effect.scoped(
          Effect.gen(function* () {
            const invocation = yield* CurrentInvocation
            if (invocation === undefined) return yield* unknownOutcome()
            const assignment: TurnAssignment = {
              turnId: invocation.turnId,
              assignmentId: invocation.assignmentId,
            }
            const connection = yield* provider
              .connect({
                capabilities: options.capabilities,
                delivery: options.delivery ?? { _tag: "Backpressure", capacity: 64 },
              })
              .pipe(Effect.mapError(unknownOutcome))
            const completed = connection.events.pipe(
              Stream.tap((event) => options.onEvent?.(event) ?? Effect.void),
              Stream.mapEffect((event) => {
                if (event._tag === "Closed") return Effect.fail(unknownOutcome())
                if (!sameAssignment(event.assignment, assignment)) return Effect.fail(unknownOutcome())
                if (event._tag === "TurnInterrupted") return Effect.fail(unknownOutcome())
                return Effect.succeed(event._tag === "TurnCompleted" ? Option.some(event.response) : Option.none())
              }),
              Stream.flatMap(
                Option.match({
                  onNone: () => Stream.empty,
                  onSome: Stream.make,
                }),
              ),
              Stream.runHead,
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.fail(unknownOutcome()),
                  onSome: Effect.succeed,
                }),
              ),
              Effect.mapError(unknownOutcome),
            )
            const completion = yield* Effect.forkScoped(completed)
            yield* connection
              .commitInput({
                assignment,
                context: prompt,
                toolkit: invocation.toolkit,
              })
              .pipe(Effect.mapError(unknownOutcome))
            const response = yield* Fiber.join(completion)
            return yield* Effect.forEach(response, (part) =>
              Schema.encodeUnknownEffect(Response.Part(invocation.toolkit))(part).pipe(Effect.mapError(unknownOutcome)),
            )
          }),
        )
      const model = yield* LanguageModel.make({
        generateText: (request) => run(request.prompt),
        streamText: (request) =>
          Stream.fromEffect(run(request.prompt)).pipe(
            Stream.flatMap((content) =>
              Stream.fromIterable(
                content.flatMap((part, index): ReadonlyArray<Response.StreamPartEncoded> => {
                  if (part.type === "text") {
                    const id = `completed:text:${index}`
                    return [
                      { type: "text-start", id },
                      { type: "text-delta", id, delta: part.text, metadata: part.metadata },
                      { type: "text-end", id },
                    ]
                  }
                  if (part.type === "reasoning") {
                    const id = `completed:reasoning:${index}`
                    return [
                      { type: "reasoning-start", id },
                      { type: "reasoning-delta", id, delta: part.text, metadata: part.metadata },
                      { type: "reasoning-end", id },
                    ]
                  }
                  return [part]
                }),
              ),
            ),
          ),
      })
      return mark(model)
    }),
  )
