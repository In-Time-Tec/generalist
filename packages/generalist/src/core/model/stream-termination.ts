import { Duration, Effect, Function, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"

/**
 * @experimental What already escaped downstream when a model part stream ended
 * without its terminal `finish` part. `Nothing` means no part a consumer would
 * render or replay reached it, so the attempt can be retried without
 * duplicating transcript content.
 */
export const EmittedOutput = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Nothing") }),
  Schema.Struct({ _tag: Schema.tag("DisplayOnly"), characters: Schema.Finite }),
  Schema.Struct({
    _tag: Schema.tag("OpenToolCall"),
    toolCallId: Schema.String,
    toolName: Schema.String,
    characters: Schema.Finite,
  }),
])

/** @experimental */
export type EmittedOutput = typeof EmittedOutput.Type

const terminationFields = {
  turn: Schema.Finite,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  requestId: Schema.optionalKey(Schema.String),
  lastPart: Schema.optionalKey(Schema.String),
  emitted: EmittedOutput,
}

/**
 * @experimental A provider part stream reached a clean end without its terminal
 * `finish` part, so the attempt produced no finish reason and no usage.
 */
export class Truncated extends Schema.TaggedError<Truncated>()(
  "generalist/core/ModelStreamTruncated",
  terminationFields,
) {}

/** @experimental A provider part stream exceeded its configured idle deadline. */
export class Timeout extends Schema.TaggedError<Timeout>()("generalist/core/ModelStreamTimeout", {
  ...terminationFields,
  idleMillis: Schema.Finite,
}) {}

/** @experimental A model part stream did not reach a provider-reported terminal event. */
export type TerminationFailure = Truncated | Timeout

const isTruncated = Schema.is(Truncated)
const isTimeoutFailure = Schema.is(Timeout)

/** @experimental Whether a failure means the stream did not reach its terminal event. */
export const isTerminationFailure = (cause: unknown): cause is TerminationFailure =>
  isTruncated(cause) || isTimeoutFailure(cause)

/** @experimental Whether a model stream exceeded its configured idle deadline. */
export const isTimeout = (cause: unknown): cause is Timeout => isTimeoutFailure(cause)

interface Observation {
  lastPart: string | undefined
  requestId: string | undefined
  finished: boolean
  characters: number
  openToolCalls: Map<string, { readonly name: string; characters: number }>
}

const makeObservation = (): Observation => ({
  lastPart: undefined,
  requestId: undefined,
  finished: false,
  characters: 0,
  openToolCalls: new Map(),
})

const observe = (observation: Observation, part: Response.AnyPart): void => {
  observation.lastPart = part.type
  switch (part.type) {
    case "response-metadata":
      observation.requestId = part.id
      return
    case "finish":
      observation.finished = true
      return
    case "text":
    case "reasoning":
      observation.characters += part.text.length
      return
    case "text-delta":
    case "reasoning-delta":
      observation.characters += part.delta.length
      return
    case "tool-params-start":
      observation.openToolCalls.set(part.id, { name: part.name, characters: 0 })
      return
    case "tool-params-delta": {
      const open = observation.openToolCalls.get(part.id)
      if (open !== undefined) open.characters += part.delta.length
      return
    }
    case "tool-call":
      observation.openToolCalls.delete(part.id)
      observation.characters += JSON.stringify(part.params ?? null).length
      break
    default:
      break
  }
}

const emittedOutput = (observation: Observation): EmittedOutput => {
  const [openId, open] = observation.openToolCalls.entries().next().value ?? []
  if (openId !== undefined && open !== undefined) {
    return { _tag: "OpenToolCall", toolCallId: openId, toolName: open.name, characters: open.characters }
  }
  return observation.characters === 0
    ? { _tag: "Nothing" }
    : { _tag: "DisplayOnly", characters: observation.characters }
}

/** @experimental Provenance stamped onto a termination failure. */
export interface Origin {
  readonly turn: number
  readonly provider: string | undefined
  readonly model: string | undefined
}

interface TerminationFields {
  turn: number
  provider?: string
  model?: string
  requestId?: string
  lastPart?: string
  emitted: EmittedOutput
}

const originFields = (origin: Origin, observation: Observation) => {
  const fields: TerminationFields = {
    turn: origin.turn,
    emitted: emittedOutput(observation),
  }
  if (origin.provider !== undefined) fields.provider = origin.provider
  if (origin.model !== undefined) fields.model = origin.model
  if (observation.requestId !== undefined) fields.requestId = observation.requestId
  if (observation.lastPart !== undefined) fields.lastPart = observation.lastPart
  return fields
}

/**
 * @experimental Fail a provider part stream that ended without its terminal
 * `finish` part. A clean end with no `finish` fails with `Truncated`.
 * When `idleTimeout` is present, a pull that exceeds it fails with
 * `Timeout`; absence applies no idle deadline.
 */
export const requireTerminal: {
  <A>(
    options: Origin & { readonly toPart: (value: A) => Response.AnyPart; readonly idleTimeout?: Duration.Input },
  ): <E, R>(self: Stream.Stream<A, E, R>) => Stream.Stream<A, E | TerminationFailure, R>
  <A, E, R>(
    self: Stream.Stream<A, E, R>,
    options: Origin & { readonly toPart: (value: A) => Response.AnyPart; readonly idleTimeout?: Duration.Input },
  ): Stream.Stream<A, E | TerminationFailure, R>
} = Function.dual(
  2,
  <A, E, R>(
    self: Stream.Stream<A, E, R>,
    options: Origin & {
      readonly toPart: (value: A) => Response.AnyPart
      readonly idleTimeout?: Duration.Input
    },
  ): Stream.Stream<A, E | TerminationFailure, R> =>
    Stream.suspend(() => {
      const observation = makeObservation()
      const observed = self.pipe(Stream.tap((value) => Effect.sync(() => observe(observation, options.toPart(value)))))
      const idleInput = options.idleTimeout
      const guarded =
        idleInput === undefined
          ? observed
          : observed.pipe(
              Stream.timeoutOrElse({
                duration: idleInput,
                orElse: () => {
                  const idle = Duration.fromInputUnsafe(idleInput)
                  return Stream.fail(
                    Timeout.make({
                      ...originFields(options, observation),
                      idleMillis: Duration.toMillis(idle),
                    }),
                  )
                },
              }),
            )
      return guarded.pipe(
        Stream.onEnd(
          Effect.suspend(() =>
            observation.finished ? Effect.void : Effect.fail(Truncated.make(originFields(options, observation))),
          ),
        ),
      )
    }),
)
