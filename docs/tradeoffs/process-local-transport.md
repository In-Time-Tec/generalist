# Runtime-owned transport state

Transport projects the canonical `generalist/runtime` event stream instead of owning parallel execution state. This keeps SSE, WebSocket, snapshots, and reconnect cursors aligned with the Run store, at the cost of requiring a Runtime layer wherever transport is served.

Hidden transport durability was rejected. Hosts compose `generalist/durability` with S3 or native R2 and transport uses that same Runtime authority. Connections and notification queues remain disposable process state; durable cursors and snapshots recover observation. The cost is explicit object-store configuration even for a local durable server, while the ordinary process-local Agent loop remains storage-free.
