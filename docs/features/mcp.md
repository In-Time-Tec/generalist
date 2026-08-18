# MCP

`tenetkit/mcp` owns remote discovery, tool-call adaptation, and OAuth protocol mechanics. Hosts own browser and callback UI, client configuration, and secure token persistence.

Remote discovery schemas and structured results decode as `Schema.Json` on typed error channels. OAuth state uses platform cryptography; one synchronized flow owns state, PKCE, discovery, callback exchange, refresh, and invalidation. Callback attempts consume matching state even when malformed, denied, or failed. Token stores receive redacted, versioned, schema-validated documents and never expose secrets in public errors.

`route` scopes one MCP connection, one discovered toolkit, its handlers, and the matching TenetKit executor. Releasing the scope closes the connection. Calls preserve interruption and optional finite timeouts; the route adds no detached work, queue, or retry policy.
