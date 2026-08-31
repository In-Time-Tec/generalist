import { Cause, Context, Effect, Layer, Option, Ref, Result, Schema, Scope, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import {
  layerWebSocket as runClientLayerWebSocket,
  RunClient,
  type Connection as RunConnection,
  type ConnectionStatus,
} from "../../transport/run-client.js"
import { TransportError } from "../../transport/errors.js"
import { ObserverRunEvent } from "../../transport/wire.js"
import type { AgentCommand } from "./connection-command.js"

/** @experimental */
export const ConnectionOpened: CallableTaggedStruct<"ConnectionOpened", Record<never, never>> = m("ConnectionOpened")
/** @experimental */
export const ConnectionLost: CallableTaggedStruct<"ConnectionLost", Record<never, never>> = m("ConnectionLost")
/** @experimental */
export const ConnectionFailed: CallableTaggedStruct<
  "ConnectionFailed",
  { operation: Schema.Literal<"connect">; error: typeof TransportError; reason: typeof Schema.String }
> = m("ConnectionFailed", {
  operation: Schema.Literal("connect"),
  error: TransportError,
  reason: Schema.String,
})

/** @experimental */
export type Incoming =
  | ObserverRunEvent
  | typeof ConnectionOpened.Type
  | typeof ConnectionLost.Type
  | typeof ConnectionFailed.Type
/** @experimental */
export const Incoming: Schema.Schema<Incoming> = Schema.Union([
  ObserverRunEvent,
  ConnectionOpened,
  ConnectionLost,
  ConnectionFailed,
])

/** @experimental */
export class SendFailed extends Schema.TaggedError<SendFailed>()("generalist/foldkit/SendFailed", {
  reason: Schema.String,
}) {}
/** @experimental */
export const AgentCommandError = Schema.Union([TransportError, SendFailed])
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
  readonly send: (command: AgentCommand) => Effect.Effect<void, AgentCommandError>
}
/** @experimental */
export interface Service {
  readonly session: (options: {
    readonly sessionId: string
    readonly afterSeq?: number
  }) => Effect.Effect<SessionConnection, never, Scope.Scope>
  readonly send: (command: AgentCommand) => Effect.Effect<void, AgentCommandError>
}
/** @experimental */
export class Connection extends Context.Service<Connection, Service>()("generalist/foldkit/chat/connection") {}

interface ActiveConnection {
  readonly runId: string
  readonly connection: RunConnection
}

const unexpectedCause = <E>(cause: Cause.Cause<E>): Option.Option<Cause.Cause<never>> => {
  const reasons: Array<Cause.Reason<never>> = []
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) reasons.push(reason)
  }
  return reasons.length === 0 ? Option.none() : Option.some(Cause.fromReasons(reasons))
}

const statusIncoming = (status: ConnectionStatus): Option.Option<Incoming> => {
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
export const layerTest = (implementation: Connection["Service"]): Layer.Layer<Connection> =>
  Layer.succeed(Connection, Connection.of(implementation))

/** @experimental */
export const layerWebSocket = (options: {
  readonly url: string
}): Layer.Layer<Connection, never, Socket.WebSocketConstructor> =>
  Layer.effect(
    Connection,
    Effect.gen(function* () {
      const client = yield* RunClient
      const active = yield* Ref.make<ReadonlyMap<string, ActiveConnection>>(new Map())

      const sendThrough = (owner: ActiveConnection, command: AgentCommand): Effect.Effect<void, AgentCommandError> =>
        command._tag === "Cancel"
          ? owner.connection.cancel()
          : Effect.fail(SendFailed.make({ reason: `${command._tag} requires a Runtime host command adapter` }))

      const session = ({ sessionId, afterSeq }: { readonly sessionId: string; readonly afterSeq?: number }) =>
        Effect.gen(function* () {
          const connection = yield* client
            .connect(
              afterSeq === undefined
                ? { url: options.url, runId: sessionId }
                : { url: options.url, runId: sessionId, cursor: afterSeq },
            )
            .pipe(Effect.orDie)
          const owner = { runId: sessionId, connection }
          yield* Effect.acquireRelease(
            Ref.update(active, (current) => new Map(current).set(sessionId, owner)),
            () =>
              Ref.update(active, (current) => {
                if (current.get(sessionId) !== owner) return current
                const updated = new Map(current)
                updated.delete(sessionId)
                return updated
              }),
          )
          const statuses = connection.status.pipe(
            Stream.filterMap((status) =>
              Option.match(statusIncoming(status), { onNone: () => Result.fail(undefined), onSome: Result.succeed }),
            ),
          )
          const events = connection.events.pipe(
            Stream.map((event): Incoming => event),
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
            frames: statuses.pipe(Stream.merge(events)),
            send: (command: AgentCommand) =>
              command.sessionId === sessionId
                ? sendThrough(owner, command)
                : Effect.fail(SendFailed.make({ reason: `Run ${sessionId} cannot command Run ${command.sessionId}` })),
          }
        })

      return Connection.of({
        session,
        send: (command) =>
          Ref.get(active).pipe(
            Effect.flatMap((current) => {
              const owner = current.get(command.sessionId)
              return owner === undefined
                ? Effect.fail(SendFailed.make({ reason: `No active Run connection for ${command.sessionId}` }))
                : sendThrough(owner, command)
            }),
          ),
      })
    }),
  ).pipe(Layer.provide(runClientLayerWebSocket))
