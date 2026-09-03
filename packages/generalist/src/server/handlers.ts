import { Effect, Layer, Stream, Types } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { Host, RunStartOptions, SessionCreateOptions } from "../host/index.js"
import { api, type EventStreamItem } from "./api.js"
import { apiError, OperatorDisabled } from "./errors.js"
import { handle as handleWebSocket } from "./websocket.js"
import { handle as handleArtifactWebSocket } from "./artifact-websocket.js"

const mapError = (operation: string) => Effect.mapError((error: Error) => apiError({ operation, error }))

const sessionsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "sessions", (handlers) =>
    handlers.handleAll({
      create: ({ payload }) => {
        const options: Types.Mutable<SessionCreateOptions> = {}
        if (payload.id !== undefined) options.id = payload.id
        if (payload.title !== undefined) options.title = payload.title
        return host.sessions.create(options).pipe(mapError("sessions.create"))
      },
      get: ({ params }) => host.sessions.get(params.id).pipe(mapError("sessions.get")),
      list: () => host.sessions.list().pipe(mapError("sessions.list")),
    }),
  )

const runsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "runs", (handlers) =>
    handlers.handleAll({
      start: ({ params, payload }) => {
        const options: Types.Mutable<RunStartOptions> = {}
        if (payload.idempotencyKey !== undefined) options.idempotencyKey = payload.idempotencyKey
        return host.runs.startByName(params.sessionId, payload.agent, payload.input, options).pipe(
          Effect.map((run) => ({ id: run.id })),
          mapError("runs.start"),
        )
      },
      list: ({ params }) => host.runs.list(params.sessionId).pipe(mapError("runs.list")),
      inspect: ({ params }) => host.runs.inspect(params.id).pipe(mapError("runs.inspect")),
      cancel: ({ params, payload }) => host.runs.cancel(params.id, payload.reason).pipe(mapError("runs.cancel")),
    }),
  )

const eventsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "events", (handlers) =>
    handlers
      .handle("subscribe", ({ params, query, headers }) => {
        const cursor = headers["last-event-id"] ?? query.cursor
        return host.events.subscribe(params.id, cursor).pipe(
          Effect.map((events) =>
            events.pipe(
              Stream.map((event): EventStreamItem => ({ id: String(event.cursor), event: event._tag, data: event })),
              Stream.mapError((error) => apiError({ operation: "events.subscribe", error })),
            ),
          ),
          mapError("events.subscribe"),
        )
      })
      .handleRaw("connect", ({ params, query, request }) =>
        host.events.subscribe(params.id, query.cursor).pipe(
          mapError("events.connect"),
          Effect.flatMap((events) =>
            handleWebSocket({ host, sessionId: params.id, request, events }).pipe(Effect.orDie),
          ),
        ),
      ),
  )

const artifactsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "artifacts", (handlers) =>
    handlers
      .handle("read", ({ params }) => host.artifacts.read(params.name))
      .handleRaw("connect", ({ params, query, request }) =>
        host.artifacts
          .subscribe(params.name, query.version)
          .pipe(
            Effect.flatMap((updates) =>
              handleArtifactWebSocket({ host, name: params.name, request, updates }).pipe(Effect.orDie),
            ),
          ),
      ),
  )

const approvalsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "approvals", (handlers) =>
    handlers.handle("resolve", ({ params, payload }) =>
      host.approvals
        .resolve(params.id, params.token, payload.decision, payload.operator)
        .pipe(mapError("approvals.resolve")),
    ),
  )

const attachmentsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "attachments", (handlers) =>
    handlers.handleAll({
      put: ({ headers, payload }) =>
        host.attachments
          .put({
            data: payload,
            mediaType: headers["x-media-type"],
            ...(headers["x-filename"] === undefined ? undefined : { filename: headers["x-filename"] }),
          })
          .pipe(mapError("attachments.put")),
      get: ({ params }) =>
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
    }),
  )

const operatorHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>, enabled: boolean) => {
  const write = <A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E | OperatorDisabled> =>
    enabled ? effect : Effect.fail(OperatorDisabled.make({ operation }))
  return HttpApiBuilder.group(api, "operator", (handlers) =>
    handlers.handleAll({
      explain: ({ params }) => host.operator.explain(params.id).pipe(mapError("operator.explain")),
      retry: ({ params, payload }) =>
        write("retry", host.operator.retry(params.id, payload.operator)).pipe(mapError("operator.retry")),
      wake: ({ params, payload }) =>
        write("wake", host.operator.wake(params.id, payload.operator)).pipe(mapError("operator.wake")),
      resolveUnknown: ({ params, payload }) =>
        write(
          "resolveUnknown",
          host.operator.resolveUnknown(params.id, payload.operationId, payload.resolution, payload.operator),
        ).pipe(mapError("operator.resolveUnknown")),
      extendBudget: ({ params, payload }) =>
        write("extendBudget", host.operator.extendBudget(params.id, payload.delta, payload.operator)).pipe(
          mapError("operator.extendBudget"),
        ),
    }),
  )
}

export interface HandlerOptions<Agents extends ReadonlyArray<AnyAgent>> {
  readonly host: Host<Agents>
  readonly operator: boolean
}

/** Handler Layers for one concrete Host value. */
export const layerHandlers = <Agents extends ReadonlyArray<AnyAgent>>(options: HandlerOptions<Agents>) =>
  Layer.mergeAll(
    sessionsHandlers(options.host),
    runsHandlers(options.host),
    eventsHandlers(options.host),
    artifactsHandlers(options.host),
    approvalsHandlers(options.host),
    attachmentsHandlers(options.host),
    operatorHandlers(options.host, options.operator),
  )
