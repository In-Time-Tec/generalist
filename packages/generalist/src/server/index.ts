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

/** Stable HTTP, SSE, WebSocket, and generated-client boundary over a Host. */
export const Server = {
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
} as const
