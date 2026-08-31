# MCP

`generalist/mcp` owns remote discovery, tool-call adaptation, and OAuth protocol mechanics. `generalist/mcp/client` accepts an SDK `Transport`; `generalist/mcp/client/http` constructs the Worker-safe Streamable HTTP transport; and `generalist/mcp/client/stdio` is an explicit Node/Bun-only opt-in. `generalist/mcp/oauth` exposes OAuth without loading stdio. Hosts own browser and callback UI, client configuration, and secure token persistence.

Remote discovery schemas and structured results decode as `Schema.Json` on typed error channels. OAuth state uses platform cryptography; one synchronized flow owns state, PKCE, discovery, callback exchange, refresh, and invalidation. Callback attempts consume matching state even when malformed, denied, or failed. Token stores receive redacted, versioned, schema-validated documents and never expose secrets in public errors. HTTP `requestInit.headers` are constructed at the process or request boundary. Raw bearer credentials are not executable identity or persisted registration configuration; persisted reconstruction data carries only the host-owned secret reference needed to resolve them at that boundary.

`route` scopes one MCP connection, one discovered toolkit, its handlers, and the matching Generalist executor. Releasing the scope closes the connection. Calls preserve interruption and optional finite timeouts; the route adds no detached work, queue, or retry policy.

Generalist `Toolkit` values need no server wrapper: hosts can register them directly with Effect's `McpServer.toolkit`. The compiled `examples/mcp-toolkit-server` demonstrates Streamable HTTP using the explicitly legacy `2025-06-18` adapter. Effect does not yet expose an MCP `2026-07-28` adapter, so this example must not be presented as current-revision support.

Generalist does not provide a generic `serveAgent()`. An Agent is not automatically a safe remote tool: a generic API cannot infer prompt visibility, budgets, cancellation, tenant scope, or approval semantics. Hosts must deliberately expose bounded tools instead. MCP Tasks API support is deferred until the extension stabilizes and hosts pass conformance.
