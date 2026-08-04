# `@batonfx/a2a`

A2A v1 server projection over the authoritative `@batonfx/runtime` Run lifecycle.

## Install

```sh
bun add effect @a2a-js/sdk @batonfx/runtime @batonfx/a2a
```

## Configure

```ts
import { A2A } from "@batonfx/a2a"
import { Address } from "@batonfx/runtime"

const A2ALive = A2A.layer({
  address: Address.make("agent:assistant"),
  card,
})
```

Provide `A2ALive` with the same `Runtime.Runtime` Layer used by the worker host. The service exposes a v1 SDK `DefaultRequestHandler` as `A2A.A2A.handler` for JSON-RPC, HTTP+JSON, or gRPC transport composition.

The SDK `TaskStore` is a read projection. It does not persist A2A lifecycle state: task snapshots, history, listing, waits, cancellation, and terminal outcomes always come from Runtime. New A2A task IDs are passed to Runtime as caller-selected Run IDs, so `Task.id === RunId` across waits and resumes.

Remote input accepts only `ROLE_USER` `text/plain` text parts and `application/json` data parts. File, URL, agent-role, unspecified-role, and mismatched media content is rejected before Runtime admission.
