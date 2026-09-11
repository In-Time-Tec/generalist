import { Schema, SchemaTransformation } from "effect"
import { Prompt } from "effect/unstable/ai"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Ref as MediaRef } from "../media/ref.js"
import { BudgetLimits } from "../core/durable/run-budget.js"
import { HostEvent } from "../host/event.js"
import { sessions } from "./session-api.js"
import { Decision } from "../runtime/operation/approval.js"
import { Explanation, UnknownResolution } from "../runtime/execution/recovery/operator.js"
import { RunInspection, RunReceipt } from "../runtime/run.js"
import { RuntimeInspectionResponse } from "../runtime/inspection.js"
import type { RuntimeInspection } from "../runtime/service.js"
import { Authentication } from "./auth.js"
import { apiErrors, artifactApiErrors, hostTransportErrors } from "./errors.js"
import { CursorFromString } from "./wire.js"
import { MailboxEntry } from "../runtime/messaging/mailbox.js"
import { SteeringReceipt } from "../runtime/run/steering.js"
import {
  ArtifactUpdate,
  RangeOperation,
  ReadResult as ArtifactReadResult,
  Version as ArtifactVersion,
} from "../core/artifact.js"

export const RunStarted = Schema.Struct({ id: Schema.String })
export type RunStarted = typeof RunStarted.Type

export const RunStartPayload = Schema.Struct({
  agent: Schema.String,
  input: Schema.Json,
  commandId: Schema.String.check(Schema.isNonEmpty()),
})
export type RunStartPayload = typeof RunStartPayload.Type

export const ToolStartPayload = Schema.Struct({
  commandId: Schema.String.check(Schema.isNonEmpty()),
  input: Schema.Json,
})
export type ToolStartPayload = typeof ToolStartPayload.Type

export const ChildStartPayload = Schema.Struct({
  commandId: Schema.String.check(Schema.isNonEmpty()),
  selection: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  prompt: Schema.String.check(Schema.isNonEmpty()),
  label: Schema.optionalKey(Schema.String),
})
export type ChildStartPayload = typeof ChildStartPayload.Type

export const RunCancelPayload = Schema.Struct({
  commandId: Schema.String.check(Schema.isNonEmpty()),
  reason: Schema.optionalKey(Schema.String),
})
export type RunCancelPayload = typeof RunCancelPayload.Type

export const RunMessagePayload = Schema.Struct({
  commandId: Schema.String.check(Schema.isNonEmpty()),
  input: Schema.Union([Schema.String, Prompt.Prompt]),
})
export type RunMessagePayload = typeof RunMessagePayload.Type

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

const EndpointError = Schema.Union(apiErrors)
export const eventStream: HttpApiSchema.StreamSse<typeof EventStreamItem, typeof EndpointError> =
  HttpApiSchema.StreamSse({
    events: EventStreamItem,
    error: EndpointError,
  })

/** Browser-to-Host artifact edit command. @experimental */
export const ArtifactClientCommand = Schema.Struct({
  _tag: Schema.tag("Edit"),
  commandId: Schema.String.check(Schema.isNonEmpty()),
  base: ArtifactVersion,
  operation: RangeOperation,
})
export type ArtifactClientCommand = typeof ArtifactClientCommand.Type

/** Initial document and attributed updates sent to artifact WebSocket peers. @experimental */
export const ArtifactServerEvent = Schema.Union([
  Schema.TaggedStruct("Snapshot", { document: ArtifactReadResult }),
  Schema.TaggedStruct("Update", { update: ArtifactUpdate, document: ArtifactReadResult }),
])
export type ArtifactServerEvent = typeof ArtifactServerEvent.Type

const ArtifactVersionFromString = Schema.String.pipe(
  Schema.decodeTo(ArtifactVersion, SchemaTransformation.numberFromString),
)

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
const inspectRunResponse: Schema.Codec<RuntimeInspection, unknown> = RuntimeInspectionResponse
const inspectRun = HttpApiEndpoint.get("inspect", "/runs/:id", {
  params: { id: Schema.String },
  success: inspectRunResponse,
  error: apiErrors,
})
const cancelRun = HttpApiEndpoint.post("cancel", "/runs/:id/cancel", {
  params: { id: Schema.String },
  payload: RunCancelPayload,
  error: apiErrors,
})
const sendRunMessage = HttpApiEndpoint.post("message", "/runs/:id/messages", {
  params: { id: Schema.String },
  payload: RunMessagePayload,
  success: SteeringReceipt,
  error: apiErrors,
})
const listRunMessages = HttpApiEndpoint.get("messages", "/runs/:id/messages", {
  params: { id: Schema.String },
  query: { limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 }))) },
  success: Schema.Array(MailboxEntry),
  error: apiErrors,
})
const admitChild = HttpApiEndpoint.post("admitChild", "/runs/:id/children", {
  params: { id: Schema.String },
  payload: ChildStartPayload,
  success: RunReceipt,
  error: hostTransportErrors,
})
const listChildren = HttpApiEndpoint.get("listChildren", "/runs/:id/children", {
  params: { id: Schema.String },
  success: Schema.Unknown,
  error: hostTransportErrors,
})
const inspectChild = HttpApiEndpoint.get("inspectChild", "/runs/:id/children/:childId", {
  params: { id: Schema.String, childId: Schema.String },
  success: Schema.Unknown,
  error: hostTransportErrors,
})
const runs: HttpApiGroup.HttpApiGroup<
  "runs",
  | typeof startRun
  | typeof listRuns
  | typeof inspectRun
  | typeof cancelRun
  | typeof sendRunMessage
  | typeof listRunMessages
  | typeof admitChild
  | typeof listChildren
  | typeof inspectChild
> = HttpApiGroup.make("runs").add(
  startRun,
  listRuns,
  inspectRun,
  cancelRun,
  sendRunMessage,
  listRunMessages,
  admitChild,
  listChildren,
  inspectChild,
)

const startTool = HttpApiEndpoint.post("start", "/runs/:id/tools/:name", {
  params: { id: Schema.String, name: Schema.String },
  payload: ToolStartPayload,
  success: RunStarted,
  error: hostTransportErrors,
})
const inspectTool = HttpApiEndpoint.get("inspect", "/tools/:name/runs/:id", {
  params: { name: Schema.String, id: Schema.String },
  success: inspectRunResponse,
  error: hostTransportErrors,
})
const tools: HttpApiGroup.HttpApiGroup<"tools", typeof startTool | typeof inspectTool> = HttpApiGroup.make("tools").add(
  startTool,
  inspectTool,
)

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

const readArtifact = HttpApiEndpoint.get("read", "/artifacts/:name", {
  params: { name: Schema.String },
  success: ArtifactReadResult,
  error: artifactApiErrors,
})
const connectArtifact = HttpApiEndpoint.get("connect", "/artifacts/:name/ws", {
  params: { name: Schema.String },
  query: { version: Schema.optionalKey(ArtifactVersionFromString) },
  error: artifactApiErrors,
})
const artifacts: HttpApiGroup.HttpApiGroup<"artifacts", typeof readArtifact | typeof connectArtifact> =
  HttpApiGroup.make("artifacts").add(readArtifact, connectArtifact)

const resolveApproval = HttpApiEndpoint.post("resolve", "/runs/:id/approvals/:token", {
  params: { id: Schema.String, token: Schema.String },
  payload: Schema.Struct({ commandId: Schema.String.check(Schema.isNonEmpty()), decision: Decision }),
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
  payload: Schema.Struct({ commandId: Schema.String.check(Schema.isNonEmpty()) }),
  error: apiErrors,
})
const wakeRun = HttpApiEndpoint.post("wake", "/runs/:id/wake", {
  params: { id: Schema.String },
  payload: Schema.Struct({ commandId: Schema.String.check(Schema.isNonEmpty()) }),
  error: apiErrors,
})
const resolveUnknown = HttpApiEndpoint.post("resolveUnknown", "/runs/:id/resolve-unknown", {
  params: { id: Schema.String },
  payload: Schema.Struct({
    commandId: Schema.String.check(Schema.isNonEmpty()),
    operationId: Schema.String,
    resolution: UnknownResolution,
  }),
  error: apiErrors,
})
const extendBudget = HttpApiEndpoint.post("extendBudget", "/runs/:id/extend-budget", {
  params: { id: Schema.String },
  payload: Schema.Struct({ commandId: Schema.String.check(Schema.isNonEmpty()), delta: BudgetLimits }),
  error: apiErrors,
})
const operator: HttpApiGroup.HttpApiGroup<
  "operator",
  typeof explainRun | typeof retryRun | typeof wakeRun | typeof resolveUnknown | typeof extendBudget
> = HttpApiGroup.make("operator").add(explainRun, retryRun, wakeRun, resolveUnknown, extendBudget)

type Groups =
  | typeof sessions
  | typeof runs
  | typeof tools
  | typeof events
  | typeof artifacts
  | typeof approvals
  | typeof attachments
  | typeof operator
type AuthenticatedGroups = HttpApiGroup.AddMiddleware<Groups, Authentication>

/** Schema-first public API. New ingress modules add one group to this value. */
export const api: HttpApi.HttpApi<"generalist", AuthenticatedGroups> = HttpApi.make("generalist")
  .add(sessions, runs, tools, events, artifacts, approvals, attachments, operator)
  .middleware(Authentication)
  .annotateMerge(
    OpenApi.annotations({
      title: "Generalist Server API",
      version: "1",
      description: "Product Sessions and durable Runs served by one Generalist Host.",
    }),
  )
