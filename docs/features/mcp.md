# MCP

MCP connects one scoped SDK transport, discovers its remote tools once, and
returns the matching Effect AI toolkit, handlers, and Generalist executor.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware } from "generalist"
import { make as makeHttp } from "generalist/unstable/mcp/client/http"
import { connect } from "generalist/unstable/mcp/tools"

const program = Effect.gen(function* () {
  const tools = yield* connect({
    name: "calc",
    transport: makeHttp({ url: "https://mcp.example/rpc" }),
    callTimeout: "30 seconds",
  })
  const agent = Agent.make({ name: "calculator", toolkit: tools.toolkit })
  const services = yield* Layer.build(
    Layer.mergeAll(tools.executorLayer, Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
  )
  return yield* Agent.run(agent, "Add 20 and 22").pipe(Effect.provide(services))
}).pipe(Effect.scoped)
```

## What runs

```text
Effect.scoped(program)
└── connect({ name: "calc", transport })
    ├── Client.connect(transport)
    ├── Client.listTools()                 once
    │   └── "add" -> Effect AI "calc_add"
    └── MCPTools { toolkit, executorLayer }
        └── Agent.run("Add 20 and 22")
            └── ToolExecutor.execute("calc_add", { a: 20, b: 22 })
                └── Client.callTool("add", { a: 20, b: 22 }) -> "42"
└── scope release -> Client.close()
```

## OAuth lifecycle

```text
Host              OAuth.Service       SDK / auth.example
 │ authorize()          │                     │
 │─────────────────────>│ state="s_A1"        │ discover
 │<─ { url, "s_A1" } ──│ verifier="v_B2"     │
 │ open(url) ────────────────────────────────>│
 │ callback(code="c_3", state="s_A1")        │
 │─────────────────────>│ consume state/PKCE  │ exchange
 │                      │<─────────────────────│ tokens
 │                      │ save Redacted(v1 JSON)
 │ transport request ──>│ load -> refresh ───>│
 │                      │ save replacement tokens
```

```text
Idle ── authorize or SDK redirect ──> Pending(state, PKCE, url)
Pending
 ├── matching callback -> Idle, then exchange
 ├── denial/malformed/exchange failure -> Idle
 └── wrong/replayed state -> OAuthExpired
```

Discovery, authorization, callback exchange, refresh, and invalidation share
one synchronized lifecycle. Failures are `OAuthPending`, `OAuthDenied`,
`OAuthExpired`, or sanitized `OAuthProviderError` values.

## Invariants

- `connect` owns one connection, one discovered toolkit, its Effect AI handlers,
  and the matching `ToolExecutor` layer; releasing its scope closes the client.
- Tool discovery and structured tool results decode as `Schema.Json` on typed
  error channels; remote names are exposed as `<server>_<rawName>`.
- MCP failures become failed Generalist tool results. MCP tools never suspend.
- Calls preserve interruption and optional finite timeouts; MCP adds no retries, queues,
  or detached fibers.
- Streamable HTTP is Worker-safe and accepts `requestInit` and OAuth. Stdio is
  an explicit Node/Bun-only opt-in; the base client accepts any SDK `Transport`.
- OAuth state and PKCE use platform cryptography. Matching callback state is
  consumed before malformed, denied, successful, or failed exchange outcomes.
- Token stores receive schema-validated, versioned JSON inside `Redacted`;
  public OAuth errors never contain token secrets. Legacy token JSON is read and
  rewritten as version 1.
- Hosts own browser/callback UI, OAuth client configuration, and secure token
  persistence.
- HTTP headers are constructed at the process/request boundary. Raw bearer
  credentials are not executable identity or persisted registration config;
  reconstruction data contains only a host-owned secret reference.
- Generalist toolkits can be registered directly with Effect's
  `McpServer.toolkit`; no Generalist server wrapper is required.
- `examples/mcp-toolkit-server` explicitly uses the legacy `2025-06-18`
  Streamable HTTP adapter. Effect has no `2026-07-28` adapter yet, so the example
  is not evidence of current-revision support.
- There is no generic `serveAgent()`: a host must expose bounded tools because
  prompt visibility, budgets, cancellation, tenant scope, and approvals cannot
  be inferred safely.
- MCP Tasks API support remains deferred until the extension stabilizes and
  hosts pass conformance.

## Related

- Source: `packages/generalist/src/mcp/...`
- Site: `/docs/guides/mcp`, `/docs/reference/mcp`
