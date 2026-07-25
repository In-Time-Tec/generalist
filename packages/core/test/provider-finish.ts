import { Effect, Stream } from "effect"
import { Response } from "effect/unstable/ai"

const emptyUsage = (): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  })

const finishEncoded = (): Response.FinishPartEncoded => ({
  type: "finish",
  reason: "stop",
  usage: emptyUsage(),
  response: undefined,
})

/**
 * Terminate a scripted non-streaming provider response the way a healthy
 * provider does. Content that already carries its own `finish` part is left
 * untouched.
 */
export const withProviderFinishContent = <E, R>(
  content: Effect.Effect<Array<Response.PartEncoded>, E, R>,
): Effect.Effect<Array<Response.PartEncoded>, E, R> =>
  Effect.map(content, (parts) => (parts.some((part) => part.type === "finish") ? parts : [...parts, finishEncoded()]))

/**
 * Terminate a scripted provider part stream the way a healthy provider does.
 * A script that already emits its own `finish` part is left untouched, so tests
 * that assert finish reasons or usage keep owning them.
 */
export const withProviderFinish = <E, R>(
  stream: Stream.Stream<Response.StreamPartEncoded, E, R>,
): Stream.Stream<Response.StreamPartEncoded, E, R> =>
  Stream.suspend(() => {
    let finished = false
    return stream.pipe(
      Stream.tap((part) =>
        Effect.sync(() => {
          if (part.type === "finish") finished = true
        }),
      ),
      Stream.concat(
        Stream.suspend(
          (): Stream.Stream<Response.StreamPartEncoded> => (finished ? Stream.empty : Stream.make(finishEncoded())),
        ),
      ),
    )
  })
