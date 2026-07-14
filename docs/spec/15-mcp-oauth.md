# 15 — MCP OAuth

`@batonfx/mcp` owns the OAuth protocol lifecycle used by remote MCP transports. Hosts own user interaction and secure token persistence.

## Contract

- `OAuth.authorize` performs MCP authorization-server discovery and returns the authorization URL containing SDK-generated PKCE and a session state value.
- OAuth state is generated from Effect's platform `Crypto` service with 256 bits of secure randomness. Applications provide their platform crypto layer; deterministic tests may provide `Crypto.make`.
- `OAuth.pending` exposes the current authorization URL and state captured from the SDK. If an authenticated remote transport triggers authorization during connection, its layer fails with `OAuthPendingError` carrying that URL instead of erasing the state into `McpConnectionError`.
- `OAuth.callback` atomically consumes and validates state before reporting denial or exchanging the authorization code. Every callback attempt consumes its matching state, including denied and failed exchanges, so replayed, unsolicited, or replaced callbacks fail expired.
- The MCP SDK refreshes expired access tokens before transport use and stores every replacement through `OAuth.TokenStore`.
- Optional pre-registered client information is kept in session state. When omitted, the provider stores SDK dynamic registration results and honors client, token, verifier, and all-credential invalidation scopes.
- OAuth resource and authorization-server discovery state is retained across callback exchange and honors discovery/all invalidation. Transport connection, explicit authorization, callback exchange, and clearing are serialized per OAuth service so one active lifecycle cannot replace another's state, verifier, discovery data, or pending URL.
- Provider-boundary persistence failures are retained for the serialized transport attempt and take precedence over a later SDK redirect when the SDK treats a refresh failure as recoverable.
- `OAuth.TokenStore` receives only `Redacted<string>` token documents. Production hosts provide secure persistence; the package provides memory and deterministic test layers.
- Remote HTTP transports accept the public `OAuth.Interface` and pass its provider to the public MCP SDK transport API. Reconnect loads tokens from the store and never adds tokens to errors, URLs, or Baton's public values.

## Errors

Pending authorization, denial, expired callback state, and provider failures remain distinct schema-backed tagged errors. Provider failures identify the server and operation but do not copy opaque SDK or persistence failure text into public errors. Remote layer errors preserve `OAuthProviderError`; all generic MCP connection messages are stable rather than copying opaque SDK or server response text. Error fields never contain access tokens, refresh tokens, client secrets, or PKCE verifiers.

## Ownership

Baton owns discovery, PKCE, state validation, code exchange, refresh integration, and transport composition. Hosts own browser launch, callback routing, client configuration, and encrypted-at-rest persistence.

## Decision

The stable ownership decision is recorded by `ADR-0023-mcp-oauth-lifecycle.md`.
