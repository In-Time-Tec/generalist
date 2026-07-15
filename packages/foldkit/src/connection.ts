import { Cause, Context, Effect, Layer, Option, Ref, Result, Schema, Scope, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { Client, Errors, Wire } from "@batonfx/transport"

/** @experimental */
export const ConnectionOpened: CallableTaggedStruct<"ConnectionOpened", {}> = m("ConnectionOpened")

/** @experimental */
export const ConnectionLost: CallableTaggedStruct<"ConnectionLost", {}> = m("ConnectionLost")

/** @experimental */
export const ConnectionFailed: CallableTaggedStruct<
  "ConnectionFailed",
  {
    operation: Schema.Literal<"connect">
    error: typeof Errors.TransportError
    reason: typeof Schema.String
  }
> = m("ConnectionFailed", {
  operation: Schema.Literal("connect"),
  error: Errors.TransportError,
  reason: Schema.String,
})

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
export const AgentCommandError = Schema.Union([Errors.TransportError, SendFailed])

/** @experimental */
export type AgentCommandError = typeof AgentCommandError.Type

/** @experimental */
export const CommandOperation = Schema.Literals(["send", "cancel", "resolveApproval"])

/** @experimental */
export type CommandOperation = typeof CommandOperation.Type

/** @experimental */
export interface SessionConnection {
  readonly sessionId: string
  readonly frames: Stream.Stream<Incoming, never>
  readonly send: (
    frame: Exclude<Wire.ClientFrameType, { readonly _tag: "Attach" }>,
  ) => Effect.Effect<void, AgentCommandError>
}

/** @experimental */
export interface Interface {
  readonly session: (options: {
    readonly sessionId: string
    readonly afterSeq?: number
  }) => Effect.Effect<SessionConnection, never, Scope.Scope>
  readonly frames: (options: {
    readonly sessionId: string
    readonly afterSeq?: number
  }) => Stream.Stream<Incoming, never>
  readonly send: (frame: Wire.ClientFrameType) => Effect.Effect<void, AgentCommandError>
}

/** @experimental */
export class AgentConnection extends Context.Service<AgentConnection, Interface>()(
  "@batonfx/foldkit/connection/AgentConnection",
) {}

interface ActiveConnection {
  readonly sessionId: string
  readonly connection: Client.Connection
}

type LegacyInterface = Omit<Interface, "session">

const sendThrough = (
  connection: Client.Connection,
  frame: Wire.ClientFrameType,
): Effect.Effect<void, AgentCommandError> => connection.send(frame)

const unexpectedCause = <E>(cause: Cause.Cause<E>): Option.Option<Cause.Cause<never>> => {
  const reasons: Array<Cause.Reason<never>> = []
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) reasons.push(reason)
  }
  return reasons.length === 0 ? Option.none() : Option.some(Cause.fromReasons(reasons))
}

const statusIncoming = (status: Client.ConnectionStatus): Option.Option<Incoming> => {
  switch (status._tag) {
    case "Connected":
      return Option.some(ConnectionOpened())
    case "Disconnected":
    case "Retrying":
      return Option.some(ConnectionLost())
    case "Connecting":
      return Option.none()
  }
}

/** @experimental */
export const testLayer = (implementation: Interface | LegacyInterface): Layer.Layer<AgentConnection> => {
  const session =
    "session" in implementation
      ? implementation.session
      : (options: { readonly sessionId: string; readonly afterSeq?: number }) =>
          Effect.succeed<SessionConnection>({
            sessionId: options.sessionId,
            frames: implementation.frames(options),
            send: (frame) =>
              frame.sessionId === options.sessionId
                ? implementation.send(frame)
                : Effect.fail(
                    SendFailed.make({
                      reason: `Session ${options.sessionId} cannot send a command for ${frame.sessionId}`,
                    }),
                  ),
          })
  return Layer.succeed(AgentConnection, AgentConnection.of({ ...implementation, session }))
}

/** @experimental */
export const layerWebSocket = (options: {
  readonly url: string
}): Layer.Layer<AgentConnection, never, Socket.WebSocketConstructor> =>
  Layer.effect(
    AgentConnection,
    Effect.gen(function* () {
      const client = yield* Client.AgentClient
      const active = yield* Ref.make<ReadonlyMap<string, ActiveConnection>>(new Map())

      const clearActive = (owner: ActiveConnection) =>
        Ref.update(active, (current) => {
          if (current.get(owner.sessionId) !== owner) return current
          const updated = new Map(current)
          updated.delete(owner.sessionId)
          return updated
        })

      const session = ({ sessionId }: { readonly sessionId: string; readonly afterSeq?: number }) =>
        Effect.gen(function* () {
          const connection = yield* client.connect({ url: options.url, sessionId })
          const owner: ActiveConnection = { sessionId, connection }
          yield* Effect.acquireRelease(
            Ref.update(active, (current) => {
              const updated = new Map(current)
              updated.set(sessionId, owner)
              return updated
            }),
            () => clearActive(owner),
          )
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
              Option.match(unexpectedCause(cause), {
                onNone: () =>
                  Result.match(Cause.findError(cause), {
                    onFailure: Stream.failCause,
                    onSuccess: (error) =>
                      Stream.succeed(ConnectionFailed({ operation: "connect", error, reason: error.message })),
                  }),
                onSome: Stream.failCause,
              }),
            ),
          )
          return {
            sessionId,
            frames: statuses.pipe(Stream.merge(frames)),
            send: (frame: Exclude<Wire.ClientFrameType, { readonly _tag: "Attach" }>) =>
              frame.sessionId === sessionId
                ? sendThrough(connection, frame)
                : Effect.fail(
                    SendFailed.make({ reason: `Session ${sessionId} cannot send a command for ${frame.sessionId}` }),
                  ),
          }
        })

      return AgentConnection.of({
        session,
        frames: (sessionOptions) => Stream.unwrap(session(sessionOptions).pipe(Effect.map((owned) => owned.frames))),
        send: (frame) =>
          Ref.get(active).pipe(
            Effect.flatMap((current) => {
              const owner = current.get(frame.sessionId)
              return owner === undefined
                ? Effect.fail(SendFailed.make({ reason: `No active agent connection for session ${frame.sessionId}` }))
                : sendThrough(owner.connection, frame)
            }),
          ),
      })
    }),
  ).pipe(Layer.provide(Client.layerWebSocket))
