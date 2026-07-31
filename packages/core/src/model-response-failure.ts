import { Effect, Function, Stream } from "effect"
import { AiError, Response } from "effect/unstable/ai"

/** @experimental */
export type Method = "generateText" | "generateObject" | "streamText"

/** @experimental */
export interface FailureInput {
  readonly error: unknown
  readonly method: Method
}

/** @experimental */
export type FailureResolver = (input: FailureInput) => AiError.AiError

interface ModelResponse {
  readonly content: ReadonlyArray<Response.AnyPart>
}

const bounded = (value: string): string => value.slice(0, 2_048)

const failureDescription = (error: unknown): string => {
  if (typeof error === "string") return bounded(error)
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return "Language model returned an unknown error part"
  }
  const record = error as Record<string, unknown>
  const evidence = ["message", "description", "code", "type"]
    .map((field) => record[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
  return evidence.length === 0 ? "Language model returned an unknown error part" : bounded(evidence.join(" "))
}

/** @experimental */
export const defaultResolveFailure: FailureResolver = ({ error, method }) =>
  AiError.isAiError(error)
    ? error
    : AiError.make({
        module: "LanguageModel",
        method,
        reason: AiError.UnknownError.make({ description: failureDescription(error) }),
      })

/** @experimental */
export const promoteResponseFailure: {
  (
    method: Exclude<Method, "streamText">,
    resolve: FailureResolver,
  ): <A extends ModelResponse>(response: A) => Effect.Effect<A, AiError.AiError>
  <A extends ModelResponse>(
    response: A,
    method: Exclude<Method, "streamText">,
    resolve: FailureResolver,
  ): Effect.Effect<A, AiError.AiError>
} = Function.dual(
  3,
  <A extends ModelResponse>(
    response: A,
    method: Exclude<Method, "streamText">,
    resolve: FailureResolver,
  ): Effect.Effect<A, AiError.AiError> => {
    const failure = response.content.find((part) => part.type === "error")
    return failure?.type === "error" ? Effect.fail(resolve({ error: failure.error, method })) : Effect.succeed(response)
  },
)

/** @experimental */
export const promoteStreamFailures: {
  (
    resolve: FailureResolver,
  ): <A extends Response.AnyPart, E, R>(stream: Stream.Stream<A, E, R>) => Stream.Stream<A, E | AiError.AiError, R>
  <A extends Response.AnyPart, E, R>(
    stream: Stream.Stream<A, E, R>,
    resolve: FailureResolver,
  ): Stream.Stream<A, E | AiError.AiError, R>
} = Function.dual(
  2,
  <A extends Response.AnyPart, E, R>(
    stream: Stream.Stream<A, E, R>,
    resolve: FailureResolver,
  ): Stream.Stream<A, E | AiError.AiError, R> =>
    stream.pipe(
      Stream.mapEffect((part) =>
        part.type === "error"
          ? Effect.fail(resolve({ error: part.error, method: "streamText" }))
          : Effect.succeed(part),
      ),
    ),
)
