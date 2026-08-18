# Runtime-owned transport state

Transport projects the canonical `tenetkit/runtime` event stream instead of owning parallel execution state. This keeps SSE, WebSocket, snapshots, and reconnect cursors aligned with the Run store, at the cost of requiring a Runtime layer wherever transport is served.

Hidden transport durability was rejected. `Runtime.layerMemory` is explicitly ephemeral; hosts that need recovery choose `Runtime.layerSqlite`, `Runtime.layerPostgres`, or `Runtime.layerMysql`, and transport uses that same Runtime service.
