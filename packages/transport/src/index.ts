import {
  AgentClient as Client_AgentClient,
  sseFrames as Client_sseFrames,
  layerWebSocket as Client_layerWebSocket,
} from "./transport/client.js"
export const Client = {
  AgentClient: Client_AgentClient,
  sseFrames: Client_sseFrames,
  layerWebSocket: Client_layerWebSocket,
} as typeof import("./transport/client.js")
export namespace Client {
  export type AgentClient = import("./transport/client.js").AgentClient
  export type sseFrames = typeof import("./transport/client.js").sseFrames
  export type layerWebSocket = typeof import("./transport/client.js").layerWebSocket
  export type AgentClientInterface = import("./transport/client.js").AgentClientInterface
  export type BufferPolicy = import("./transport/client.js").BufferPolicy
  export type ConnectOptions = import("./transport/client.js").ConnectOptions
  export type Connection = import("./transport/client.js").Connection
  export type ConnectionStatus = import("./transport/client.js").ConnectionStatus
  export type ReconnectPolicy = import("./transport/client.js").ReconnectPolicy
}
import {
  TransportError as Errors_TransportError,
  NotAttached as Errors_NotAttached,
  SessionMismatch as Errors_SessionMismatch,
  ReconnectExhausted as Errors_ReconnectExhausted,
  WireEncodeFailed as Errors_WireEncodeFailed,
} from "./transport/errors.js"
export const Errors = {
  TransportError: Errors_TransportError,
  NotAttached: Errors_NotAttached,
  SessionMismatch: Errors_SessionMismatch,
  ReconnectExhausted: Errors_ReconnectExhausted,
  WireEncodeFailed: Errors_WireEncodeFailed,
} as typeof import("./transport/errors.js")
export namespace Errors {
  export type TransportError = import("./transport/errors.js").TransportError
  export type NotAttached = import("./transport/errors.js").NotAttached
  export type SessionMismatch = import("./transport/errors.js").SessionMismatch
  export type ReconnectExhausted = import("./transport/errors.js").ReconnectExhausted
  export type WireEncodeFailed = import("./transport/errors.js").WireEncodeFailed
}
import {
  layerMemory as SessionRegistry_layerMemory,
  SessionBusy as SessionRegistry_SessionBusy,
  SessionError as SessionRegistry_SessionError,
  SessionQueueFull as SessionRegistry_SessionQueueFull,
  SubscriberLagged as SessionRegistry_SubscriberLagged,
  SessionRegistry as SessionRegistry_SessionRegistry,
} from "./session/session-registry.js"
export const SessionRegistry = {
  layerMemory: SessionRegistry_layerMemory,
  SessionBusy: SessionRegistry_SessionBusy,
  SessionError: SessionRegistry_SessionError,
  SessionQueueFull: SessionRegistry_SessionQueueFull,
  SubscriberLagged: SessionRegistry_SubscriberLagged,
  SessionRegistry: SessionRegistry_SessionRegistry,
} as typeof import("./session/session-registry.js")
export namespace SessionRegistry {
  export type layerMemory = typeof import("./session/session-registry.js").layerMemory
  export type SessionBusy = import("./session/session-registry-errors.js").SessionBusy
  export type SessionError = import("./session/session-registry-errors.js").SessionError
  export type SessionQueueFull = import("./session/session-registry-errors.js").SessionQueueFull
  export type SubscriberLagged = import("./session/session-registry-errors.js").SubscriberLagged
  export type SessionRegistry = import("./session/session-registry-contract.js").SessionRegistry
  export type Interface = import("./session/session-registry-contract.js").Interface
  export type SessionInfo = import("./session/session-registry-contract.js").SessionInfo
  export type MemoryOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    R,
  > = import("./session/session-registry-contract.js").MemoryOptions<Tools, R>
}
import {
  lastEventId as Sse_lastEventId,
  streamSuccess as Sse_streamSuccess,
  respond as Sse_respond,
} from "./transport/sse.js"
export const Sse = {
  lastEventId: Sse_lastEventId,
  streamSuccess: Sse_streamSuccess,
  respond: Sse_respond,
} as typeof import("./transport/sse.js")
export namespace Sse {
  export type lastEventId = typeof import("./transport/sse.js").lastEventId
  export type streamSuccess = typeof import("./transport/sse.js").streamSuccess
  export type respond = typeof import("./transport/sse.js").respond
}
import {
  Sequence as Wire_Sequence,
  SequenceFromString as Wire_SequenceFromString,
  RunFailure as Wire_RunFailure,
  SessionStatus as Wire_SessionStatus,
  ClientApproval as Wire_ClientApproval,
  ClientFrame as Wire_ClientFrame,
  EventSchema as Wire_EventSchema,
  LooseEventSchema as Wire_LooseEventSchema,
  ServerFrame as Wire_ServerFrame,
  LooseServerFrame as Wire_LooseServerFrame,
  codec as Wire_codec,
  codecEffect as Wire_codecEffect,
} from "./transport/wire.js"
export const Wire = {
  Sequence: Wire_Sequence,
  SequenceFromString: Wire_SequenceFromString,
  RunFailure: Wire_RunFailure,
  SessionStatus: Wire_SessionStatus,
  ClientApproval: Wire_ClientApproval,
  ClientFrame: Wire_ClientFrame,
  EventSchema: Wire_EventSchema,
  LooseEventSchema: Wire_LooseEventSchema,
  ServerFrame: Wire_ServerFrame,
  LooseServerFrame: Wire_LooseServerFrame,
  codec: Wire_codec,
  codecEffect: Wire_codecEffect,
} as typeof import("./transport/wire.js")
export namespace Wire {
  export type Sequence = import("./transport/wire.js").Sequence
  export type SequenceFromString = typeof import("./transport/wire.js").SequenceFromString
  export type RunFailure = import("./transport/wire.js").RunFailure
  export type SessionStatus = import("./transport/wire.js").SessionStatus
  export type ClientApproval = import("./transport/wire.js").ClientApproval
  export type ClientFrame = typeof import("./transport/wire.js").ClientFrame
  export type EventSchema = typeof import("./transport/wire.js").EventSchema
  export type LooseEventSchema = typeof import("./transport/wire.js").LooseEventSchema
  export type ServerFrame = typeof import("./transport/wire.js").ServerFrame
  export type LooseServerFrame = typeof import("./transport/wire.js").LooseServerFrame
  export type codec = typeof import("./transport/wire.js").codec
  export type codecEffect = typeof import("./transport/wire.js").codecEffect
  export type Capability<
    T extends
      | import("effect/unstable/ai").Toolkit.Any
      | import("effect/unstable/ai").Toolkit.WithHandler<Record<string, import("effect/unstable/ai").Tool.Any>> =
      | import("effect/unstable/ai").Toolkit.Any
      | import("effect/unstable/ai").Toolkit.WithHandler<Record<string, import("effect/unstable/ai").Tool.Any>>,
  > = import("./transport/wire.js").Capability<T>
  export type ClientFrameType = import("./transport/wire.js").ClientFrameType
  export type EventType<
    T extends import("./transport/wire.js").ToolkitInput = import("effect/unstable/ai").Toolkit.Any,
  > = import("./transport/wire.js").EventType<T>
  export type LooseEventType = import("./transport/wire.js").LooseEventType
  export type LooseServerFrameType = import("./transport/wire.js").LooseServerFrameType
  export type ServerFrameType<
    T extends import("./transport/wire.js").ToolkitInput = import("effect/unstable/ai").Toolkit.Any,
  > = import("./transport/wire.js").ServerFrameType<T>
  export type WireCodec<Frame = ServerFrameType> = import("./transport/wire.js").WireCodec<Frame>
}
import { handle as Ws_handle } from "./transport/ws.js"
export const Ws = {
  handle: Ws_handle,
} as typeof import("./transport/ws.js")
export namespace Ws {
  export type handle = typeof import("./transport/ws.js").handle
}
