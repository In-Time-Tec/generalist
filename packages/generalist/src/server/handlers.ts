import { Effect, Layer, Option, Ref, Result, Schema, Stream, Types } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import type { AgentRegistry, Host, RunStartOptions, SessionCreateOptions } from "../host/index.js"
import type { Cursor } from "../runtime/cursor.js"
import type { RuntimeInspection } from "../runtime/engine.js"
import { RuntimeUnavailable } from "../runtime/errors.js"
import type { SessionRunsInput, SessionRunSummary } from "../runtime/session/page.js"
import type { HostEvent } from "../host/event.js"
import { api, type EventStreamItem } from "./api.js"
import { apiError, hostApiError, InvalidCursor, OperatorDisabled } from "./errors.js"
import { handle as handleWebSocket } from "./websocket.js"
import { handle as handleArtifactWebSocket } from "./artifact-websocket.js"
import { CursorFromString } from "./wire.js"
import { authorize, CurrentPrincipal, type Authorization, type Resource } from "./auth.js"
import { type ClientAgentIdentity, type ClientEvent, type ClientRun, clientProjection } from "./projection/index.js"

const {
  clientToolName,
  projectClientAgentIdentity,
  projectClientConversationEntry,
  projectClientEvent,
  projectClientHistoryPage,
  projectClientRun,
  projectClientRunSummary,
  projectClientRunsPage,
  projectClientSession,
  projectClientSnapshot,
} = clientProjection

const protect =
  (policy: Authorization) =>
  <A, E, R>(
    resource: Resource,
    action: "read" | "observe" | "mutate" | "operator",
    operation: () => Effect.Effect<A, E, R>,
  ) =>
    authorize({ policy, resource, action }).pipe(Effect.andThen(Effect.suspend(operation)))

const mapError = (operation: string) => Effect.mapError((error: Error) => apiError({ operation, error }))
const mapHostError = (operation: string) => Effect.mapError((error: Error) => hostApiError({ operation, error }))

const headerEncoder = new TextEncoder()
const hexByte = (byte: number) => byte.toString(16).toUpperCase().padStart(2, "0")

// Bun rejects NUL, CR, LF, and every code point above U+00FF in a field value.
// The remaining C0 controls and U+007F are accepted, so only these are encoded.
const rejectedHeaderPoint = (point: number) => point > 0xff || point === 0x00 || point === 0x0a || point === 0x0d

/**
 * Encodes a stored header value so a web `Response` can carry it.
 *
 * Stored media references are canonical and unvalidated, so a Host can persist
 * a filename or media type whose bytes throw while the response is converted to
 * a web `Response`, leaving the request unresolved. Percent-encode only the code
 * points the native `Headers` implementation rejects so every accepted value,
 * including non-ASCII names, is echoed unchanged.
 */
const encodeHeaderValue = (value: string): string => {
  let out = ""
  for (const character of value) {
    const point = character.codePointAt(0)
    if (point === undefined || !rejectedHeaderPoint(point)) {
      out += character
      continue
    }
    for (const byte of headerEncoder.encode(character)) out += `%${hexByte(byte)}`
  }
  return out
}

/**
 * Resolve the authoritative replay cursor. A decoded `Last-Event-ID` header always
 * wins, so a malformed cursor query is ignored rather than decoded when the header
 * is present. The query is decoded only when it is the winning source.
 */
const resolveCursor = (
  header: string | undefined,
  query: string | undefined,
): Effect.Effect<Cursor | undefined, InvalidCursor> =>
  Effect.gen(function* () {
    const cursor = header ?? query
    if (cursor === undefined) return undefined
    return yield* Schema.decodeEffect(CursorFromString)(cursor).pipe(
      Effect.mapError(() => InvalidCursor.make({ cursor })),
    )
  })

const decodeSessionRunsInput = (payload: {
  readonly at: string
  readonly before?: string
  readonly rootRunId?: string
  readonly limit: number
}): Effect.Effect<SessionRunsInput, InvalidCursor> =>
  Effect.gen(function* () {
    const at = yield* resolveCursor(undefined, payload.at)
    if (at === undefined) return yield* InvalidCursor.make({ cursor: payload.at })
    const request: Types.Mutable<SessionRunsInput> = { at, limit: payload.limit }
    if (payload.before !== undefined) {
      const before = yield* resolveCursor(undefined, payload.before)
      if (before === undefined) return yield* InvalidCursor.make({ cursor: payload.before })
      request.before = before
    }
    if (payload.rootRunId !== undefined) request.rootRunId = payload.rootRunId
    return request
  })

const rootInspection = <Agents extends AgentRegistry>(host: Host<Agents>, source: RuntimeInspection) =>
  Effect.gen(function* () {
    let current = source
    const seen = new Set<string>()
    while (current.parentRunId !== undefined) {
      if (seen.has(current.runId)) return yield* RuntimeUnavailable.make({ message: "Run ancestry contains a cycle" })
      seen.add(current.runId)
      current = yield* host.runs.inspect(current.parentRunId)
    }
    return current
  })

const projectRunInspection = <Agents extends AgentRegistry>(
  host: Host<Agents>,
  source: RuntimeInspection,
  sessionId?: string,
): Effect.Effect<ClientRun, Effect.Error<ReturnType<Host<Agents>["runs"]["inspect"]>>> =>
  Effect.gen(function* () {
    const root = yield* rootInspection(host, source)
    const resolvedSessionId = sessionId ?? source.retainedSession?.id ?? root.retainedSession?.id
    if (resolvedSessionId === undefined)
      return yield* RuntimeUnavailable.make({ message: "Run has no retained Session identity" })
    return yield* Effect.try({
      try: () => projectClientRun(source, { sessionId: resolvedSessionId, rootRunId: root.runId }),
      catch: () => RuntimeUnavailable.make({ message: "Run has no complete public Agent identity" }),
    })
  })

const identityForRun = <Agents extends AgentRegistry>(host: Host<Agents>, runId: string) =>
  host.runs.inspect(runId).pipe(
    Effect.flatMap((run) =>
      Effect.try({
        try: (): ClientAgentIdentity => projectClientAgentIdentity(run),
        catch: () => RuntimeUnavailable.make({ message: "Run has no complete public Agent identity" }),
      }),
    ),
  )

const identitiesForRuns = <Agents extends AgentRegistry>(host: Host<Agents>, runIds: ReadonlyArray<string>) =>
  Effect.forEach(
    runIds,
    (runId) => identityForRun(host, runId).pipe(Effect.map((identity) => [runId, identity] as const)),
    { concurrency: 8 },
  ).pipe(Effect.map((entries) => new Map(entries)))

const projectRunSummary = <Agents extends AgentRegistry>(host: Host<Agents>, source: SessionRunSummary) =>
  identityForRun(host, source.runId).pipe(Effect.map((identity) => projectClientRunSummary(source, identity)))

const projectHostEvent = <Agents extends AgentRegistry>(
  host: Host<Agents>,
  sessionId: string,
  source: HostEvent,
  toolNames: Ref.Ref<ReadonlyMap<string, string>>,
): Effect.Effect<
  Option.Option<ClientEvent>,
  | Effect.Error<ReturnType<Host<Agents>["runs"]["inspect"]>>
  | Effect.Error<ReturnType<Host<Agents>["sessions"]["snapshot"]>>
> => {
  if (source._tag === "ToolCall") {
    const event = source.event
    if (event._tag === "ToolExecutionStarted") {
      return Ref.update(toolNames, (current) => new Map(current).set(event.call.id, event.call.name)).pipe(
        Effect.as(projectClientEvent(sessionId, source)),
      )
    }
    if (event._tag === "ToolExecutionCompleted" || event._tag === "ToolExecutionWaiting") {
      return Ref.update(toolNames, (current) => {
        const next = new Map(current)
        next.delete(event.call.id)
        return next
      }).pipe(Effect.as(projectClientEvent(sessionId, source)))
    }
    return Effect.gen(function* () {
      let toolName = (yield* Ref.get(toolNames)).get(event.toolCallId)
      if (toolName === undefined) {
        const inspection = yield* host.runs.inspect(source.runId)
        if (inspection.activeTools.length === 1) toolName = inspection.activeTools[0]
        else {
          const snapshot = yield* host.sessions.snapshot(sessionId)
          toolName = clientToolName(snapshot.conversation, event.toolCallId)
        }
        if (toolName !== undefined) {
          const resolved = toolName
          yield* Ref.update(toolNames, (current) => new Map(current).set(event.toolCallId, resolved))
        }
      }
      return projectClientEvent(sessionId, source, undefined, toolName)
    })
  }
  if (source._tag !== "RunStarted" && source._tag !== "Turn" && source._tag !== "Completed") {
    return Effect.succeed(projectClientEvent(sessionId, source))
  }
  return identityForRun(host, source.runId).pipe(
    Effect.map((identity) => projectClientEvent(sessionId, source, identity)),
  )
}

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
            Effect.map(projectClientSession),
            mapError("sessions.create"),
          )
        })
      },
      get: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.get(params.id).pipe(
            Effect.flatMap((session) => session.inspect),
            Effect.map(projectClientSession),
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
          host.sessions.snapshot(params.id).pipe(
            Effect.flatMap((snapshot) =>
              identitiesForRuns(
                host,
                snapshot.runs.map((run) => run.runId),
              ).pipe(Effect.map((identities) => projectClientSnapshot(snapshot, identities))),
            ),
            mapError("sessions.snapshot"),
          ),
        ),
      history: ({ params, payload }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions
            .history(params.id, payload)
            .pipe(Effect.map(projectClientHistoryPage), mapError("sessions.history")),
        ),
      runs: ({ params, payload }) =>
        decodeSessionRunsInput(payload).pipe(
          Effect.flatMap((request) =>
            protect(policy)({ type: "session", id: params.id }, "read", () =>
              host.sessions.runs(params.id, request).pipe(
                Effect.flatMap((page) =>
                  identitiesForRuns(
                    host,
                    page.runs.map((run) => run.runId),
                  ).pipe(Effect.map((identities) => projectClientRunsPage(page, identities))),
                ),
                mapError("sessions.runs"),
              ),
            ),
          ),
        ),
      entry: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions
            .entry(params.id, params.entryId)
            .pipe(Effect.map(projectClientConversationEntry), mapError("sessions.entry")),
        ),
      run: ({ params }) =>
        protect(policy)({ type: "session", id: params.id }, "read", () =>
          host.sessions.run(params.id, params.runId).pipe(
            Effect.flatMap((run) => projectRunSummary(host, run)),
            mapError("sessions.run"),
          ),
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
        protect(policy)({ type: "session" }, "read", () =>
          host.sessions.list().pipe(
            Effect.map((sessions) => sessions.map(projectClientSession)),
            mapError("sessions.list"),
          ),
        ),
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
          host.runs.list(params.sessionId).pipe(
            Effect.flatMap((runs) =>
              Effect.forEach(
                runs,
                (run) =>
                  host.runs
                    .inspect(run.runId)
                    .pipe(Effect.flatMap((current) => projectRunInspection(host, current, params.sessionId))),
                { concurrency: 8 },
              ),
            ),
            mapError("runs.list"),
          ),
        ),
      inspect: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.inspect(params.id).pipe(
            Effect.flatMap((run) => projectRunInspection(host, run)),
            mapError("runs.inspect"),
          ),
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
          host.runs.children(params.id).pipe(
            Effect.flatMap((children) =>
              Effect.forEach(
                children,
                (child) =>
                  host.runs.inspect(child.childRunId).pipe(Effect.flatMap((run) => projectRunInspection(host, run))),
                { concurrency: 8 },
              ),
            ),
            mapHostError("runs.listChildren"),
          ),
        ),
      inspectChild: ({ params }) =>
        protect(policy)({ type: "run", id: params.id }, "read", () =>
          host.runs.inspectChild(params.id, params.childId).pipe(
            Effect.andThen(host.runs.inspect(params.childId)),
            Effect.flatMap((run) => projectRunInspection(host, run)),
            mapHostError("runs.inspectChild"),
          ),
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
            Effect.flatMap((run) => projectRunInspection(host, run)),
            mapHostError("tools.inspect"),
          ),
        ),
    }),
  )

const eventsHandlers = <Agents extends AgentRegistry>(host: Host<Agents>, policy: Authorization) =>
  HttpApiBuilder.group(api, "events", (handlers) =>
    handlers
      .handle("subscribe", ({ params, query, headers }) =>
        resolveCursor(headers["last-event-id"], query.cursor).pipe(
          Effect.flatMap((cursor) =>
            protect(policy)({ type: "session", id: params.id }, "observe", () =>
              Effect.gen(function* () {
                const principal = yield* CurrentPrincipal
                const events = yield* host.events.subscribe(params.id, cursor)
                const toolNames = yield* Ref.make<ReadonlyMap<string, string>>(new Map())
                return events.pipe(
                  Stream.mapEffect((event) =>
                    authorize({
                      policy,
                      resource: { type: "session", id: params.id },
                      action: "observe",
                    }).pipe(
                      Effect.provideService(CurrentPrincipal, principal),
                      Effect.andThen(projectHostEvent(host, params.id, event, toolNames)),
                    ),
                  ),
                  Stream.filterMap((event) =>
                    Option.match(event, { onNone: () => Result.fail(undefined), onSome: Result.succeed }),
                  ),
                  Stream.map((event): EventStreamItem => ({ id: event.cursor, event: event._tag, data: event })),
                  Stream.mapError((error) => apiError({ operation: "events.subscribe", error })),
                )
              }).pipe(mapError("events.subscribe")),
            ),
          ),
        ),
      )
      .handleRaw("connect", ({ params, query, request }) =>
        resolveCursor(undefined, query.cursor).pipe(
          Effect.flatMap((cursor) =>
            protect(policy)({ type: "session", id: params.id }, "observe", () =>
              host.events.subscribe(params.id, cursor).pipe(
                mapError("events.connect"),
                Effect.flatMap((events) =>
                  handleWebSocket({ host, sessionId: params.id, request, events, authorization: policy }).pipe(
                    Effect.orDie,
                  ),
                ),
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
                  "content-type": encodeHeaderValue(ref.mediaType),
                  ...(ref.filename === undefined ? undefined : { "x-filename": encodeHeaderValue(ref.filename) }),
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
        protect(policy)({ type: "run", id: params.id }, "operator", () =>
          host.operator.explain(params.id).pipe(mapError("operator.explain")),
        ),
      retry: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "operator", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write("retry", host.operator.retry(params.id, principal.id, payload.commandId)),
            ),
            mapError("operator.retry"),
          ),
        ),
      wake: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "operator", () =>
          CurrentPrincipal.pipe(
            Effect.flatMap((principal) =>
              write("wake", host.operator.wake(params.id, principal.id, payload.commandId)),
            ),
            mapError("operator.wake"),
          ),
        ),
      resolveUnknown: ({ params, payload }) =>
        protect(policy)({ type: "run", id: params.id }, "operator", () =>
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
        protect(policy)({ type: "run", id: params.id }, "operator", () =>
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
