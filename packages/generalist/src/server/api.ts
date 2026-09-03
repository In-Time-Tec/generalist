import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Ref as MediaRef } from "../media/ref.js"
import { BudgetLimits, Remaining as RemainingBudget } from "../core/durable/run-budget.js"
import { Result as GateResult } from "../core/agent/gates/definition.js"
import { HostEvent } from "../host/event.js"
import { HostSession } from "../runtime/session/host.js"
import { Decision } from "../runtime/operation/approval.js"
import { Explanation, UnknownResolution } from "../runtime/execution/recovery/operator.js"
import { RawUsageFact, RunInspection, RunInspectionFields, RunOutcome, RunStatus } from "../runtime/run.js"
import { AgentLoopEventSchema } from "../runtime/run/event.js"
import type { RuntimeInspection } from "../runtime/service.js"
import { isInspectionEvent } from "../runtime/execution/agent/event.js"
import { ChildReadiness } from "../runtime/child/readiness.js"
import { ExecutionSuspension } from "../runtime/execution/state.js"
import { Authentication } from "./auth.js"
import { ApiError, apiErrors } from "./errors.js"
import { CursorFromString } from "./wire.js"

export const RunStarted = Schema.Struct({ id: Schema.String })
export type RunStarted = typeof RunStarted.Type

export const RunStartPayload = Schema.Struct({
  agent: Schema.String,
  input: Schema.Json,
  idempotencyKey: Schema.optionalKey(Schema.String),
})
export type RunStartPayload = typeof RunStartPayload.Type

export const RunCancelPayload = Schema.Struct({ reason: Schema.optionalKey(Schema.String) })
export type RunCancelPayload = typeof RunCancelPayload.Type

export interface EventStreamItem {
  readonly id: string
  readonly event: string
  readonly data: HostEvent
}

interface EventStreamItemEncoded {
  readonly id: string
  readonly event: string
  readonly data: string
}

export const EventStreamItem: Schema.Codec<EventStreamItem, EventStreamItemEncoded> = Schema.Struct({
  id: Schema.String,
  event: Schema.String,
  data: Schema.fromJsonString(HostEvent),
})

export const eventStream: HttpApiSchema.StreamSse<typeof EventStreamItem, typeof ApiError> = HttpApiSchema.StreamSse({
  events: EventStreamItem,
  error: ApiError,
})

const createSession = HttpApiEndpoint.post("create", "/sessions", {
  payload: Schema.Struct({ id: Schema.optionalKey(Schema.String), title: Schema.optionalKey(Schema.String) }),
  success: HostSession,
  error: apiErrors,
})
const getSession = HttpApiEndpoint.get("get", "/sessions/:id", {
  params: { id: Schema.String },
  success: HostSession,
  error: apiErrors,
})
const listSessions = HttpApiEndpoint.get("list", "/sessions", {
  success: Schema.Array(HostSession),
  error: apiErrors,
})
const sessions: HttpApiGroup.HttpApiGroup<"sessions", typeof createSession | typeof getSession | typeof listSessions> =
  HttpApiGroup.make("sessions").add(createSession, getSession, listSessions)

const startRun = HttpApiEndpoint.post("start", "/sessions/:sessionId/runs", {
  params: { sessionId: Schema.String },
  payload: RunStartPayload,
  success: RunStarted,
  error: apiErrors,
})
const listRuns = HttpApiEndpoint.get("list", "/sessions/:sessionId/runs", {
  params: { sessionId: Schema.String },
  success: Schema.Array(RunInspection),
  error: apiErrors,
})
const InspectionLastEvent = AgentLoopEventSchema.pipe(Schema.refine(isInspectionEvent))
const RuntimeInspectionResponse: Schema.Codec<RuntimeInspection, unknown> = Schema.Struct({
  ...RunInspectionFields,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  usage: Schema.Struct({ inputTokens: Schema.Finite, outputTokens: Schema.Finite }),
  usageFacts: Schema.Array(RawUsageFact),
  activeTools: Schema.Array(Schema.String),
  lastEvent: Schema.optionalKey(InspectionLastEvent),
  elapsed: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  budget: RemainingBudget,
  gates: Schema.Array(GateResult),
  children: Schema.Array(
    Schema.Struct({
      childRunId: Schema.String,
      status: RunStatus,
      readiness: ChildReadiness,
      invocationId: Schema.optionalKey(Schema.String),
      origin: Schema.optionalKey(Schema.Struct({ operationKey: Schema.String, ordinal: Schema.Finite })),
      outcome: Schema.optionalKey(RunOutcome),
    }),
  ),
  suspension: Schema.optionalKey(ExecutionSuspension),
})
const inspectRun = HttpApiEndpoint.get("inspect", "/runs/:id", {
  params: { id: Schema.String },
  success: RuntimeInspectionResponse,
  error: apiErrors,
})
const cancelRun = HttpApiEndpoint.post("cancel", "/runs/:id/cancel", {
  params: { id: Schema.String },
  payload: RunCancelPayload,
  error: apiErrors,
})
const runs: HttpApiGroup.HttpApiGroup<
  "runs",
  typeof startRun | typeof listRuns | typeof inspectRun | typeof cancelRun
> = HttpApiGroup.make("runs").add(startRun, listRuns, inspectRun, cancelRun)

const subscribeEvents = HttpApiEndpoint.get("subscribe", "/sessions/:id/events", {
  params: { id: Schema.String },
  query: { cursor: Schema.optionalKey(CursorFromString) },
  headers: { "last-event-id": Schema.optionalKey(CursorFromString) },
  success: eventStream,
  error: apiErrors,
})
const connectEvents = HttpApiEndpoint.get("connect", "/sessions/:id/ws", {
  params: { id: Schema.String },
  query: { cursor: Schema.optionalKey(CursorFromString) },
  error: apiErrors,
})
const events: HttpApiGroup.HttpApiGroup<"events", typeof subscribeEvents | typeof connectEvents> = HttpApiGroup.make(
  "events",
).add(subscribeEvents, connectEvents)

const resolveApproval = HttpApiEndpoint.post("resolve", "/runs/:id/approvals/:token", {
  params: { id: Schema.String, token: Schema.String },
  payload: Schema.Struct({ decision: Decision, operator: Schema.String }),
  error: apiErrors,
})
const approvals: HttpApiGroup.HttpApiGroup<"approvals", typeof resolveApproval> =
  HttpApiGroup.make("approvals").add(resolveApproval)

const AttachmentBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }))
/** Buffered attachment response with stored content headers. @experimental */
export const AttachmentDownload = HttpApiSchema.WithHeaders(AttachmentBytes, {
  "content-type": Schema.String,
  "x-filename": Schema.optionalKey(Schema.String),
})
/** Buffered attachment response with stored content headers. @experimental */
export type AttachmentDownload = typeof AttachmentDownload.Type

const putAttachment = HttpApiEndpoint.post("put", "/attachments", {
  headers: {
    "x-media-type": Schema.String,
    "x-filename": Schema.optionalKey(Schema.String),
  },
  payload: AttachmentBytes,
  success: MediaRef,
  error: apiErrors,
})
const getAttachment = HttpApiEndpoint.get("get", "/attachments/:sha256", {
  params: { sha256: MediaRef.fields.sha256 },
  success: AttachmentDownload,
  error: apiErrors,
})
const attachments: HttpApiGroup.HttpApiGroup<"attachments", typeof putAttachment | typeof getAttachment> =
  HttpApiGroup.make("attachments").add(putAttachment, getAttachment)

const explainRun = HttpApiEndpoint.get("explain", "/runs/:id/explain", {
  params: { id: Schema.String },
  success: Explanation,
  error: apiErrors,
})
const retryRun = HttpApiEndpoint.post("retry", "/runs/:id/retry", {
  params: { id: Schema.String },
  payload: Schema.Struct({ operator: Schema.String }),
  error: apiErrors,
})
const wakeRun = HttpApiEndpoint.post("wake", "/runs/:id/wake", {
  params: { id: Schema.String },
  payload: Schema.Struct({ operator: Schema.String }),
  error: apiErrors,
})
const resolveUnknown = HttpApiEndpoint.post("resolveUnknown", "/runs/:id/resolve-unknown", {
  params: { id: Schema.String },
  payload: Schema.Struct({ operationId: Schema.String, resolution: UnknownResolution, operator: Schema.String }),
  error: apiErrors,
})
const extendBudget = HttpApiEndpoint.post("extendBudget", "/runs/:id/extend-budget", {
  params: { id: Schema.String },
  payload: Schema.Struct({ delta: BudgetLimits, operator: Schema.String }),
  error: apiErrors,
})
const operator: HttpApiGroup.HttpApiGroup<
  "operator",
  typeof explainRun | typeof retryRun | typeof wakeRun | typeof resolveUnknown | typeof extendBudget
> = HttpApiGroup.make("operator").add(explainRun, retryRun, wakeRun, resolveUnknown, extendBudget)

type Groups = typeof sessions | typeof runs | typeof events | typeof approvals | typeof attachments | typeof operator
type AuthenticatedGroups = HttpApiGroup.AddMiddleware<Groups, Authentication>

/** Schema-first public API. New ingress modules add one group to this value. */
export const api: HttpApi.HttpApi<"generalist", AuthenticatedGroups> = HttpApi.make("generalist")
  .add(sessions, runs, events, approvals, attachments, operator)
  .middleware(Authentication)
  .annotateMerge(
    OpenApi.annotations({
      title: "Generalist Server API",
      version: "1",
      description: "Product Sessions and durable Runs served by one Generalist Host.",
    }),
  )
