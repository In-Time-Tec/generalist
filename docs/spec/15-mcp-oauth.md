# 15 — MCP OAuth

`@batonfx/mcp` owns the OAuth protocol lifecycle used by remote MCP transports. Hosts own user interaction and secure token persistence.

## Contract

- `OAuth.authorize` performs MCP authorization-server discovery and returns the authorization URL containing SDK-generated PKCE and a session state value.
- `OAuth.callback` validates state, reports denial, and exchanges the authorization code. A callback after its state was consumed or replaced fails expired.
- The MCP SDK refreshes expired access tokens before transport use and stores every replacement through `OAuth.TokenStore`.
- `OAuth.TokenStore` receives only `Redacted<string>` token documents. Production hosts provide secure persistence; the package provides memory and deterministic test layers.
- Remote HTTP transports accept the public `OAuth.Interface` and pass its provider to the public MCP SDK transport API. Reconnect loads tokens from the store and never adds tokens to errors, URLs, or Baton's public values.

## Errors

Pending authorization, denial, expired callback state, and provider failures remain distinct schema-backed tagged errors. Error fields never contain access tokens, refresh tokens, client secrets, or PKCE verifiers.

## Ownership

Baton owns discovery, PKCE, state validation, code exchange, refresh integration, and transport composition. Hosts own browser launch, callback routing, client configuration, and encrypted-at-rest persistence.

## Decision

The stable ownership decision is recorded by `ADR-0023-mcp-oauth-lifecycle.md`.
