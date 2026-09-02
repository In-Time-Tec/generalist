import { api } from "./api.js"
import { Authentication, layerBearer } from "./auth.js"
import { client, defaultReconnectSchedule } from "./client.js"
import {
  ApiError,
  InvalidConnectOptions,
  OperatorDisabled,
  ReconnectExhausted,
  RequestFailed,
  TransportError,
  Unauthorized,
  WireCodecFailed,
} from "./errors.js"
import { layer } from "./layer.js"
import { ClientCommand, CursorFromString, eventCodec } from "./wire.js"
import { HostEvent } from "../host/event.js"

export type {
  Client,
  ClientStreamError,
  Connection,
  ConnectionStatus,
  ConnectOptions,
  HttpError,
  ReconnectSchedule,
} from "./client.js"
export type { EventStreamItem, RunStarted } from "./api.js"
export type { Options as LayerOptions } from "./layer.js"
export type { ApiError } from "./errors.js"
export type { ClientCommand, EventCodec } from "./wire.js"

export interface Server {
  readonly api: typeof api
  readonly layer: typeof layer
  readonly authBearer: typeof layerBearer
  readonly client: typeof client
  readonly Authentication: typeof Authentication
  readonly HostEvent: typeof HostEvent
  readonly ClientCommand: typeof ClientCommand
  readonly CursorFromString: typeof CursorFromString
  readonly eventCodec: typeof eventCodec
  readonly defaultReconnectSchedule: typeof defaultReconnectSchedule
  readonly ApiError: typeof ApiError
  readonly Unauthorized: typeof Unauthorized
  readonly OperatorDisabled: typeof OperatorDisabled
  readonly RequestFailed: typeof RequestFailed
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
  HostEvent,
  ClientCommand,
  CursorFromString,
  eventCodec,
  defaultReconnectSchedule,
  ApiError,
  Unauthorized,
  OperatorDisabled,
  RequestFailed,
  TransportError,
  InvalidConnectOptions,
  ReconnectExhausted,
  WireCodecFailed,
}
