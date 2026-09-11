import { api, ArtifactClientCommand, ArtifactServerEvent } from "./api.js"
import { Authentication, CurrentPrincipal, Principal, layerBearer } from "./auth.js"
import { client, defaultReconnectSchedule } from "./client.js"
import {
  ApiError,
  Forbidden,
  InvalidConnectOptions,
  InvalidCursor,
  OperatorDisabled,
  ReconnectExhausted,
  RequestFailed,
  TransportError,
  Unauthorized,
  WireCodecFailed,
} from "./errors.js"
import { layer } from "./layer.js"
import { ClientCommand, CursorFromString, eventCodec, ServerEvent } from "./wire.js"
import { HostEvent } from "../host/event.js"
import { PreviewDelivery } from "../host/preview.js"
import { HostSessionSnapshot } from "../runtime/session/host.js"
import { SessionHistoryPage, SessionRunsPage, SessionPageInvalid } from "../runtime/session/page.js"
export type {
  Client,
  ClientStreamError,
  Connection,
  ConnectionEvent,
  ConnectionSnapshot,
  ConnectionStatus,
  ConnectOptions,
  HttpError,
  ReconnectSchedule,
} from "./client.js"
export type { AttachmentDownload, EventStreamItem, RunStarted } from "./api.js"
export type { ArtifactClientCommand, ArtifactServerEvent } from "./api.js"
export type { Options as LayerOptions } from "./layer.js"
export type { Principal, Authorization, Resource } from "./auth.js"
export type { HostSessionSnapshot } from "../runtime/session/host.js"
export type { ApiError } from "./errors.js"
export type { ClientCommand, EventCodec, ServerEvent } from "./wire.js"

export interface Server {
  readonly api: typeof api
  readonly layer: typeof layer
  readonly authBearer: typeof layerBearer
  readonly client: typeof client
  readonly Authentication: typeof Authentication
  readonly CurrentPrincipal: typeof CurrentPrincipal
  readonly Principal: typeof Principal
  readonly Forbidden: typeof Forbidden
  readonly SessionSnapshot: typeof HostSessionSnapshot
  readonly SessionHistoryPage: typeof SessionHistoryPage
  readonly SessionRunsPage: typeof SessionRunsPage
  readonly SessionPageInvalid: typeof SessionPageInvalid
  readonly HostEvent: typeof HostEvent
  readonly PreviewDelivery: typeof PreviewDelivery
  readonly ServerEvent: typeof ServerEvent
  readonly ClientCommand: typeof ClientCommand
  readonly CursorFromString: typeof CursorFromString
  readonly eventCodec: typeof eventCodec
  readonly defaultReconnectSchedule: typeof defaultReconnectSchedule
  readonly ArtifactClientCommand: typeof ArtifactClientCommand
  readonly ArtifactServerEvent: typeof ArtifactServerEvent
  readonly ApiError: typeof ApiError
  readonly Unauthorized: typeof Unauthorized
  readonly OperatorDisabled: typeof OperatorDisabled
  readonly RequestFailed: typeof RequestFailed
  readonly InvalidCursor: typeof InvalidCursor
  readonly TransportError: typeof TransportError
  readonly InvalidConnectOptions: typeof InvalidConnectOptions
  readonly ReconnectExhausted: typeof ReconnectExhausted
  readonly WireCodecFailed: typeof WireCodecFailed
}

/** Stable HTTP, SSE, WebSocket, and generated-client boundary over a Host. */
export const Server: Server = {
  api,
  layer,
  authBearer: layerBearer,
  client,
  Authentication,
  CurrentPrincipal,
  Principal,
  Forbidden,
  SessionSnapshot: HostSessionSnapshot,
  SessionHistoryPage,
  SessionRunsPage,
  SessionPageInvalid,
  HostEvent,
  PreviewDelivery,
  ServerEvent,
  ClientCommand,
  CursorFromString,
  eventCodec,
  defaultReconnectSchedule,
  ArtifactClientCommand,
  ArtifactServerEvent,
  ApiError,
  Unauthorized,
  OperatorDisabled,
  RequestFailed,
  InvalidCursor,
  TransportError,
  InvalidConnectOptions,
  ReconnectExhausted,
  WireCodecFailed,
}
