import {
  MCPConnectionFailed as MCPClient_MCPConnectionFailed,
  MCPToolCallFailed as MCPClient_MCPToolCallFailed,
  MCPToolFailure as MCPClient_MCPToolFailure,
  MCPClient as MCPClient_MCPClient,
  fromTransport as MCPClient_fromTransport,
  layer as MCPClient_layer,
  layerTagged as MCPClient_layerTagged,
} from "./client.js"
export const MCPClient = {
  MCPConnectionFailed: MCPClient_MCPConnectionFailed,
  MCPToolCallFailed: MCPClient_MCPToolCallFailed,
  MCPToolFailure: MCPClient_MCPToolFailure,
  MCPClient: MCPClient_MCPClient,
  fromTransport: MCPClient_fromTransport,
  layer: MCPClient_layer,
  layerTagged: MCPClient_layerTagged,
}
export namespace MCPClient {
  export type MCPConnectionFailed = import("./client.js").MCPConnectionFailed
  export type MCPToolCallFailed = import("./client.js").MCPToolCallFailed
  export type MCPToolFailure = import("./client.js").MCPToolFailure
  export type MCPClient = import("./client.js").MCPClient
  export type fromTransport = typeof import("./client.js").fromTransport
  export type layer = typeof import("./client.js").layer
  export type layerTagged = typeof import("./client.js").layerTagged
  export type CallOptions = import("./client.js").CallOptions
  export type DiscoveredTool = import("./client.js").DiscoveredTool
  export type Service = import("./client.js").Service
  export type JsonValue = import("./client.js").JsonValue
  export type MCPTool = import("./client.js").MCPTool
  export type Options = import("./client.js").Options
}
import {
  OAuthPending as OAuth_OAuthPending,
  OAuthDenied as OAuth_OAuthDenied,
  OAuthExpired as OAuth_OAuthExpired,
  OAuthProviderError as OAuth_OAuthProviderError,
  TokenStore as OAuth_TokenStore,
  layerTokenStoreTest as OAuth_layerTokenStoreTest,
  layerTokenStoreMemory as OAuth_layerTokenStoreMemory,
  OAuth as OAuth_OAuth,
  layer as OAuth_layer,
  layerTest as OAuth_layerTest,
} from "./oauth.js"
export const OAuth = {
  OAuthPending: OAuth_OAuthPending,
  OAuthDenied: OAuth_OAuthDenied,
  OAuthExpired: OAuth_OAuthExpired,
  OAuthProviderError: OAuth_OAuthProviderError,
  TokenStore: OAuth_TokenStore,
  layerTokenStoreTest: OAuth_layerTokenStoreTest,
  layerTokenStoreMemory: OAuth_layerTokenStoreMemory,
  OAuth: OAuth_OAuth,
  layer: OAuth_layer,
  layerTest: OAuth_layerTest,
}
export namespace OAuth {
  export type OAuthPending = import("./oauth.js").OAuthPending
  export type OAuthDenied = import("./oauth.js").OAuthDenied
  export type OAuthExpired = import("./oauth.js").OAuthExpired
  export type OAuthProviderError = import("./oauth.js").OAuthProviderError
  export type TokenStore = import("./oauth.js").TokenStore
  export type layerTokenStoreTest = typeof import("./oauth.js").layerTokenStoreTest
  export type layerTokenStoreMemory = typeof import("./oauth.js").layerTokenStoreMemory
  export type OAuth = import("./oauth.js").OAuth
  export type layer = typeof import("./oauth.js").layer
  export type layerTest = typeof import("./oauth.js").layerTest
  export type Authorization = import("./oauth.js").Authorization
  export type Configuration = import("./oauth.js").Configuration
  export type Service = import("./oauth.js").Service
  export type TokenStoreService = import("./oauth.js").TokenStoreService
}
