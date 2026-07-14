# ADR-0023 — MCP OAuth Lifecycle

## Status

Accepted

## Decision

Baton exposes an Effect service for MCP OAuth and adapts it to the public `OAuthClientProvider` extension point of the MCP SDK. Token persistence is an injected host-owned service whose values are `Redacted`. Baton does not own browser UI, callback HTTP servers, or durable secret storage.

Callback state is single-use for every terminal callback attempt: Baton atomically consumes matching state before denial handling or code exchange. Provider errors expose stable operation context instead of forwarding opaque SDK or persistence messages that could contain credentials.

The OAuth service exposes SDK-captured pending authorization as Effect state. Authenticated HTTP transport connection preserves that state as `OAuthPendingError`, allowing a host to launch its browser flow without importing or interpreting SDK errors.

OAuth state uses the Effect platform `Crypto` service rather than pseudo-random generation. Dynamic client registration is retained for the service lifetime when static client information is absent. Failed transport connection remains scoped for cleanup, preserves typed OAuth provider failures, and sanitizes generic connection messages.

The provider retains SDK discovery state across the browser round-trip. A single-permit Effect semaphore serializes transport connection with explicit authorization, callback exchange, and clearing. Provider-boundary persistence failures are latched only for that serialized transport attempt so SDK recovery cannot replace a storage failure with a pending redirect.

## Consequences

External consumers can compose authenticated remote MCP transports without SDK deep imports. SDK protocol behavior remains upstream-owned while Baton provides typed lifecycle and storage boundaries. Reconnection and refresh reuse persisted credentials without placing them in transport configuration headers, logs, errors, or callback URLs.
