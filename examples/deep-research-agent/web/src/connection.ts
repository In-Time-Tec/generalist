import { Effect, Layer, Ref, Schema } from "effect"
import { Server } from "generalist/server"
import { Connection } from "generalist/unstable/foldkit"

export const layer = (options: { readonly baseUrl: string }) =>
  Layer.effect(
    Connection.Connection,
    Effect.gen(function* () {
      const connection = yield* Connection.Connection
      const client = yield* Server.client(options)
      const active = yield* Ref.make<ReadonlyMap<string, Connection.SessionConnection>>(new Map())
      const sendThrough = (owner: Connection.SessionConnection, command: Parameters<Connection.Service["send"]>[0]) =>
        Effect.gen(function* () {
          if (owner.sessionId !== command.sessionId || (yield* Ref.get(active)).get(command.sessionId) !== owner) {
            return yield* Connection.SendFailed.make({ reason: "The Session connection has been replaced" })
          }
          if (command._tag === "Cancel") return yield* owner.send(command)
          if (command._tag === "SendMessage") {
            yield* client.runs.start({
              sessionId: command.sessionId,
              agent: "deep-research-agent",
              input: command.prompt,
            })
            return
          }
          const snapshot = yield* client.sessions.snapshot({ sessionId: command.sessionId })
          const pending = snapshot.runs.find((item) =>
            item.run.waits.some(
              (wait) =>
                wait.status === "open" &&
                wait.reason._tag === "Approval" &&
                wait.reason.request.approvalId === command.token,
            ),
          )
          if (pending === undefined)
            return yield* Connection.SendFailed.make({ reason: "This approval is not pending in the Session" })
          yield* client.approvals.resolve({
            runId: pending.run.runId,
            token: command.token,
            decision: command.decision,
            operator: "research-browser",
          })
        }).pipe(
          Effect.mapError((error) =>
            Schema.is(Connection.AgentCommandError)(error)
              ? error
              : Connection.SendFailed.make({ reason: String(error) }),
          ),
        )
      return Connection.Connection.of({
        send: (command) =>
          Effect.gen(function* () {
            const owner = (yield* Ref.get(active)).get(command.sessionId)
            if (owner === undefined)
              return yield* Connection.SendFailed.make({ reason: "No connection owns this Session" })
            return yield* sendThrough(owner, command)
          }),
        session: (sessionOptions) =>
          Effect.gen(function* () {
            const session = yield* connection.session(sessionOptions)
            yield* Effect.acquireRelease(
              Ref.update(active, (current) => new Map(current).set(session.sessionId, session)),
              () =>
                Ref.update(active, (current) => {
                  if (current.get(session.sessionId) !== session) return current
                  const next = new Map(current)
                  next.delete(session.sessionId)
                  return next
                }),
            )
            return {
              ...session,
              send: (command: Parameters<Connection.Service["send"]>[0]) => sendThrough(session, command),
            }
          }),
      })
    }),
  ).pipe(Layer.provide(Connection.layerWebSocket(options)))
