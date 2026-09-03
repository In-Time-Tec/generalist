import { Schema } from "effect"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { Invalid as BudgetInvalid } from "../core/durable/run-budget.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { BlobNotFound, BlobStoreError, BlobTooLarge } from "../blob-store/index.js"
import { AgentInputInvalid, AgentNotRegistered } from "../host/errors.js"
import {
  ApprovalMismatch,
  ApprovalStale,
  IllegalOperatorAction,
  RunNotFound,
  RuntimeUnavailable,
} from "../runtime/errors.js"
import {
  SessionConflict,
  SessionCursorExpired,
  SessionNotFound,
  SessionSubscriberLagged,
} from "../runtime/session/host.js"
import {
  ArtifactAlreadyOpen,
  ArtifactBaseStale,
  ArtifactCrdtMismatch,
  ArtifactNotFound,
  ArtifactRangeInvalid,
  ArtifactStorageError,
  ArtifactSubscriberLagged,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
} from "../core/artifact.js"

/** A request did not carry the bearer credential accepted by the configured server auth layer. */
export class Unauthorized extends ActionableTaggedError<Unauthorized>()(
  "generalist/server/Unauthorized",
  {
    hint: errorHint("Send the configured bearer token in the Authorization header."),
  },
  { httpApiStatus: 401 },
) {}

/** An operator mutation was requested from a read-only server. */
export class OperatorDisabled extends ActionableTaggedError<OperatorDisabled>()(
  "generalist/server/OperatorDisabled",
  {
    operation: Schema.String,
    hint: errorHint("Start Server.layer with operator: true before using operator mutation routes."),
  },
  { httpApiStatus: 403 },
) {}

/** A Host failure without a dedicated public HTTP representation. */
export class RequestFailed extends ActionableTaggedError<RequestFailed>()(
  "generalist/server/RequestFailed",
  {
    operation: Schema.String,
    message: Schema.String,
    hint: errorHint("Inspect message and the Run state, correct the request, then retry only if safe."),
  },
  { httpApiStatus: 409 },
) {}

/** Client transport framing, encoding, or connection operation failed. */
export class TransportError extends ActionableTaggedError<TransportError>()("generalist/server/TransportError", {
  message: Schema.String,
  kind: Schema.optional(Schema.Literals(["socket", "protocol", "encoding", "not-open"])),
  hint: errorHint("Inspect kind and message, restore the connection, then retry only if the operation is safe."),
}) {}

/** The configured WebSocket client options cannot create a bounded connection. */
export class InvalidConnectOptions extends ActionableTaggedError<InvalidConnectOptions>()(
  "generalist/server/InvalidConnectOptions",
  {
    message: Schema.String,
    hint: errorHint("Provide a positive event capacity and a finite reconnect schedule."),
  },
) {}

/** Reconnection stopped after the configured schedule was exhausted. */
export class ReconnectExhausted extends ActionableTaggedError<ReconnectExhausted>()(
  "generalist/server/ReconnectExhausted",
  {
    lastError: TransportError,
    hint: errorHint("Restore connectivity or provide a new bounded reconnect schedule before reconnecting."),
  },
) {}

/** A client or server frame could not be Schema-encoded or decoded. */
export class WireCodecFailed extends ActionableTaggedError<WireCodecFailed>()("generalist/server/WireCodecFailed", {
  message: Schema.String,
  hint: errorHint("Correct the frame to match Server.HostEvent or Server.ClientCommand."),
}) {}

const badRequest = HttpApiSchema.status(400)
const conflict = HttpApiSchema.status(409)
const notFound = HttpApiSchema.status(404)
const payloadTooLarge = HttpApiSchema.status(413)
const unavailable = HttpApiSchema.status(503)

export const apiErrors = [
  AgentInputInvalid.pipe(badRequest),
  AgentNotRegistered.pipe(notFound),
  ApprovalMismatch.pipe(conflict),
  ApprovalStale.pipe(conflict),
  BlobNotFound.pipe(notFound),
  BlobStoreError.pipe(unavailable),
  BlobTooLarge.pipe(payloadTooLarge),
  BudgetInvalid.pipe(badRequest),
  IllegalOperatorAction.pipe(conflict),
  OperatorDisabled,
  RequestFailed,
  RunNotFound.pipe(notFound),
  RuntimeUnavailable.pipe(unavailable),
  SessionConflict.pipe(conflict),
  SessionCursorExpired.pipe(conflict),
  SessionNotFound.pipe(notFound),
  SessionSubscriberLagged.pipe(conflict),
] as const

export const artifactApiErrors = [
  ArtifactAlreadyOpen.pipe(conflict),
  ArtifactBaseStale.pipe(conflict),
  ArtifactCrdtMismatch.pipe(conflict),
  ArtifactNotFound.pipe(notFound),
  ArtifactRangeInvalid.pipe(badRequest),
  ArtifactStorageError.pipe(unavailable),
  ArtifactSubscriberLagged.pipe(conflict),
  ArtifactVersionConflict.pipe(conflict),
  ArtifactVersionNotFound.pipe(conflict),
] as const

/** Errors encoded by the declared HttpApi endpoints and SSE stream. */
export const ApiError = Schema.Union([...apiErrors, ...artifactApiErrors])
export type ApiError = typeof ApiError.Type

const dedicatedErrors = Schema.Union([
  AgentInputInvalid,
  AgentNotRegistered,
  ApprovalMismatch,
  ApprovalStale,
  BlobNotFound,
  BlobStoreError,
  BlobTooLarge,
  BudgetInvalid,
  IllegalOperatorAction,
  OperatorDisabled,
  RequestFailed,
  RunNotFound,
  RuntimeUnavailable,
  SessionConflict,
  SessionCursorExpired,
  SessionNotFound,
  SessionSubscriberLagged,
])
type EndpointError = typeof dedicatedErrors.Type

export interface ApiErrorOptions {
  readonly operation: string
  readonly error: Error
}

/** Preserve known public failures and normalize the rest at the HTTP boundary. */
export const apiError = (options: ApiErrorOptions): EndpointError =>
  Schema.is(dedicatedErrors)(options.error)
    ? options.error
    : RequestFailed.make({ operation: options.operation, message: options.error.message })
