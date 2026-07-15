# ADR-0038 — Runtime-dynamic Transport Capability

## Status

Accepted.

## Context

Transport registries and browser clients carry loose replay frames because a client may not import the server toolkit. SSE and WebSocket servers nevertheless encoded every registry frame with the startup toolkit codec. Agents that conditionally introduce `activate_skill` and then atomically register activated tools therefore produced valid runtime events that the strict startup codec rejected. The loose frame type was also aliased and cast to the strict compatibility type, hiding the actual reduced payload guarantee.

Strict toolkit codecs remain necessary for fixed capabilities: they prove exact tool names and parameter, success, and declared-failure schemas and reject unknown tools. Runtime-discovered capabilities cannot provide that static guarantee at endpoint construction, but they must retain all common frame and event validation and typed encoding failures.

## Decision

Transport server endpoints select an immutable capability at construction. `fixed` closes over a startup Effect AI toolkit and uses its strict event and server-frame schemas. `runtime-dynamic` uses the loose event and server-frame schemas whose tool names are strings and whose parameters/results are unknown. Passing a toolkit directly to the established codec, SSE, and WebSocket constructors remains source-compatible fixed shorthand; runtime-dynamic use is explicit.

`LooseEventType` and `LooseServerFrameType` are inferred from `LooseEventSchema` and `LooseServerFrame`. Shared schema builders preserve their decoded, encoded, and service views rather than widening through `Schema.Top`; strict compatibility assertions, where still required for toolkit-erased public types, do not type the loose path.

`SessionRegistry` and its bounded replay journal own loose frames without selecting an endpoint policy. SSE response schemas and responders select the same capability, and WebSocket handlers select once before attachment. Browser SSE and WebSocket clients always decode loose frames. A fixed endpoint may receive a loose registry value, but its strict schema validates the value effectfully and rejects an unknown or malformed tool through `WireEncodeError`; it does not cast the value into the strict type.

Runtime-dynamic transport changes validation, not authority. It does not register, authorize, or dispatch tools. Atomic tool-name collision detection remains upstream of model execution, and framework failures remain terminal `Failed` frames rather than completed tool results.

## Consequences

- Fixed endpoints retain exact toolkit validation and existing constructor source compatibility.
- Skill activation and runtime-discovered tools can stream and replay start, progress, and completion events through explicitly dynamic SSE and WebSocket endpoints.
- Runtime-dynamic consumers accept reduced tool payload guarantees while retaining validated common event/frame structure.
- Schema encoding remains lazy and failures remain typed; no endpoint introduces a new requirement, resource, queue, fiber, or concurrency policy.
- One registry can feed endpoints with different fixed construction-time policies without making replay storage responsible for execution capability.

## Migration

Fixed-tool hosts may keep passing a toolkit directly or make the policy explicit:

```ts
const capability = { capability: "fixed", toolkit } as const

Sse.streamSuccess(capability)
Sse.respond(capability)({ sessionId, request })
Ws.handle(capability)
```

Hosts whose agents activate skills or discover tools at runtime select the loose path for both SSE schema and responder or for the WebSocket handler:

```ts
const capability = { capability: "runtime-dynamic" } as const

Sse.streamSuccess(capability)
Sse.respond(capability)({ sessionId, request })
Ws.handle(capability)
```

## Related docs

- `docs/spec/07-skills.md`
- `docs/spec/11-transport.md`
- `docs/spec/decisions/ADR-0014-transport-wire-and-session-registry.md`
- `docs/spec/decisions/ADR-0015-transport-sse-websocket-client.md`
- `docs/spec/decisions/ADR-0032-atomic-tool-name-validation.md`
- `docs/spec/decisions/ADR-0034-tool-domain-and-framework-failures.md`
