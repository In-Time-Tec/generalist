# Host Generalist Runtime in Rivet Actors through the raw SDK

Generalist provides `generalist/unstable/rivet` over raw `rivetkit@2.3.15`. One Rivet Actor owns one Runtime partition, and
actor-local SQLite is the only mutable authority for Runs, operations, Sessions, events, claims, and activation rows.
Rivet actions, schedules, cron, and wake delivery do not become a second execution lifecycle.

This revises the earlier rejection after proving that a narrow raw-SDK boundary can satisfy the ownership contracts
without `@rivetkit/effect`. The package is pinned to Rivet tag `v2.3.15`, source commit
`499a33da859899840bfcf623b9eb47950e4b60ad`, and npm integrity
`sha512-3X5ggBlnSYOgUsxooBnMExzo9rIBk/mRNi2v+QxEFBeckIUDaxethM1j6GNaWAN2frLyvd6HSmt7lSfO3KmYaQ==`.

## Effect boundary

The raw SDK remains the supported boundary; `@rivetkit/effect` is not used. The Effect adapter evaluated at `2.3.10`
called `Schema.TaggedErrorClass`, which
`effect@4.0.0-rc.112` does not export; strict compilation and Bun import fail there, while Node rejects TypeScript under
`node_modules`. A second Effect, source patch, deep import, or erased cast would not repair that contract.

Raw `rivetkit@2.3.15` has no Effect dependency. The adapter therefore wraps only its Promise-based actor context and
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
before authoritative storage. The exact 2.3.15 source retains the earlier read and single-shot commit fence and adds
staged commits that validate generation at begin, every segment, and finalize; Depot also binds each stage to its
generation and transaction ID. Its upstream `sqlite_generation` suite covers mismatched generation before Depot and the
pending-start case. Generalist's SDK tests add close/reopen coverage for the application-visible Runtime authority.

## Distribution and residual limit

The package exposes only ESM `generalist/unstable/rivet`. Raw RivetKit advertises CommonJS outputs, but that path is not part
of Generalist's support claim.

No hosted Rivet resource was created. Local real-NAPI tests and review of the pinned engine source cover the SDK and engine
contracts needed by this adapter, not the configuration of a particular hosted deployment. RivetKit 2.3.15 can also log
an upstream `transaction_closed` error when its private schedule-alarm synchronization races actor sleep or registry
shutdown. Generalist does not close `RawAccess`, and its durable activation recovery does not depend on that private sync;
an extra close or lifecycle workaround would violate ownership, so the diagnostic remains documented rather than hidden.
