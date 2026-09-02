import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { BudgetLimits } from "../core/durable/run-budget.js"
import { HostEvent } from "../host/event.js"
import { HostSession } from "../runtime/session/host.js"
import { Decision } from "../runtime/operation/approval.js"
import { Explanation, UnknownResolution } from "../runtime/execution/recovery/operator.js"
import { RunInspection } from "../runtime/run.js"
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

export const EventStreamItem = Schema.Struct({
  id: Schema.String,
  event: Schema.String,
  data: Schema.fromJsonString(HostEvent),
})
export type EventStreamItem = typeof EventStreamItem.Type

export const eventStream = HttpApiSchema.StreamSse({ events: EventStreamItem, error: ApiError })

const sessions = HttpApiGroup.make("sessions").add(
  HttpApiEndpoint.post("create", "/sessions", {
    payload: Schema.Struct({ id: Schema.optionalKey(Schema.String), title: Schema.optionalKey(Schema.String) }),
    success: HostSession,
    error: apiErrors,
  }),
  HttpApiEndpoint.get("get", "/sessions/:id", {
    params: { id: Schema.String },
    success: HostSession,
    error: apiErrors,
  }),
  HttpApiEndpoint.get("list", "/sessions", { success: Schema.Array(HostSession), error: apiErrors }),
)

const runs = HttpApiGroup.make("runs").add(
  HttpApiEndpoint.post("start", "/sessions/:sessionId/runs", {
    params: { sessionId: Schema.String },
    payload: RunStartPayload,
    success: RunStarted,
    error: apiErrors,
  }),
  HttpApiEndpoint.get("list", "/sessions/:sessionId/runs", {
    params: { sessionId: Schema.String },
    success: Schema.Array(RunInspection),
    error: apiErrors,
  }),
  HttpApiEndpoint.get("inspect", "/runs/:id", {
    params: { id: Schema.String },
    success: RunInspection,
    error: apiErrors,
  }),
  HttpApiEndpoint.post("cancel", "/runs/:id/cancel", {
    params: { id: Schema.String },
    payload: RunCancelPayload,
    error: apiErrors,
  }),
)

const events = HttpApiGroup.make("events").add(
  HttpApiEndpoint.get("subscribe", "/sessions/:id/events", {
    params: { id: Schema.String },
    query: { cursor: Schema.optionalKey(CursorFromString) },
    headers: { "last-event-id": Schema.optionalKey(CursorFromString) },
    success: eventStream,
    error: apiErrors,
  }),
  HttpApiEndpoint.get("connect", "/sessions/:id/ws", {
    params: { id: Schema.String },
    query: { cursor: Schema.optionalKey(CursorFromString) },
    error: apiErrors,
  }),
)

const approvals = HttpApiGroup.make("approvals").add(
  HttpApiEndpoint.post("resolve", "/runs/:id/approvals/:token", {
    params: { id: Schema.String, token: Schema.String },
    payload: Schema.Struct({ decision: Decision, operator: Schema.String }),
    error: apiErrors,
  }),
)

const operator = HttpApiGroup.make("operator").add(
  HttpApiEndpoint.get("explain", "/runs/:id/explain", {
    params: { id: Schema.String },
    success: Explanation,
    error: apiErrors,
  }),
  HttpApiEndpoint.post("retry", "/runs/:id/retry", {
    params: { id: Schema.String },
    payload: Schema.Struct({ operator: Schema.String }),
    error: apiErrors,
  }),
  HttpApiEndpoint.post("wake", "/runs/:id/wake", {
    params: { id: Schema.String },
    payload: Schema.Struct({ operator: Schema.String }),
    error: apiErrors,
  }),
  HttpApiEndpoint.post("resolveUnknown", "/runs/:id/resolve-unknown", {
    params: { id: Schema.String },
    payload: Schema.Struct({ operationId: Schema.String, resolution: UnknownResolution, operator: Schema.String }),
    error: apiErrors,
  }),
  HttpApiEndpoint.post("extendBudget", "/runs/:id/extend-budget", {
    params: { id: Schema.String },
    payload: Schema.Struct({ delta: BudgetLimits, operator: Schema.String }),
    error: apiErrors,
  }),
)

/** Schema-first public API. New ingress modules add one group to this value. */
export const api = HttpApi.make("generalist")
  .add(sessions, runs, events, approvals, operator)
  .middleware(Authentication)
  .annotateMerge(
    OpenApi.annotations({
      title: "Generalist Server API",
      version: "1",
      description: "Product Sessions and durable Runs served by one Generalist Host.",
    }),
  )
