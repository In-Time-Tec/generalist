# ADR-0023 — MCP OAuth Lifecycle

## Status

Accepted

## Decision

Baton exposes an Effect service for MCP OAuth and adapts it to the public `OAuthClientProvider` extension point of the MCP SDK. Token persistence is an injected host-owned service whose values are `Redacted`. Baton does not own browser UI, callback HTTP servers, or durable secret storage.

## Consequences

External consumers can compose authenticated remote MCP transports without SDK deep imports. SDK protocol behavior remains upstream-owned while Baton provides typed lifecycle and storage boundaries. Reconnection and refresh reuse persisted credentials without placing them in transport configuration headers, logs, errors, or callback URLs.
