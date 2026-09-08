---
title: "Rivet actors"
description: "Use Rivet wake and sleep scopes over the shared object durability engine."
---

One Rivet Actor hosts one object-backed Runtime partition. The application supplies S3 or native R2 transport, Crypto, and the executable resolver. Actor memory, schedules, and cron are compute lifecycle state and wake hints, not a second persistence authority.

## Configure an actor

Resolve each actor's stable key into its own canonical namespace. This configuration fragment assumes application-supplied storage, executable resolution, and address registrations from [object durability](./durable-stores.md); it does not run a model or create a bucket:

```ts
import { Schema } from "effect"
import { makeRuntimeActor, type RuntimeActorOptions } from "generalist/unstable/rivet"

const SessionKey = Schema.Tuple([Schema.String.check(Schema.isNonEmpty()), Schema.String.check(Schema.isNonEmpty())])

declare const storage: RuntimeActorOptions["storage"]
declare const resolver: RuntimeActorOptions["resolver"]
declare const addresses: RuntimeActorOptions["addresses"]

const runtimePartition = makeRuntimeActor({
  storage,
  resolver,
  addresses,
  namespace: ({ key }) => {
    const [tenant, rootSessionId] = Schema.decodeUnknownSync(SessionKey)(key)
    return { environment: "production", tenant, partition: `coding-${rootSessionId}` }
  },
})
```

`namespace` receives `{ actorId, key }` and returns schema-validated `environment`, `tenant`, and `partition` values. A key such as `["acme", "fix-average"]` opens `production / acme / coding-fix-average`; `["acme", "fix-login"]` opens a different partition in the same storage. The callback is synchronous and must be deterministic. Do not derive a namespace from a wake UUID or change the mapping on deployment: a different namespace opens different state, not a migrated Session.

`storage` supplies ObjectStore and Crypto; `resolver` reconstructs the executable. `drainFuel` bounds the candidates examined, not model/tool execution duration. `recoveryIntervalMillis` configures periodic reconciliation, including wakeups for otherwise idle actors. Install the current catalog peers `rivetkit@2.3.15` and `@standard-schema/spec@1.1.0`; optional compatibility with 2.3.10 is not established.

Register the actor with Rivet's `setup` and route each configured partition to a stable actor identity. Authentication, resource authorization, and routing belong to the application; untrusted input must not choose another tenant's namespace.

For an application-owned actor, `layerActorRuntime(context, options)` still takes explicit namespace values. Resolve them from the same authorized root identity. Keep coordinated child Runs and their Sessions in the parent's partition instead of independently assigning every child conversation another actor.

That lower-level Layer initializes services but no longer drains work during construction. A custom host calls `ActorRuntime.drain` from its owned background or scheduled action, observes `ActorRuntime.failure`, and closes its ManagedRuntime on shutdown. The factory provides this lifecycle wiring; merely building the Layer does not run pending assignments.

## Wake and shutdown

On wake, `makeRuntimeActor` constructs a scoped `ManagedRuntime`, installs the application resolver and object storage, arms a periodic recovery cron, and activates fresh object-journal ownership. Initial execution runs after startup rather than blocking actor readiness. A recovered long model/tool operation does not prevent the actor from accepting inspection or cancellation actions.

```text
onWake
└── Resolve namespace and initialize the Runtime

background execution / scheduled drain
├── Keep active work awake and observe shutdown
├── Drain eligible canonical work
└── Arrange the next wake hint

control action, while execution is active
└── Validate and commit the command through the same Runtime
```

Mutating actions validate their inputs and request a drain notification after their outcome is observed, including ambiguous failures that may need reconciliation. Cancellation and signal commands require explicit `commandId` values; retry the same payload with the same identity. Do not place control requests behind a lock held for an entire model/tool operation.

Schedules and cron only request a wake. The canonical journal decides whether work is pending, claimed, or terminal. If a post-commit notification is lost, later periodic reconciliation reads authoritative state rather than inferring success from notification delivery. An application-provided `reconcile` callback can include product-owned obligations in that bounded lifecycle.

An idle drain releases its Runtime once concurrent callers finish and no newer command invalidates that idle observation. A later action reopens the same namespace. Ownership failure retires the unusable host; sleep and destroy also dispose the owned `ManagedRuntime` and await its finalizers. Shutdown interrupts this host's work for recovery; it is not a user cancellation request. Cleanup is best-effort under platform termination, so recovery never depends on a sleep callback having run. Fresh ownership fences late canonical writes from obsolete attempts, but cannot undo an external request already dispatched.

## Limits and verification

The raw Rivet SDK is a compute-host integration. It does not provide a Generalist SQL backend or a different recovery format. Host tests and local object-service tests establish only their exercised scenarios; they do not certify a hosted Rivet deployment, AWS S3, or deployed R2. Keep the exact executable pins available across host replacement and exercise recovery under the application's actual routing and shutdown policy.

Next: read [recovery actions](./recovery.md) for unknown outcomes and [Cloudflare](./cloudflare.md) for another compute host over the same object engine.

## Related

- Source: `packages/generalist/src/unstable/rivet/actors/`
- Decision: [`rivet-actors-runtime-host.md`](../decisions/rivet-actors-runtime-host.md)
