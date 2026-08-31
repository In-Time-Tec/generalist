# Host Generalist Runtime in Rivet Actors through the raw SDK

Generalist provides `generalist/rivet/actors` over raw `rivetkit@2.3.10`. One Rivet Actor owns one Runtime partition, and
actor-local SQLite is the only mutable authority for Runs, operations, Sessions, events, claims, and activation rows.
Rivet actions, schedules, cron, and wake delivery do not become a second execution lifecycle.

This revises the earlier rejection after proving that a narrow raw-SDK boundary can satisfy the ownership contracts
without `@rivetkit/effect`. The package is pinned to Rivet tag `v2.3.10`, source commit
`957d4e482f404913ca1955d8ecc357533f6fd081`, and npm integrity
`sha512-E+H0lBc3O8dK9Pj7W2XW3VwrCnfpwYYm5LlsZyHrmk5bCrJIBdnEFdZXn5nsYMz0waCfP1ieyP6d1tdvBG76Dg==`.

## Effect boundary

`@rivetkit/effect@2.3.10` remains unusable. Its published TypeScript calls `Schema.TaggedErrorClass`, which
`effect@4.0.0-rc.112` does not export; strict compilation and Bun import fail there, while Node rejects TypeScript under
`node_modules`. A second Effect, source patch, deep import, or erased cast would not repair that contract.

Raw `rivetkit@2.3.10` has no Effect dependency. The adapter therefore wraps only its Promise-based actor context and
`RawAccess`. SQL Effects remain lazy; calls fail with typed `SqlError`; transaction callbacks retain their Effect Context
and original typed Cause; statements serialize; interruption waits for a non-cancellable statement or rollback to
settle; nested transactions fail; and the adapter never closes the actor-owned handle. The scoped `ManagedRuntime` is
disposed on sleep and destroy. Public actions use Standard Schema inputs and direct Generalist Runtime values, not an RPC
envelope. `@standard-schema/spec@1.1.0` is direct because RivetKit's declarations reference it but its manifest lists it
only for development.

## Durable wake and recovery

Every authoritative Runtime transaction updates `generalist_activations` through the shared SQL lifecycle kernel. A
successful action requests a one-shot schedule only after commit. A persistent Rivet cron and every fresh actor wake
backfill and drain those rows with bounded fuel. Therefore a crash after activation commit but before scheduling can
delay work but cannot lose it, and duplicate schedules converge through the existing claim predicates. The local NAPI
actor fault test commits admission without a doorbell, forces sleep, and proves replacement startup executes once;
repeated drains leave the model call count at one.

A fresh wake atomically increments the actor-local `generalist_rivet_host` incarnation row, uses it as the new Runtime
owner, and recovers every stale Run plus its exact Session writer claim before drain. The Runtime's existing operation
journal remains authoritative. A separate registry shutdown/reopen test interrupts a never-replay model operation, then
proves the reopened Run is `needs-resolution`, the replacement model is called zero times, actor host state is cleared,
and process signal-listener counts return to baseline.

## Stale-generation fence

Rivet's public actor context does not expose generation, so Generalist cannot manufacture its own actor-generation token.
The pinned engine carries generation internally on remote SQLite execution, page reads, and page commits and validates it
before authoritative storage. A focused overlap test was applied to a checkout at the pinned engine commit, rather than
inferring the result from API shape:

1. Generation 1 committed an initial SQLite authority database and retained dirty pages representing a paused
   transaction that would insert `stale-generation`.
2. The actor slept and generation 2 activated.
3. Generation 2 inserted `replacement-generation` through remote SQLite.
4. The generation-1 page commit was released with its original head transaction and was rejected.
5. Authoritative generation-2 queries returned zero stale rows and one replacement row.

After adding that focused test, the isolated pinned-source command passed one exact test:

```bash
RIVET_TEST_DATABASE=filesystem RIVET_TEST_PUBSUB=memory \
  cargo test -p rivet-engine --test generalist_generation \
  envoy::sqlite_generation::stale_generation_cannot_commit_paused_transaction_after_replacement_write \
  -- --ignored --exact --nocapture
```

The ordinary upstream aggregate test target could not be used because unrelated checked-in runner tests at that commit
do not compile against their generated API shapes; an isolated target loaded the existing envoy test support and the
added overlap test only. This proves the pinned engine mechanism. A different Rivet engine version must repeat the
overlap proof before the adapter pin changes.

## Distribution and residual limit

The package exposes only ESM `generalist/rivet/actors`. Raw RivetKit advertises CommonJS outputs, but that path is not part
of Generalist's support claim; clean Node and Bun ESM consumers are verified, and package smoke proves CommonJS resolution
is blocked, the declaration dependency is installed, and only one Effect runtime exists.

No hosted Rivet resource was created. Local real-NAPI tests and the pinned engine source test prove the SDK and engine
contracts needed by this adapter, not the configuration of a particular hosted deployment. RivetKit 2.3.10 can also log
an upstream `transaction_closed` error when its private schedule-alarm synchronization races actor sleep or registry
shutdown. Generalist does not close `RawAccess`, and its durable activation recovery does not depend on that private sync;
an extra close or lifecycle workaround would violate ownership, so the diagnostic remains documented rather than hidden.
