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
import { ClientCommand, eventCodec } from "./wire.js"
import { SessionPageInvalid } from "../runtime/session/page.js"
import {
  ClientAgentIdentity,
  ClientApprovalSummary,
  ClientBudget,
  ClientConversation,
  ClientConversationEntry,
  ClientConversationUpdate,
  ClientCursor,
  ClientEvent,
  ClientMessage,
  ClientPreview,
  ClientQueueEntry,
  ClientRun,
  ClientRunSummary,
  ClientServerEvent,
  ClientSession,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  ClientSessionSnapshot,
  ClientUsage,
  ClientWait,
} from "./projection/index.js"
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
export type { ApiError } from "./errors.js"
export type { ClientCommand, EventCodec } from "./wire.js"
export {
  ClientAgentIdentity,
  ClientApprovalSummary,
  ClientBudget,
  ClientConversation,
  ClientConversationEntry,
  ClientConversationUpdate,
  ClientCursor,
  ClientEvent,
  ClientMessage,
  ClientPreview,
  ClientQueueEntry,
  ClientRun,
  ClientRunSummary,
  ClientServerEvent,
  ClientSession,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  ClientSessionSnapshot,
  ClientUsage,
  ClientWait,
} from "./projection/index.js"
export interface Server {
  readonly api: typeof api
  readonly layer: typeof layer
  readonly authBearer: typeof layerBearer
  readonly client: typeof client
  readonly Authentication: typeof Authentication
  readonly CurrentPrincipal: typeof CurrentPrincipal
  readonly Principal: typeof Principal
  readonly Forbidden: typeof Forbidden
  readonly ClientCursor: typeof ClientCursor
  readonly ClientMessage: typeof ClientMessage
  readonly ClientConversationEntry: typeof ClientConversationEntry
  readonly ClientConversation: typeof ClientConversation
  readonly ClientConversationUpdate: typeof ClientConversationUpdate
  readonly ClientAgentIdentity: typeof ClientAgentIdentity
  readonly ClientBudget: typeof ClientBudget
  readonly ClientUsage: typeof ClientUsage
  readonly ClientWait: typeof ClientWait
  readonly ClientQueueEntry: typeof ClientQueueEntry
  readonly ClientSession: typeof ClientSession
  readonly ClientRun: typeof ClientRun
  readonly ClientApprovalSummary: typeof ClientApprovalSummary
  readonly ClientRunSummary: typeof ClientRunSummary
  readonly ClientEvent: typeof ClientEvent
  readonly ClientPreview: typeof ClientPreview
  readonly ClientServerEvent: typeof ClientServerEvent
  readonly ClientSessionSnapshot: typeof ClientSessionSnapshot
  readonly ClientSessionHistoryPage: typeof ClientSessionHistoryPage
  readonly ClientSessionRunsPage: typeof ClientSessionRunsPage
  readonly SessionPageInvalid: typeof SessionPageInvalid
  readonly ClientCommand: typeof ClientCommand
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
  ClientCursor,
  ClientMessage,
  ClientConversationEntry,
  ClientConversation,
  ClientConversationUpdate,
  ClientAgentIdentity,
  ClientBudget,
  ClientUsage,
  ClientWait,
  ClientQueueEntry,
  ClientSession,
  ClientRun,
  ClientApprovalSummary,
  ClientRunSummary,
  ClientEvent,
  ClientPreview,
  ClientServerEvent,
  ClientSessionSnapshot,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  SessionPageInvalid,
  ClientCommand,
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
