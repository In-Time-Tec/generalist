import {
  RunClient as Client_RunClient,
  layerWebSocket as Client_layerWebSocket,
  sseEvents as Client_sseEvents,
} from "./client.js"
export const RunClient = {
  RunClient: Client_RunClient,
  layerWebSocket: Client_layerWebSocket,
  sseEvents: Client_sseEvents,
}
export namespace RunClient {
  export type RunClient = import("./client.js").RunClient
  export type Service = import("./client.js").Service
  export type ConnectOptions = import("./client.js").ConnectOptions
  export type Connection = import("./client.js").Connection
  export type ConnectionStatus = import("./client.js").ConnectionStatus
  export type ReconnectPolicy = import("./client.js").ReconnectPolicy
}

import {
  InvalidCursor as Errors_InvalidCursor,
  NotAttached as Errors_NotAttached,
  ReconnectExhausted as Errors_ReconnectExhausted,
  RunMismatch as Errors_RunMismatch,
  TransportError as Errors_TransportError,
  WireEncodeFailed as Errors_WireEncodeFailed,
} from "./errors.js"
export const Errors = {
  InvalidCursor: Errors_InvalidCursor,
  NotAttached: Errors_NotAttached,
  ReconnectExhausted: Errors_ReconnectExhausted,
  RunMismatch: Errors_RunMismatch,
  TransportError: Errors_TransportError,
  WireEncodeFailed: Errors_WireEncodeFailed,
}
export namespace Errors {
  export type InvalidCursor = import("./errors.js").InvalidCursor
  export type NotAttached = import("./errors.js").NotAttached
  export type ReconnectExhausted = import("./errors.js").ReconnectExhausted
  export type RunMismatch = import("./errors.js").RunMismatch
  export type TransportError = import("./errors.js").TransportError
  export type WireEncodeFailed = import("./errors.js").WireEncodeFailed
}

import { get as Snapshot_get } from "./snapshot.js"
export const Snapshot = {
  get: Snapshot_get,
}
export namespace Snapshot {
  export type RunSnapshot = import("./snapshot.js").RunSnapshot
}

import {
  decodeEvent as SSE_decodeEvent,
  lastEventId as SSE_lastEventId,
  respond as SSE_respond,
  StreamError as SSE_StreamError,
  streamSuccess as SSE_streamSuccess,
} from "./sse.js"
export const SSE = {
  decodeEvent: SSE_decodeEvent,
  lastEventId: SSE_lastEventId,
  respond: SSE_respond,
  StreamError: SSE_StreamError,
  streamSuccess: SSE_streamSuccess,
}
export namespace SSE {
  export type StreamError = import("./sse.js").StreamError
}

import { page as Replay_page } from "./replay.js"
export const Replay = { page: Replay_page }
export namespace Replay {
  export type Frame = import("./replay.js").Frame
  export type Page = import("./replay.js").Page
  export type PageInput = import("./replay.js").PageInput
}

import {
  ClientCommand as Wire_ClientCommand,
  CursorFromString as Wire_CursorFromString,
  decodeCommand as Wire_decodeCommand,
  encodeCommand as Wire_encodeCommand,
  ObserverRunEvent as Wire_ObserverRunEvent,
  observerCodec as Wire_observerCodec,
  producerCodec as Wire_producerCodec,
} from "./wire.js"
export const Wire = {
  ClientCommand: Wire_ClientCommand,
  CursorFromString: Wire_CursorFromString,
  decodeCommand: Wire_decodeCommand,
  encodeCommand: Wire_encodeCommand,
  ObserverRunEvent: Wire_ObserverRunEvent,
  observerCodec: Wire_observerCodec,
  producerCodec: Wire_producerCodec,
}
export namespace Wire {
  export type ClientCommand = import("./wire.js").ClientCommand
  export type EventCodec<Decoded = import("../runtime/index.js").RunEvent.RunEvent> =
    import("./wire.js").EventCodec<Decoded>
  export type ResolvedRunEvent = import("./wire.js").ResolvedRunEvent
}

import { handle as WebSocket_handle } from "./websocket.js"
export const WebSocket = { handle: WebSocket_handle }
