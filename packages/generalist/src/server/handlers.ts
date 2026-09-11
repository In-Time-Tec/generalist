import { Effect, Layer, Stream, Types } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import type { AgentRegistry, Host, RunStartOptions, SessionCreateOptions } from "../host/index.js"
import { api, type EventStreamItem } from "./api.js"
import { apiError, hostApiError, OperatorDisabled } from "./errors.js"
import { handle as handleWebSocket } from "./websocket.js"
import { handle as handleArtifactWebSocket } from "./artifact-websocket.js"
import { authorize, CurrentPrincipal, type Authorization, type Resource } from "./auth.js"

const protect =
  (policy: Authorization) =>
  <A, E, R>(resource: Resource, action: "read" | "observe" | "mutate", operation: () => Effect.Effect<A, E, R>) =>
    authorize({ policy, resource, action }).pipe(Effect.andThen(Effect.suspend(operation)))

const mapError = (operation: string) => Effect.mapError((error: Error) => apiError({ operation, error }))
const mapHostError = (operation: string) => Effect.mapError((error: Error) => hostApiError({ operation, error }))

const sessionsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "sessions", (handlers) =>
    handlers.handleAll({
      create: ({ payload }) => {
        const resource: Types.Mutable<Resource> = { type: "session" }
        if (payload.id !== undefined) resource.id = payload.id
        return protect(policy)(resource, "mutate", () => {
          const options: Types.Mutable<SessionCreateOptions> = {}
          if (payload.id !== undefined) options.id = payload.id
          if (payload.title !== undefined) options.title = payload.title
          if (payload.agent !== undefined) options.agent = payload.agent
          return host.sessions.create(options).pipe(
            Effect.flatMap((session) => session.inspect),
            mapError("sessions.create"),
          )
        })
      },
      get: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) => session.inspect),
            mapError("sessions.get"),
          ),
        ),
      submit: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "mutate", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) => session.submit(payload.input, payload)),
            mapError("sessions.submit"),
          ),
        ),
      updateInput: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "mutate", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) => session.queue.update(params.inputId, payload.input, payload)),
            mapError("sessions.updateInput"),
          ),
        ),
      removeInput: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "mutate", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) => session.queue.remove(params.inputId, payload)),
            mapError("sessions.removeInput"),
          ),
        ),
      snapshot: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.snapshot(params.id).pipe(mapError("sessions.snapshot")),
        ),
      history: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.history(params.id, payload).pipe(mapError("sessions.history")),
        ),
      runs: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.runs(params.id, payload).pipe(mapError("sessions.runs")),
        ),
      entry: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.entry(params.id, params.entryId).pipe(mapError("sessions.entry")),
        ),
      run: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.run(params.id, params.runId).pipe(mapError("sessions.run")),
        ),
      family: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.family(params.id, payload).pipe(mapError("sessions.family")),
        ),
      control: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "mutate", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) =>
              Effect.gen(function* () {
                if (payload.action === "stop") return yield* session.stop(payload)
                if (payload.action === "close") return yield* session.close(payload)
                return yield* session.resume(payload)
              }),
            ),
            mapError("sessions.control"),
          ),
        ),
      list: () =>
        protect(policy)({ type: "session" }, "read", () => host.sessions.list().pipe(mapError("sessions.list"))),
    }),
  )

const runsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "runs", (handlers) =>
    handlers.handleAll({
      start: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.sessionId }, "mutate", () => {
          const options: Types.Mutable<RunStartOptions> = { idempotencyKey: payload.commandId }
          return host.runs.startByName(params.sessionId, payload.agent, payload.input, options).pipe(
            Effect.map((run) => ({ id: run.id })),
            mapError("runs.start"),
          )
        }),
      list: ({ params }) =>
        protect(policy)({ type: "session", id: params.sessionId }, "read", () =>
          host.runs.list(params.sessionId).pipe(mapError("runs.list")),
        ),
      inspect: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.inspect(params.id).pipe(mapError("runs.inspect")),
        ),
      cancel: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          host.runs.cancel(params.id, payload.commandId, payload.reason).pipe(mapError("runs.cancel")),
        ),
      message: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          Effect.gen(function* () {
            const principal = yield* CurrentPrincipal
            return yield* host.runs
              .send(params.id, payload.input, {
                idempotencyKey: payload.commandId,
                from: { user: principal.id },
              })
              .pipe(mapError("runs.message"))
          }),
        ),
      messages: ({ params, query }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.messages(params.id, query.limit).pipe(mapError("runs.messages")),
        ),
      admitChild: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          host.runs
            .admitChild(params.id, payload.selection, payload.prompt, {
              commandId: payload.commandId,
              ...(payload.label === undefined ? undefined : { label: payload.label }),
            })
            .pipe(mapHostError("runs.admitChild")),
        ),
      listChildren: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.children(params.id).pipe(mapHostError("runs.listChildren")),
        ),
      inspectChild: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.inspectChild(params.id, params.childId).pipe(mapHostError("runs.inspectChild")),
        ),
    }),
  )

const toolsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "tools", (handlers) =>
    handlers.handleAll({
      start: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          host.tools
            .startByName(params.name, payload.input, { commandId: payload.commandId, parentRunId: params.id })
            .pipe(
              Effect.map((run) => ({ id: run.id })),
              mapHostError("tools.start"),
            ),
        ),
      inspect: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.tools.getByName(params.name, params.id).pipe(
            Effect.flatMap((run) => run.inspect),
            mapHostError("tools.inspect"),
          ),
        ),
    }),
  )

const eventsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "events", (handlers) =>
    handlers
      .handle("subscribe", ({ params, query, headers }) =>
        protect(policy)({ type: "session", id: params.id }, "observe", () => {
          const cursor = headers["last-event-id"] ?? query.cursor
          return Effect.gen(function* () {
            const principal = yield* CurrentPrincipal
            const events = yield* host.events.subscribe(params.id, cursor)
            return events.pipe(
              Stream.mapEffect((event) =>
                authorize({
                  policy,
                  resource: { type: "session", id: params.id },
                  action: "observe",
                }).pipe(Effect.provideService(CurrentPrincipal, principal), Effect.as(event)),
              ),
              Stream.map((event): EventStreamItem => ({ id: String(event.cursor), event: event._tag, data: event })),
              Stream.mapError((error) => apiError({ operation: "events.subscribe", error })),
            )
          }).pipe(mapError("events.subscribe"))
        }),
      )
      .handleRaw("connect", ({ params, query, request }) =>
        protect(policy)({ type: "session", id: params.id }, "observe", () =>
          host.events.subscribe(params.id, query.cursor).pipe(
            mapError("events.connect"),
            Effect.flatMap((events) =>
              handleWebSocket({ host, sessionId: params.id, request, events, authorization: policy }).pipe(
                Effect.orDie,
              ),
            ),
          ),
        ),
      ),
  )

const artifactsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "artifacts", (handlers) =>
    handlers
      .handle("read", ({ params }) =>
        protect(policy)({ type: "artifact", id: params.name }, "read", () => host.artifacts.read(params.name)),
      )
      .handleRaw("connect", ({ params, query, request }) =>
        protect(policy)({ type: "artifact", id: params.name }, "observe", () =>
          host.artifacts
            .subscribe(params.name, query.version)
            .pipe(
              Effect.flatMap((updates) =>
                handleArtifactWebSocket({ host, name: params.name, request, updates, authorization: policy }).pipe(
                  Effect.orDie,
                ),
              ),
            ),
        ),
      ),
  )

const approvalsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "approvals", (handlers) =>
    handlers.handle("resolve", ({ params, payload }) =>
      protect(policy)({ type: "run", id: params.id }, "mutate", () =>
        CurrentPrincipal.pipe(
          Effect.flatMap((principal) =>
            host.approvals.resolve(params.id, params.token, payload.decision, principal.id, payload.commandId),
          ),
          mapError("approvals.resolve"),
        ),
      ),
    ),
  )

const attachmentsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "attachments", (handlers) =>
    handlers.handleAll({
      put: ({ headers, payload }) =>
        protect(policy)({ type: "attachment" }, "mutate", () =>
          host.attachments
            .put({
              data: payload,
              mediaType: headers["x-media-type"],
              ...(headers["x-filename"] === undefined ? undefined : { filename: headers["x-filename"] }),
            })
            .pipe(mapError("attachments.put")),
        ),
      get: ({ params }) =>
        protect(policy)({ type: "attachment", id: params.sha256 }, "read", () =>
          host.attachments.get(params.sha256).pipe(
            Effect.map(({ data, ref }) =>
              HttpApiSchema.withHeaders({
                body: data,
                headers: {
                  "content-type": ref.mediaType,
                  ...(ref.filename === undefined ? undefined : { "x-filename": ref.filename }),
                },
              }),
            ),
            mapError("attachments.get"),
          ),
        ),
    }),
  )

const operatorHandlers = <Agents extends AgentRegistry>(
  host: Host<Agents>,
  enabled: boolean,
  policy: Authorization,
) => {
  const write = <A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E | OperatorDisabled> =>
    enabled ? effect : Effect.fail(OperatorDisabled.make({ operation }))
  return HttpApiBuilder.group(api, "operator", (handlers) =>
    handlers.handleAll({
      explain: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.operator.explain(params.id).pipe(mapError("operator.explain")),
        ),
      retry: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write("retry", host.operator.retry(params.id, principal.id, payload.commandId)),
            ),
            mapError("operator.retry"),
          ),
        ),
      wake: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write("wake", host.operator.wake(params.id, principal.id, payload.commandId)),
            ),
            mapError("operator.wake"),
          ),
        ),
      resolveUnknown: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write(
                "resolveUnknown",
                host.operator.resolveUnknown(
                  params.id,
                  payload.operationId,
                  payload.resolution,
                  principal.id,
                  payload.commandId,
                ),
              ),
            ),
            mapError("operator.resolveUnknown"),
          ),
        ),
      extendBudget: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "mutate", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write(
                "extendBudget",
                host.operator.extendBudget(params.id, payload.delta, principal.id, payload.commandId),
              ),
            ),
            mapError("operator.extendBudget"),
          ),
        ),
    }),
  )
}

export interface HandlerOptions<Agents extends AgentRegistry> {
  readonly host: Host<Agents>
  readonly operator: boolean
  readonly authorization: Authorization
}

/** Handler Layers for one concrete Host value. */
export const layerHandlers = <Agents extends AgentRegistry>(options: HandlerOptions<Agents>) =>
  Layer.mergeAll(
    sessionsHandlers(options.host, options.authorization),
    runsHandlers(options.host, options.authorization),
    toolsHandlers(options.host, options.authorization),
    eventsHandlers(options.host, options.authorization),
    artifactsHandlers(options.host, options.authorization),
    approvalsHandlers(options.host, options.authorization),
    attachmentsHandlers(options.host, options.authorization),
    operatorHandlers(options.host, options.operator, options.authorization),
  )
