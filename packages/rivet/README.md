# @tenetkit/rivet

Rivet Actors host for the TenetKit durable Runtime.

```bash
bun add effect@4.0.0-rc.112 tenetkit@0.44.0 @tenetkit/rivet@0.44.0
```

Only the ESM `@tenetkit/rivet/actors` subpath is exported. Node 22+ and Bun 1.4+ are supported; CommonJS is not.

## Runtime actor

`makeRuntimeActor(options)` builds one Rivet Actor definition for one Runtime partition. Choose one actor key for every
set of Runs that must share a Runtime transaction domain, then register the definition with raw `rivetkit`:

```ts
import { makeRuntimeActor } from "@tenetkit/rivet/actors"
import { setup } from "rivetkit"

declare const addresses: Parameters<typeof makeRuntimeActor>[0]["addresses"]
declare const resolver: Parameters<typeof makeRuntimeActor>[0]["resolver"]

const registry = setup({
  use: {
    runtime: makeRuntimeActor({ addresses, resolver }),
  },
})

export default { fetch: (request: Request) => registry.handler(request) }
```

Clients call the nested `partition.runtime.send`, `signal`, `respond`, `cancel`, `resolveOperation`, `inspect`, and
`drain` actions. These actions use TenetKit Runtime's existing inputs and outputs rather than defining another payload,
transcript, operation, or scheduler format.

Actor-local SQLite is the only mutable Runtime authority. Run, operation, Session, event, claim, and activation facts
commit through the existing SQL lifecycle kernel. Rivet one-shot schedules and the persistent recovery cron are lossy
doorbells only: every wake backfills and drains durable activation rows before accepting normal work. A fresh wake also
atomically advances an actor-local host-incarnation row and recovers stale execution and Session claims under that new
owner identity. Unknown non-idempotent operations retain TenetKit's `needs-resolution` behavior and are not redispatched.

## Dependency and ownership boundary

The adapter pins raw `rivetkit@2.3.10`, whose runtime graph has no Effect dependency, and wraps its Promise-based
`RawAccess` at one boundary. The adapter never closes the actor-owned SQLite handle. SQL calls stay lazy, transaction
callbacks retain their Effect Context and typed Cause, interruption waits for a non-cancellable statement or rollback to
settle, and the Runtime's `ManagedRuntime` is disposed on actor sleep and destroy.

Do not add `@rivetkit/effect@2.3.10`: its published source calls Effect APIs absent from TenetKit's pinned Effect release
and cannot import under the supported Node runtime. `@standard-schema/spec@1.1.0` is a direct dependency because
RivetKit's public declarations reference it while RivetKit lists it only as a development dependency.

## Proven limits

The local suite uses Rivet's real NAPI actor engine to prove execution, the post-activation/pre-doorbell crash window,
hibernation, restart recovery, never-replay operation handling, Runtime disposal, and signal-listener cleanup. A focused
overlap test applied to Rivet engine source at commit `957d4e482f404913ca1955d8ecc357533f6fd081` separately proves that
a generation-1 SQLite page commit released after a generation-2 replacement write is rejected and changes zero
authoritative rows. No hosted Rivet resource was used, so these are SDK and pinned-engine guarantees rather than a claim
about a particular hosted deployment.

RivetKit 2.3.10 can log an upstream `transaction_closed` error while synchronizing its private schedule-event table as
an actor sleeps or a local registry shuts down. TenetKit does not close `RawAccess`; adding a second close or lifecycle
workaround would violate ownership. Durable activation recovery is independent of that diagnostic, but operators should
expect the log until Rivet fixes its schedule-sync shutdown ordering.
