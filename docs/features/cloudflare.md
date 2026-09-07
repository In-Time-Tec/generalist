---
title: "Cloudflare"
description: "Host object-backed Runtime execution and bounded programs with independent Cloudflare adapters."
---

Three independent adapters run request-scoped Effects, host the object-backed Runtime in a
Durable Object, and execute agent programs in fresh Worker Loader isolates. Native R2 is
storage authority; Durable Object storage is not a Generalist database.

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
import * as DurableObjects from "generalist/unstable/cloudflare/durable-objects"
import type * as R2 from "generalist/durability/r2"

declare const bucket: R2.Bucket

const runtime = DurableObjects.layer({
  bucket,
  environment: "development",
  tenant: "example-team",
  partition: "assistant",
  addresses: [],
  schedulerMode: "external",
})
```

This is a binding fragment: supply the application's native R2 binding, Worker-compatible
Crypto, pinned executable resolver, and an owned scope. `layer` reconstructs and activates
the shared object Runtime; `layerRunStore` supplies storage without starting execution.
The Durable Object owns the scope and alarms only accelerate wakeup.

Run `reconcile(options, fuel?)` from an independent Cron Trigger or queue consumer for
every configured partition. It activates, drains bounded work, and closes the scope.
A lost alarm cannot erase a canonical wait or schedule, but a host that never reconciles
can strand it. Neither alarm delivery nor Durable Object identity is a commit receipt.

Qualification is local Miniflare/workerd, including the committed exact-EOF range patch
and the emulator's native/S3 gateway boundary. Deployed R2 and full host acceptance are
not certified by those checks; see [object durability](./durable-stores.md).

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
- All canonical Runtime state and ownership fencing use the shared object-journal protocol.
- Source rejects bare, computed, CommonJS, missing, escaping, and case-conflicting imports.
- Dynamic Worker outbound networking is disabled with `globalOutbound: null`.
- `v8-isolate` is an honest runtime boundary, not a container or microVM claim.
- Worker CPU limits count active execution; wall-clock deadlines also count waits on host capabilities and I/O.
- Cancellation, deadline, and Effect interruption stop the invocation and fence later host callbacks.
- Loader diagnostics are credential-redacted and truncated before becoming typed failures.

## Related

- Source: `packages/generalist/src/unstable/cloudflare/workers/`, `packages/generalist/src/unstable/cloudflare/durable-objects/`, `packages/generalist/src/unstable/cloudflare/dynamic-workers/`
- Examples: `examples/cloudflare-worker`
