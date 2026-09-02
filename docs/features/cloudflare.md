# Cloudflare

Three independent adapters run request-scoped Effects, persist Runtime state in a
Durable Object, and execute agent programs in fresh Worker Loader isolates.

## Usage

```ts
import { Effect, Schema } from "effect"
import { WorkerContext, make } from "generalist/unstable/cloudflare/workers"

const Bindings = Schema.Struct({ API_TOKEN: Schema.String })

export default make<{ readonly API_TOKEN: string }, never>((request) =>
  Effect.gen(function* () {
    const { bindings, executionContext } = yield* WorkerContext
    const { API_TOKEN } = yield* Schema.decodeUnknownEffect(Bindings)(bindings).pipe(Effect.orDie)

    executionContext.waitUntil(Promise.resolve())
    return Response.json({ method: request.method, configured: API_TOKEN.length > 0 })
  }),
)
```

## What runs

```text
fetch(request, { API_TOKEN: "secret" }, executionContext)
└── Effect.runPromise(Effect.scoped(...))
    ├── provide WorkerContext for this request
    ├── decode bindings → { API_TOKEN: "secret" }
    ├── executionContext.waitUntil(promise)
    ├── return Response { method: "GET", configured: true }
    └── close request scope and run finalizers
```

## Workers

`make` is a Web-standard Worker entrypoint: it requires no Node APIs or
`nodejs_compat`. `WorkerContext` exposes bindings and the native execution
context per request. `makeConfigProvider(bindings, ["API_TOKEN"])` can expose an
explicit binding allowlist through Effect `Config`.

## Durable Objects

```ts
const sqlLayer = layerSqlClient(state.storage)
const storeLayer = layerRunStore({ addresses: [] }).pipe(Layer.provide(sqlLayer))
const live = Layer.merge(sqlLayer, storeLayer)
```

`layerSqlClient` adapts Durable Object SQLite storage to Effect SQL.
`layerRunStore` installs the SQL Runtime stores and defaults their source to
`"durable-object"`; the Durable Object remains the scope owner.

### Hibernating WebSocket replay

```text
client          Durable Object             Runtime history
  │ Attach("run-1", cursor: -1) │                  │
  │────────────▶│ page(run-1, -1, limit: 1) ──────▶│
  │◀─ frame 0 ──│◀─────────────────────────────────│
  │             │ persist { runId: "run-1", cursor: 0 }
  │             │ flush("run-1")                   │
  │             │ page(run-1, 0, limit: 1) ───────▶│
  │◀─ frame 1 ──│◀─────────────────────────────────│
```

`HibernatingWebSocket.make({ state, runtime, pageSize, fuel })` returns native
`accept`, message, close, error, and bounded flush handlers. There is no
resident subscription, fiber, or timer. Attachments reconstruct replay after
hibernation; each socket serializes concurrent commands and flushes.

## Dynamic Workers

```text
execute({ requestId: "run-1:attempt-1", input: { value: 1 } })
├── CodeExecutor adapter → SandboxProvider.acquire(CPU, wall-clock)
├── Sandbox.exec(JavaScriptModule) → validate source digest and imports
├── loader.load(WorkerCode)
│   ├── fresh isolate; globalOutbound: null
│   ├── cpuMs: 50; subRequests: 3
│   └── __generalist_runner.js → program.js
├── capability RPC → strict decode → grant check → host service
└── bound response bytes → validate protocol identity → { value: 2 }
```

`make({ loader, compatibilityDate, capabilityBinding })` constructs the
production `CodeExecutor` as a thin adapter over the Worker Loader Sandbox leaf.
`generalist/unstable/sandbox/worker-loader` exposes that leaf as
`layerWorkerLoader`. Both paths use the same execution engine; there is no second loader path. Only relative
imports inside the exact module graph are accepted. Each execution gets a fresh
`v8-isolate`, bounded output, explicitly granted capabilities, and CPU,
subrequest, deadline, and cancellation limits. Files, pause, resume, snapshot,
and fork return typed `Unsupported` errors. `makeUnavailable(message)` returns a
typed `SandboxUnavailable` boundary.

## Invariants

- The three Cloudflare subpaths are independent; there is no exported `generalist/cloudflare` root.
- Worker request scopes finalize before `fetch` resolves.
- Durable Object SQLite transactions use the host storage transaction boundary.
- Replay defaults clamp `pageSize` to 1–1,000 and `fuel` to 1–32.
- A replay cursor advances only after its frame is sent and its attachment persists.
- Re-attaching the same run never rewinds its cursor; another run closes with code 1008.
- Socket close or error does not cancel a run; only a valid `Cancel` command does.
- Source rejects bare, computed, CommonJS, missing, escaping, and case-conflicting imports.
- Dynamic Worker outbound networking is disabled with `globalOutbound: null`.
- `v8-isolate` is an honest runtime boundary, not a container or microVM claim.
- Worker CPU limits count active execution; wall-clock deadlines also count waits on host capabilities and I/O.
- Cancellation, deadline, and Effect interruption stop the invocation and fence later host callbacks.
- Loader diagnostics are credential-redacted and truncated before becoming typed failures.

## Related

- Source: `packages/generalist/src/cloudflare/workers/`, `packages/generalist/src/cloudflare/durable-objects/`, `packages/generalist/src/cloudflare/dynamic-workers/`
- Examples: `examples/cloudflare-worker`
