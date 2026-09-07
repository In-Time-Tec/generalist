import { Cause, Context, Effect, Layer, Option, Ref, Result, Schedule, Schema, Scope, Stream } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"
import { HostEvent } from "../../../host/event.js"
import {
  client as serverClient,
  type Connection as ServerConnection,
  type ConnectionStatus,
} from "../../../server/client.js"
import { TransportError } from "../../../server/errors.js"
import { HostSessionSnapshot } from "../../../runtime/session/host.js"
import type { AgentCommand } from "./connection-command.js"
import { applyConversationUpdate } from "../../../runtime/session/conversation.js"

/** @experimental */
const DeliveryIdentity = { sessionId: Schema.String, epoch: Schema.Int }
export const ConnectionOpened = m("ConnectionOpened", DeliveryIdentity)
/** @experimental */
export const ConnectionLost = m("ConnectionLost", DeliveryIdentity)
/** @experimental */
export const ConnectionFailed: CallableTaggedStruct<
  "ConnectionFailed",
  typeof DeliveryIdentity & {
    operation: Schema.Literal<"connect">
    error: typeof TransportError
    reason: typeof Schema.String
  }
> = m("ConnectionFailed", {
  ...DeliveryIdentity,
  operation: Schema.Literal("connect"),
  error: TransportError,
  reason: Schema.String,
})

/** A committed snapshot establishes a new connection-local delivery epoch. @experimental */
export const SessionSnapshot = m("SessionSnapshot", { epoch: Schema.Int, snapshot: HostSessionSnapshot })

/** One committed Host event delivered within an established snapshot epoch. @experimental */
export const HostDelivery = m("HostDelivery", { epoch: Schema.Int, event: HostEvent })

/** @experimental */
export type Incoming =
  | typeof SessionSnapshot.Type
  | typeof HostDelivery.Type
  | typeof ConnectionOpened.Type
  | typeof ConnectionLost.Type
  | typeof ConnectionFailed.Type
/** @experimental */
export const Incoming: Schema.Schema<Incoming> = Schema.Union([
  SessionSnapshot,
  HostDelivery,
  ConnectionOpened,
  ConnectionLost,
  ConnectionFailed,
])

/** @experimental */
export class SendFailed extends ActionableTaggedError<SendFailed>()("generalist/foldkit/SendFailed", {
  reason: Schema.String,
  hint: errorHint("Restore the chat connection and resend the command only if its outcome was not accepted."),
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
  readonly session: (options: { readonly sessionId: string }) => Effect.Effect<SessionConnection, never, Scope.Scope>
  readonly send: (command: AgentCommand) => Effect.Effect<void, AgentCommandError>
}
/** @experimental */
export class Connection extends Context.Service<Connection, Service>()("generalist/unstable/foldkit/chat/connection") {}

interface ActiveConnection {
  readonly runId: Ref.Ref<string | undefined>
  readonly connection: Ref.Ref<Option.Option<ServerConnection>>
}

const unexpectedCause = <E>(cause: Cause.Cause<E>): Option.Option<Cause.Cause<never>> => {
  const reasons: Array<Cause.Reason<never>> = []
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) reasons.push(reason)
  }
  return reasons.length === 0 ? Option.none() : Option.some(Cause.fromReasons(reasons))
}

const statusIncoming = (
  status: ConnectionStatus,
  identity: { readonly sessionId: string; readonly epoch: number },
): Option.Option<Incoming> => {
  switch (status._tag) {
    case "Connected":
      return Option.some(ConnectionOpened(identity))
    case "Disconnected":
    case "Retrying":
      return Option.some(ConnectionLost(identity))
    case "Connecting":
      return Option.none()
  }
}

/** @experimental */
export const layerTest = (implementation: Connection["Service"]): Layer.Layer<Connection> =>
  Layer.succeed(Connection, Connection.of(implementation))

/** @experimental */
export const layerWebSocket = (options: {
  readonly baseUrl: string
}): Layer.Layer<Connection, never, HttpClient.HttpClient | Socket.WebSocketConstructor> =>
  Layer.effect(
    Connection,
    Effect.gen(function* () {
      const client = yield* serverClient({ baseUrl: options.baseUrl })
      const webSocketConstructor = yield* Socket.WebSocketConstructor
      const active = yield* Ref.make<ReadonlyMap<string, ActiveConnection>>(new Map())
      const nextEpoch = yield* Ref.make(0)

      const sendThrough = (owner: ActiveConnection, command: AgentCommand): Effect.Effect<void, AgentCommandError> => {
        if (command._tag !== "Cancel") {
          return Effect.fail(SendFailed.make({ reason: `${command._tag} requires a Host command adapter` }))
        }
        return Effect.gen(function* () {
          if ((yield* Ref.get(active)).get(command.sessionId) !== owner) {
            return yield* SendFailed.make({ reason: "The Session connection has been replaced" })
          }
          const runId = yield* Ref.get(owner.runId)
          if (runId === undefined) {
            return yield* SendFailed.make({ reason: "No Run event has been received for this Session" })
          }
          const connection = yield* Ref.get(owner.connection)
          if (Option.isNone(connection)) return yield* SendFailed.make({ reason: "The Session is resynchronizing" })
          yield* connection.value.cancel(runId, command.commandId)
        })
      }

      const session = ({ sessionId }: { readonly sessionId: string }) =>
        Effect.gen(function* () {
          const runId = yield* Ref.make<string | undefined>(undefined)
          const owner = { runId, connection: yield* Ref.make(Option.none<ServerConnection>()) }
          const resyncs = yield* Ref.make(0)
          const epochRef = yield* Ref.make(-1)
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
          const frames = Stream.unwrap(
            Effect.gen(function* () {
              const epoch = yield* Ref.getAndUpdate(nextEpoch, (current) => current + 1)
              yield* Ref.set(epochRef, epoch)
              const connection = yield* client.events.connect({ sessionId }).pipe(
                Effect.provideService(Socket.WebSocketConstructor, webSocketConstructor),
                Effect.mapError((error) =>
                  TransportError.make({
                    message: "message" in error ? error.message : "Snapshot request requested an unsupported retry",
                    kind: "protocol",
                  }),
                ),
              )
              yield* Ref.set(
                runId,
                connection.snapshot.runs.findLast((run) => run.run.parentRunId === undefined)?.run.runId,
              )
              const conversation = yield* Ref.make(connection.snapshot.conversation)
              yield* Effect.acquireRelease(Ref.set(owner.connection, Option.some(connection)), () =>
                Ref.update(owner.connection, (current) =>
                  Option.isSome(current) && current.value === connection ? Option.none() : current,
                ),
              )
              const statuses = connection.status.pipe(
                Stream.filterMap((status) =>
                  Option.match(statusIncoming(status, { sessionId, epoch }), {
                    onNone: () => Result.fail(undefined),
                    onSome: Result.succeed,
                  }),
                ),
              )
              const events = connection.events.pipe(
                Stream.tap((event) => {
                  if (event._tag !== "Conversation")
                    return "event" in event && event.event.parentRunId === undefined
                      ? Ref.set(runId, event.runId)
                      : Effect.void
                  return Effect.gen(function* () {
                    const next = applyConversationUpdate({
                      conversation: yield* Ref.get(conversation),
                      update: event.update,
                    })
                    if (Option.isNone(next))
                      return yield* TransportError.make({
                        message: "Committed conversation has a missing parent or stale leaf",
                        kind: "lagged",
                      })
                    yield* Ref.set(conversation, next.value)
                  })
                }),
                Stream.map((event): Incoming => HostDelivery({ epoch, event })),
              )
              return Stream.succeed<Incoming>(SessionSnapshot({ epoch, snapshot: connection.snapshot })).pipe(
                Stream.concat(statuses.pipe(Stream.merge(events))),
              )
            }),
          ).pipe(
            Stream.scoped,
            Stream.retry(
              Schedule.recurs(3).pipe(
                Schedule.addDelay(() => Effect.succeed("250 millis")),
                Schedule.while(({ input }) =>
                  Ref.modify(resyncs, (count) => [
                    Schema.is(TransportError)(input) &&
                      (input.kind === "cursor-expired" || input.kind === "lagged") &&
                      count < 3,
                    count + 1,
                  ]),
                ),
              ),
            ),
            Stream.catchCause((cause) =>
              Option.match(unexpectedCause(cause), {
                onNone: () =>
                  Result.match(Cause.findError(cause), {
                    onFailure: Stream.failCause,
                    onSuccess: (error) =>
                      Stream.fromEffect(
                        Ref.get(epochRef).pipe(
                          Effect.map((epoch) =>
                            ConnectionFailed({ sessionId, epoch, operation: "connect", error, reason: error.message }),
                          ),
                        ),
                      ),
                  }),
                onSome: Stream.failCause,
              }),
            ),
          )
          return {
            sessionId,
            frames,
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
  )
