import { Effect, Filter, Option, Schema, Stream, type Types } from "effect"
import type { Any as AnyAgent } from "../../core/agent/lifecycle/definition.js"
import { encode as encodeAgentInput } from "../../core/agent/lifecycle/input.js"
import { DurabilityFailure } from "../../durability/errors.js"
import { project as projectHostEvent } from "../../host/event.js"
import { clientProjection } from "../../server/projection/index.js"
import type { SessionService } from "../application.js"
import { RuntimeUnavailable, UnknownAgent } from "../errors.js"
import { publicIdentity } from "../executable/public-identity.js"
import type { RegisteredAgents } from "../executable/registered-agent.js"
import type { Service as RunStore } from "../run/store.js"
import type { CreateSessionInput } from "../session/host.js"
import { SessionIdempotencyConflict, SessionQueueConflict, type SelectionResolver } from "../session/queue.js"
import { normalizePrompt } from "../state/prompt.js"

const sessionConflict = <A, E, R>(sessionId: string, commandId: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchIf(
      (error) => Schema.is(DurabilityFailure)(error) && error.reason === "input-conflict",
      () => SessionIdempotencyConflict.make({ sessionId, commandId }),
    ),
  )

export const make = (input: {
  readonly store: RunStore
  readonly agents: RegisteredAgents
  readonly selection: SelectionResolver
  readonly control: import("../engine.js").Service["controlSession"]
}): SessionService => {
  const prepare = <Codec extends Schema.Top>(
    sessionId: string,
    agent: AnyAgent & { readonly input: Codec },
    value: Codec["Type"],
  ) =>
    Effect.gen(function* () {
      const registration = yield* input.agents.getFor(agent)
      if (Option.isNone(registration)) {
        return yield* UnknownAgent.make({ agentName: agent.name, runId: `session:${sessionId}` })
      }
      const encoded = yield* encodeAgentInput(agent.input, value).pipe(
        Effect.provideContext(registration.value.context),
        Effect.mapError(() =>
          SessionQueueConflict.make({
            sessionId,
            reason: "selection",
            hint: "The input must satisfy the selected Agent's declared input schema.",
          }),
        ),
      )
      return { agent: agent.name, prompt: normalizePrompt(encoded) }
    })
  const handle = (sessionId: string): import("../application.js").SessionHandle => ({
    sessionId,
    inspect: input.store.views.session(sessionId),
    queue: input.store.hostSession(sessionId).pipe(
      Effect.flatMap((session) =>
        Effect.forEach(session.queue, (entry) => {
          const identity = publicIdentity(entry.selection)
          return identity === undefined
            ? RuntimeUnavailable.make({
                message: `Session ${sessionId} contains an input without exact Agent identity`,
              })
            : Effect.succeed({ id: entry.id, revision: entry.revision, agent: identity.name, prompt: entry.prompt })
        }),
      ),
    ),
    submit: (agent, value, options) =>
      Effect.gen(function* () {
        const prepared = yield* prepare(sessionId, agent, value)
        const receipt = yield* sessionConflict(
          sessionId,
          options.commandId,
          input.store.submitSessionInput({ ...prepared, sessionId, commandId: options.commandId }, input.selection),
        )
        return { sessionId, id: receipt.id, revision: receipt.revision }
      }),
    update: (request) =>
      Effect.gen(function* () {
        const prepared = yield* prepare(sessionId, request.agent, request.value)
        const receipt = yield* sessionConflict(
          sessionId,
          request.commandId,
          input.store.updateSessionInput(
            {
              ...prepared,
              sessionId,
              id: request.id,
              expectedRevision: request.expectedRevision,
              commandId: request.commandId,
            },
            input.selection,
          ),
        )
        return { sessionId, id: receipt.id, revision: receipt.revision }
      }),
    remove: (request) =>
      sessionConflict(
        sessionId,
        request.commandId,
        input.store.removeSessionInput({
          sessionId,
          id: request.id,
          expectedRevision: request.expectedRevision,
          commandId: request.commandId,
        }),
      ).pipe(Effect.asVoid),
    control: (action, commandId) => input.control({ sessionId, action, commandId }),
    events: (cursor) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const position = cursor === undefined ? -1 : Number(cursor)
          if (
            !Number.isSafeInteger(position) ||
            position < -1 ||
            (cursor !== undefined && String(position) !== cursor)
          ) {
            return yield* RuntimeUnavailable.make({ message: "Session replay requires an unchanged committed cursor" })
          }
          return input.store.hostSessionEvents({ sessionId, cursor: position }).pipe(
            Stream.mapEffect((entry) =>
              Effect.gen(function* () {
                const projected = projectHostEvent(sessionId, entry)
                if (Option.isNone(projected)) return Option.none()
                const event = projected.value
                if (event._tag === "RunStarted" || event._tag === "Turn" || event._tag === "Completed") {
                  const run = yield* input.store.views
                    .run(event.runId)
                    .pipe(
                      Effect.catchTag("generalist/runtime/RunNotFound", () =>
                        RuntimeUnavailable.make({ message: "A Session event references an unavailable Run" }),
                      ),
                    )
                  return clientProjection.projectClientEvent(sessionId, event, {
                    name: run.agent,
                    revision: run.revision,
                  })
                }
                if (event._tag === "ToolCall" && event.event._tag === "ToolProgress") {
                  const snapshot = yield* input.store
                    .hostSessionSnapshot(sessionId)
                    .pipe(
                      Effect.catchTag("generalist/host/SessionPageInvalid", () =>
                        RuntimeUnavailable.make({ message: "Session tool progress has no valid conversation view" }),
                      ),
                    )
                  return clientProjection.projectClientEvent(
                    sessionId,
                    event,
                    undefined,
                    clientProjection.clientToolName(snapshot.conversation, event.event.toolCallId),
                  )
                }
                return clientProjection.projectClientEvent(sessionId, event)
              }),
            ),
            Stream.filterMap(Filter.fromPredicateOption((event) => event)),
          )
        }),
      ),
  })
  return {
    create: (request) => {
      const prepared: Types.Mutable<CreateSessionInput> = { id: request.sessionId }
      if (request.title !== undefined) prepared.title = request.title
      return input.store.createHostSession(prepared).pipe(Effect.as(handle(request.sessionId)))
    },
    get: (sessionId) => input.store.views.session(sessionId).pipe(Effect.as(handle(sessionId))),
    list: input.store.views.sessions,
  }
}
