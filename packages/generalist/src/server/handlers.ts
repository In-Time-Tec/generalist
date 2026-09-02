import { Effect, Layer, Stream, Types } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { Host, RunStartOptions, SessionCreateOptions } from "../host/index.js"
import { api, type EventStreamItem } from "./api.js"
import { apiError, OperatorDisabled } from "./errors.js"
import { handle as handleWebSocket } from "./websocket.js"

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
        return Effect.succeed(
          host.events.subscribe(params.id, cursor).pipe(
            Stream.map((event): EventStreamItem => ({ id: String(event.cursor), event: event._tag, data: event })),
            Stream.mapError((error) => apiError({ operation: "events.subscribe", error })),
          ),
        )
      })
      .handleRaw("connect", ({ params, query, request }) => {
        const websocketOptions =
          query.cursor === undefined
            ? { host, sessionId: params.id, request }
            : { host, sessionId: params.id, request, cursor: query.cursor }
        return host.sessions
          .get(params.id)
          .pipe(mapError("events.connect"), Effect.andThen(handleWebSocket(websocketOptions).pipe(Effect.orDie)))
      }),
  )

const approvalsHandlers = <Agents extends ReadonlyArray<AnyAgent>>(host: Host<Agents>) =>
  HttpApiBuilder.group(api, "approvals", (handlers) =>
    handlers.handle("resolve", ({ params, payload }) =>
      host.approvals
        .resolve(params.id, params.token, payload.decision, payload.operator)
        .pipe(mapError("approvals.resolve")),
    ),
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
    approvalsHandlers(options.host),
    operatorHandlers(options.host, options.operator),
  )
