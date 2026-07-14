import { Cause, Context, Effect, Layer, Option, Ref, Result, Schema, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { Client, Wire } from "@batonfx/transport"

/** @experimental */
export const ConnectionOpened: CallableTaggedStruct<"ConnectionOpened", {}> = m("ConnectionOpened")

/** @experimental */
export const ConnectionLost: CallableTaggedStruct<"ConnectionLost", {}> = m("ConnectionLost")

/** @experimental */
export const ConnectionFailed: CallableTaggedStruct<"ConnectionFailed", { reason: typeof Schema.String }> = m(
  "ConnectionFailed",
  { reason: Schema.String },
)

/** @experimental */
export type Incoming =
  | Wire.LooseServerFrameType
  | typeof ConnectionOpened.Type
  | typeof ConnectionLost.Type
  | typeof ConnectionFailed.Type

/** @experimental */
export const Incoming: Schema.Schema<Incoming> = Schema.Union([
  Wire.LooseServerFrame,
  ConnectionOpened,
  ConnectionLost,
  ConnectionFailed,
])

/** @experimental */
export class SendFailed extends Schema.TaggedErrorClass<SendFailed>()("@batonfx/foldkit/SendFailed", {
  reason: Schema.String,
}) {}

/** @experimental */
export interface Interface {
  readonly frames: (options: {
    readonly sessionId: string
    readonly afterSeq?: number
  }) => Stream.Stream<Incoming, never>
  readonly send: (frame: Wire.ClientFrameType) => Effect.Effect<void, SendFailed>
}

/** @experimental */
export class AgentConnection extends Context.Service<AgentConnection, Interface>()(
  "@batonfx/foldkit/connection/AgentConnection",
) {}

interface ActiveConnection {
  readonly sessionId: string
  readonly connection: Client.Connection
}

const reasonFrom = (error: unknown): string => {
  if (Schema.is(SendFailed)(error)) return error.reason
  if (error instanceof Error) return error.message
  return String(error)
}

const statusIncoming = (status: Client.ConnectionStatus): Option.Option<Incoming> => {
  switch (status._tag) {
    case "Open":
      return Option.some(ConnectionOpened())
    case "Reconnecting":
    case "Closed":
      return Option.some(ConnectionLost())
    case "Connecting":
      return Option.none()
  }
}

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<AgentConnection> =>
  Layer.succeed(AgentConnection, AgentConnection.of(implementation))

/** @experimental */
export const layerWebSocket = (options: {
  readonly url: string
}): Layer.Layer<AgentConnection, never, Socket.WebSocketConstructor> =>
  Layer.effect(
    AgentConnection,
    Effect.gen(function* () {
      const client = yield* Client.AgentClient
      const active = yield* Ref.make<Option.Option<ActiveConnection>>(Option.none())

      const clearActive = (connection: Client.Connection) =>
        Ref.update(active, (current) =>
          Option.isSome(current) && current.value.connection === connection ? Option.none() : current,
        )

      return AgentConnection.of({
        frames: ({ sessionId }) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const connection = yield* client.connect({ url: options.url, sessionId })
              yield* Ref.set(active, Option.some({ sessionId, connection }))
              yield* Effect.addFinalizer(() => clearActive(connection))
              const statuses = connection.status.pipe(
                Stream.filterMap((status) =>
                  Option.match(statusIncoming(status), {
                    onNone: () => Result.fail(undefined),
                    onSome: Result.succeed,
                  }),
                ),
              )
              const frames = connection.frames.pipe(
                Stream.map((frame): Incoming => frame),
                Stream.catchCause((cause) =>
                  Stream.succeed(ConnectionFailed({ reason: reasonFrom(Cause.squash(cause)) })),
                ),
              )
              return statuses.pipe(Stream.merge(frames))
            }),
          ),
        send: (frame) =>
          Ref.get(active).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(SendFailed.make({ reason: "No active agent connection" })),
                onSome: ({ connection }) =>
                  connection
                    .send(frame)
                    .pipe(Effect.mapError((error) => SendFailed.make({ reason: reasonFrom(error) }))),
              }),
            ),
          ),
      })
    }),
  ).pipe(Layer.provide(Client.layerWebSocket))
