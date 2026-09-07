---
title: "Rivet actors"
description: "Use Rivet wake and sleep scopes over the shared object durability engine."
---

One Rivet Actor hosts one object-backed Runtime partition. The application supplies S3 or native R2 transport, Crypto, and the executable resolver. Actor memory, schedules, and cron are compute lifecycle state and wake hints, not a second persistence authority.

## Configure an actor

This configuration fragment wraps a fully supplied actor configuration; obtain object transport and namespace options from [object durability](./durable-stores.md):

```ts
import { makeRuntimeActor, type RuntimeActorOptions } from "generalist/unstable/rivet"

declare const options: RuntimeActorOptions
const runtimePartition = makeRuntimeActor(options)
```

`options` includes explicit `environment`, `tenant`, `partition`, and address registrations, plus `storage` (ObjectStore and Crypto) and `resolver` Layers. `drainFuel` bounds scheduler work, and `recoveryIntervalMillis` configures periodic reconciliation. Install the current catalog peers `rivetkit@2.3.15` and `@standard-schema/spec@1.1.0`; optional compatibility with 2.3.10 is not established.

Register the actor with Rivet's `setup` and route each configured partition to a stable actor identity. Authentication, resource authorization, and routing belong to the application; untrusted input must not choose another tenant's namespace.

## Wake and shutdown

On wake, `makeRuntimeActor` constructs a scoped `ManagedRuntime`, installs the application resolver and object storage, arms a periodic recovery cron, activates fresh object-journal ownership, and drains bounded work. Mutating actions validate their inputs and request a drain notification after success. Cancellation and signal commands require explicit `commandId` values; retry the same payload with the same identity.

Schedules and cron only request a wake. The canonical journal decides whether work is pending, claimed, or terminal. If a post-commit notification is lost, later periodic reconciliation reads authoritative state rather than inferring success from notification delivery. An application-provided `reconcile` callback can include product-owned obligations in that bounded lifecycle.

Sleep and destroy dispose the owned `ManagedRuntime` and await its finalizers. That interrupts this host's work for recovery; it is not a user cancellation request. Fresh ownership fences late canonical writes from obsolete attempts, but cannot undo an external request already dispatched.

## Limits and verification

The raw Rivet SDK is a compute-host integration. It does not provide a Generalist SQL backend or a different recovery format. Host tests and local object-service tests establish only their exercised scenarios; they do not certify a hosted Rivet deployment, AWS S3, or deployed R2. Keep the exact executable pins available across host replacement and exercise recovery under the application's actual routing and shutdown policy.

Next: read [recovery actions](./recovery.md) for unknown outcomes and [Cloudflare](./cloudflare.md) for another compute host over the same object engine.

## Related

- Source: `packages/generalist/src/unstable/rivet/actors/`
- Decision: [`rivet-actors-runtime-host.md`](../decisions/rivet-actors-runtime-host.md)
