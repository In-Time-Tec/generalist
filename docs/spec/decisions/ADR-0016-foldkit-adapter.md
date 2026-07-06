# ADR-0016 — FoldKit Adapter

## Status

Accepted.

## Context

FoldKit applications need a small adapter that turns Baton transport streams and client commands into FoldKit resources, subscriptions, commands, and a headless chat submodel. Baton must stay standalone and non-durable; Relay remains the durable runtime that can provide its own transport registry later.

## Decision

Add `@batonfx/foldkit` as a package that peer-depends on FoldKit and Effect, depends on `@batonfx/transport`, and exports `Connection` and `Chat` namespaces. The adapter uses a static FoldKit runtime `resources` layer for a shared `AgentConnection`, a WebSocket-backed connection layer, FoldKit command definitions that convert failures into messages, and a pure replay-idempotent chat update.

Hosts open sessions through their own route or direct registry call, then pass the opened `sessionId` into the `Chat` model. The adapter does not define an `OpenSession` wire frame or a generic session-opening HTTP route.

The adapter also exposes foldcn-aligned view-data helpers for prompt input status, tool status, and conversation rows. These helpers remain pure data mappers and do not import or own styled FoldCN component source.

The adapter does not define styled views, EventSource wrappers, generic SSE command routes, Relay behavior, or durable execution semantics.

## Consequences

- FoldKit apps can embed a Baton chat submodel without adopting Relay.
- Relay can still compose at a higher layer by providing durable transport/session behavior.
- SSE command routing remains host-owned until the transport spec defines a command POST contract.

## Related docs

- `docs/spec/12-foldkit-adapter.md`
