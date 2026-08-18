import {
  RunClient as Client_RunClient,
  layerWebSocket as Client_layerWebSocket,
  sseEvents as Client_sseEvents,
} from "./transport/client.js"
export const Client = {
  RunClient: Client_RunClient,
  layerWebSocket: Client_layerWebSocket,
  sseEvents: Client_sseEvents,
} as typeof import("./transport/client.js")
export namespace Client {
  export type RunClient = import("./transport/client.js").RunClient
  export type Interface = import("./transport/client.js").Interface
  export type ConnectOptions = import("./transport/client.js").ConnectOptions
  export type Connection = import("./transport/client.js").Connection
  export type ConnectionStatus = import("./transport/client.js").ConnectionStatus
  export type ReconnectPolicy = import("./transport/client.js").ReconnectPolicy
}

import {
  InvalidCursor as Errors_InvalidCursor,
  NotAttached as Errors_NotAttached,
  ReconnectExhausted as Errors_ReconnectExhausted,
  RunMismatch as Errors_RunMismatch,
  TransportError as Errors_TransportError,
  WireEncodeFailed as Errors_WireEncodeFailed,
} from "./transport/errors.js"
export const Errors = {
  InvalidCursor: Errors_InvalidCursor,
  NotAttached: Errors_NotAttached,
  ReconnectExhausted: Errors_ReconnectExhausted,
  RunMismatch: Errors_RunMismatch,
  TransportError: Errors_TransportError,
  WireEncodeFailed: Errors_WireEncodeFailed,
} as typeof import("./transport/errors.js")
export namespace Errors {
  export type InvalidCursor = import("./transport/errors.js").InvalidCursor
  export type NotAttached = import("./transport/errors.js").NotAttached
  export type ReconnectExhausted = import("./transport/errors.js").ReconnectExhausted
  export type RunMismatch = import("./transport/errors.js").RunMismatch
  export type TransportError = import("./transport/errors.js").TransportError
  export type WireEncodeFailed = import("./transport/errors.js").WireEncodeFailed
}

import { get as Snapshot_get } from "./transport/snapshot.js"
export const Snapshot = {
  get: Snapshot_get,
} as typeof import("./transport/snapshot.js")
export namespace Snapshot {
  export type RunSnapshot = import("./transport/snapshot.js").RunSnapshot
}

import {
  decodeEvent as Sse_decodeEvent,
  lastEventId as Sse_lastEventId,
  respond as Sse_respond,
  StreamError as Sse_StreamError,
  streamSuccess as Sse_streamSuccess,
} from "./transport/sse.js"
export const Sse = {
  decodeEvent: Sse_decodeEvent,
  lastEventId: Sse_lastEventId,
  respond: Sse_respond,
  StreamError: Sse_StreamError,
  streamSuccess: Sse_streamSuccess,
} as typeof import("./transport/sse.js")
export namespace Sse {
  export type StreamError = import("./transport/sse.js").StreamError
}

import {
  ClientCommand as Wire_ClientCommand,
  CursorFromString as Wire_CursorFromString,
  decodeCommand as Wire_decodeCommand,
  encodeCommand as Wire_encodeCommand,
  ObserverRunEvent as Wire_ObserverRunEvent,
  observerCodec as Wire_observerCodec,
  producerCodec as Wire_producerCodec,
} from "./transport/wire.js"
export const Wire = {
  ClientCommand: Wire_ClientCommand,
  CursorFromString: Wire_CursorFromString,
  decodeCommand: Wire_decodeCommand,
  encodeCommand: Wire_encodeCommand,
  ObserverRunEvent: Wire_ObserverRunEvent,
  observerCodec: Wire_observerCodec,
  producerCodec: Wire_producerCodec,
} as typeof import("./transport/wire.js")
export namespace Wire {
  export type ClientCommand = import("./transport/wire.js").ClientCommand
  export type EventCodec<Decoded = import("tenetkit/runtime").RunEvent.RunEvent> =
    import("./transport/wire.js").EventCodec<Decoded>
  export type ResolvedRunEvent = import("./transport/wire.js").ResolvedRunEvent
}

import { handle as Ws_handle } from "./transport/ws.js"
export const Ws = { handle: Ws_handle } as typeof import("./transport/ws.js")
