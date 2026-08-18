import {
  McpConnectionFailed as McpToolSource_McpConnectionFailed,
  McpToolCallFailed as McpToolSource_McpToolCallFailed,
  McpToolFailure as McpToolSource_McpToolFailure,
  McpToolSource as McpToolSource_McpToolSource,
  fromTransport as McpToolSource_fromTransport,
  layer as McpToolSource_layer,
  layerTagged as McpToolSource_layerTagged,
} from "./mcp/mcp-tool-source.js"
export const McpToolSource = {
  McpConnectionFailed: McpToolSource_McpConnectionFailed,
  McpToolCallFailed: McpToolSource_McpToolCallFailed,
  McpToolFailure: McpToolSource_McpToolFailure,
  McpToolSource: McpToolSource_McpToolSource,
  fromTransport: McpToolSource_fromTransport,
  layer: McpToolSource_layer,
  layerTagged: McpToolSource_layerTagged,
} as typeof import("./mcp/mcp-tool-source.js")
export namespace McpToolSource {
  export type McpConnectionFailed = import("./mcp/mcp-tool-source.js").McpConnectionFailed
  export type McpToolCallFailed = import("./mcp/mcp-tool-source.js").McpToolCallFailed
  export type McpToolFailure = import("./mcp/mcp-tool-source.js").McpToolFailure
  export type McpToolSource = import("./mcp/mcp-tool-source.js").McpToolSource
  export type fromTransport = typeof import("./mcp/mcp-tool-source.js").fromTransport
  export type layer = typeof import("./mcp/mcp-tool-source.js").layer
  export type layerTagged = typeof import("./mcp/mcp-tool-source.js").layerTagged
  export type CallOptions = import("./mcp/mcp-tool-source.js").CallOptions
  export type DiscoveredTool = import("./mcp/mcp-tool-source.js").DiscoveredTool
  export type Interface = import("./mcp/mcp-tool-source.js").Interface
  export type JsonValue = import("./mcp/mcp-tool-source.js").JsonValue
  export type McpAiTool = import("./mcp/mcp-tool-source.js").McpAiTool
  export type McpTransport = import("./mcp/mcp-tool-source.js").McpTransport
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
} from "./mcp/oauth.js"
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
} as typeof import("./mcp/oauth.js")
export namespace OAuth {
  export type OAuthPending = import("./mcp/oauth.js").OAuthPending
  export type OAuthDenied = import("./mcp/oauth.js").OAuthDenied
  export type OAuthExpired = import("./mcp/oauth.js").OAuthExpired
  export type OAuthProviderError = import("./mcp/oauth.js").OAuthProviderError
  export type TokenStore = import("./mcp/oauth.js").TokenStore
  export type layerTokenStoreTest = typeof import("./mcp/oauth.js").layerTokenStoreTest
  export type layerTokenStoreMemory = typeof import("./mcp/oauth.js").layerTokenStoreMemory
  export type OAuth = import("./mcp/oauth.js").OAuth
  export type layer = typeof import("./mcp/oauth.js").layer
  export type layerTest = typeof import("./mcp/oauth.js").layerTest
  export type Authorization = import("./mcp/oauth.js").Authorization
  export type Configuration = import("./mcp/oauth.js").Configuration
  export type Interface = import("./mcp/oauth.js").Interface
  export type TokenStoreInterface = import("./mcp/oauth.js").TokenStoreInterface
}
