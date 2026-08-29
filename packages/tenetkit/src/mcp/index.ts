import {
  McpConnectionFailed as McpToolSource_McpConnectionFailed,
  McpToolCallFailed as McpToolSource_McpToolCallFailed,
  McpToolFailure as McpToolSource_McpToolFailure,
  McpToolSource as McpToolSource_McpToolSource,
  fromTransport as McpToolSource_fromTransport,
  layer as McpToolSource_layer,
  layerTagged as McpToolSource_layerTagged,
} from "./tool-source.js"
export const McpToolSource = {
  McpConnectionFailed: McpToolSource_McpConnectionFailed,
  McpToolCallFailed: McpToolSource_McpToolCallFailed,
  McpToolFailure: McpToolSource_McpToolFailure,
  McpToolSource: McpToolSource_McpToolSource,
  fromTransport: McpToolSource_fromTransport,
  layer: McpToolSource_layer,
  layerTagged: McpToolSource_layerTagged,
}
export namespace McpToolSource {
  export type McpConnectionFailed = import("./tool-source.js").McpConnectionFailed
  export type McpToolCallFailed = import("./tool-source.js").McpToolCallFailed
  export type McpToolFailure = import("./tool-source.js").McpToolFailure
  export type McpToolSource = import("./tool-source.js").McpToolSource
  export type fromTransport = typeof import("./tool-source.js").fromTransport
  export type layer = typeof import("./tool-source.js").layer
  export type layerTagged = typeof import("./tool-source.js").layerTagged
  export type CallOptions = import("./tool-source.js").CallOptions
  export type DiscoveredTool = import("./tool-source.js").DiscoveredTool
  export type Interface = import("./tool-source.js").Interface
  export type JsonValue = import("./tool-source.js").JsonValue
  export type McpAiTool = import("./tool-source.js").McpAiTool
  export type Options = import("./tool-source.js").Options
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
  export type Interface = import("./oauth.js").Interface
  export type TokenStoreInterface = import("./oauth.js").TokenStoreInterface
}
