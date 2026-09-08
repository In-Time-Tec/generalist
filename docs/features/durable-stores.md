---
title: "Object durability"
description: "Configure the shared object-storage engine, understand commit uncertainty, and recover a retained namespace."
---

Use `generalist/durability` when accepted work must survive the process that accepted it. S3 and native R2 are transports for the same canonical engine and object format, not different Runtime backends. Ordinary `Agent.run` calls remain process-local and need no durable storage.

All public exports remain `@experimental`. Clean v1 has no SQL Generalist backends, alternate production memory/filesystem Runtime, compatibility aliases, legacy readers, or migration path. Use fresh namespaces. Implementation is not full acceptance, release readiness, provider certification, or a verified performance claim.

## Local qualification without cloud credentials

The repository's local acceptance uses the production S3 client against Docker-backed MinIO and native R2 against persistent Miniflare/workerd:

```bash
bun install --frozen-lockfile
bun --bun vitest run packages/generalist/test/durability/object-store.test.ts --no-file-parallelism
```

Use Bun 1.4.0 and a running Docker daemon. The suite provisions disposable local credentials and tests conditional creation, lost acknowledgements, service restart, and shared-bucket native/S3 contention through Miniflare's gateway. It does not require cloud accounts or model keys. Missing Docker or skipped service tests leave the local gate unmet.

The local pins are MinIO `RELEASE.2025-04-22T22-12-26Z`, Miniflare `5.20260811.1-alpha`, and workerd `1.20260819.1`. The committed Miniflare patch corrects exact-EOF range handling (`offset >= size`). This is patched-emulator and gateway evidence, not AWS S3, deployed R2, or arbitrary S3-compatible-provider certification. Do not run remote qualification or request cloud credentials for local acceptance.

## Prerequisites

- Bun 1.4+ for the example below, the matching Effect platform package, and a configured object service. A local MinIO bucket needs only disposable local credentials; optional live buckets incur provider charges and are not certified by the local suite.
- Credentials allowed to read, conditionally create, and list objects in the selected namespace. Normal Runtime credentials do not need deletion or bucket-administration permission.
- Explicit environment, tenant, and partition identities. Keep these stable across restarts; changing them opens different state.
- A compatible executable build and its pinned resolver registrations. The bucket cannot reconstruct arbitrary application code or replace credentials for external services.

```bash
bun add generalist effect@4.0.0-rc.112 @effect/platform-bun@4.0.0-rc.112 @aws-sdk/client-s3@3.1124.0 @smithy/fetch-http-handler@5.7.2
export GENERALIST_BUCKET="your-generalist-bucket"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export GENERALIST_ENVIRONMENT="development"
export GENERALIST_TENANT="example-team"
export GENERALIST_PARTITION="recovery-demo"
```

Use a fresh, dedicated development namespace, not an existing deployment's partition. Temporary credentials also need their session token; see the transport configuration below.

## Run through S3

Save this as `index.ts` and run `bun index.ts`. The model is scripted: no model API key is needed. The base fragment below addresses the configured S3 bucket; for local MinIO, compose the custom-endpoint transport shown next with its region, disposable credentials, and `forcePathStyle: true`.

```ts
import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer } from "effect"
import { Agent } from "generalist"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import * as TestModel from "generalist/testing/model"

const assistant = Agent.make({ name: "durability-demo" })
const services = Layer.unwrap(
  Effect.gen(function* () {
    const bucket = yield* Config.string("GENERALIST_BUCKET")
    const region = yield* Config.string("AWS_REGION")
    const accessKeyId = yield* Config.string("AWS_ACCESS_KEY_ID")
    const secretAccessKey = yield* Config.string("AWS_SECRET_ACCESS_KEY")
    const environment = yield* Config.string("GENERALIST_ENVIRONMENT")
    const tenant = yield* Config.string("GENERALIST_TENANT")
    const partition = yield* Config.string("GENERALIST_PARTITION")
    const storage = Layer.merge(
      S3.layer({ bucket, region, credentials: { accessKeyId, secretAccessKey } }),
      BunCrypto.layer,
    )
    return Layer.merge(
      Durability.layer({ environment, tenant, partition, addresses: [] }).pipe(
        Layer.provide(storage),
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      TestModel.layer([TestModel.text("An acknowledged Run can be recovered from its object namespace.")]),
    )
  }),
)

await Effect.gen(function* () {
  yield* Durability.activate
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(assistant)
  const run = yield* runtime.start(assistant, "Explain durability", {
    sessionId: "durability-demo",
    idempotencyKey: "answer-1",
  })
  yield* Console.log(run.runId, yield* run.await)
}).pipe(Effect.scoped, Effect.provide(services), Effect.runPromise)
```

The command prints a Run ID and the scripted answer. A second invocation uses the same Session and idempotency key to retrieve the accepted Run, rather than admitting another one. A new input under that identity is a conflict, not a request to overwrite the old Run. The owned Layer scope closes when the effect exits. For an explicit close/reopen comparison, use [five-minutes](/start/examples#local-and-object-recovery-in-five-minutes).

`Durability.layer(options)` provides Runtime, RunStore, executor, and scheduler services. `layerRunStore(options)` provides storage without owning an execution loop. Both require an ObjectStore and Crypto; the full Runtime also requires `ExecutableResolver`. Neither selects a fallback store when configuration is missing.

## Transport configuration

`S3.layer` accepts resolved values, not Effect `Config` values. Resolve application configuration with `Layer.unwrap` as above. Its options include `bucket`, `region`, `endpoint?`, `forcePathStyle?`, `credentials?`, and `requestTimeoutMs?`. Credentials may be `{ accessKeyId, secretAccessKey, sessionToken? }` or an AWS SDK refreshing credential provider. Use the latter for a long-lived host with expiring credentials; do not log secrets.

For a qualified custom endpoint, the following is a **configuration fragment**:

```ts
import * as S3 from "generalist/durability/s3"

declare const bucket: string
declare const endpoint: string
declare const accessKeyId: string
declare const secretAccessKey: string

const objects = S3.layer({
  bucket,
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  capabilities: {
    conditionalCreate: true,
    strongReadAfterWrite: true,
    consistentListing: true,
  },
})
```

Use `region: "auto"` for the R2 S3 endpoint; other providers may require a different region. Set `forcePathStyle: true` only when the endpoint requires path-style addressing. `capabilities` is an operator assertion of documented, tested semantics, not a probe or certification. Do not set it merely to silence an initialization failure.

Inside a Worker, native R2 avoids separate S3 credentials. This **binding fragment** receives the application's R2 binding:

```ts
import * as R2 from "generalist/durability/r2"

declare const bucket: R2.Bucket
const objects = R2.layer(bucket)
```

Provide this Layer to the same durability engine with a Worker-compatible Crypto Layer and executable resolver. [Cloudflare hosting](/features/cloudflare) adds lifecycle integration. Read canonical state through the binding or direct object API, never an R2 public cached domain.

## Provider contract and support limits

A usable provider must preserve complete bytes, atomically create an absent key, expose acknowledged writes through strong direct reads, and list correctly across every page. Generalist uses its own SHA-256 digests; ETags are opaque provider tokens, not content hashes. The normal ObjectStore surface has `read`, `create`, and `list`, with no unconditional overwrite or delete.

S3 and native R2 are the transport targets. An S3-shaped API alone is insufficient. Current qualification is local-only MinIO and Miniflare/workerd; AWS and deployed R2 are not certified. Simulator or emulator results do not certify a live provider. No throughput, cold-recovery, memory ceiling, or cross-region latency claim is established here.

## Local workload baseline

Run `bun scripts/durability-benchmark.ts` to collect a deterministic ObjectStore-simulator baseline. The checked-in report at `artifacts/durability-benchmark/local-simulator-58eba620-linux-x64.json` records the exact source commit, dirty status, benchmark-script SHA-256, Bun/runtime platform, seed, page size, concurrency, payload sizes, metric definitions, and raw request/byte deltas.

The baseline exercises hot-partition contention, independent partitions, a long admission history with fresh-layer recovery, bounded 64 KiB BlobStore payloads, release-and-reclaim owner replacement, and no-due-work scans. It reports p50, p95, p99, and maximum latency for durable admission, Runtime terminal outcome commit, reward mutation, state read, cold recovery, artifact write, owner replacement, and idle scans. The program fails if request/byte counters are negative or inconsistent, or if a no-due-work scan creates an object or attempts to write bytes. The payload workload stays within the BlobStore byte cap.

This is a reproducible local simulator baseline, not a latency promise or provider benchmark. Its scripted Runtime workloads persist await-event suspensions, reopen fresh hosts, and complete through both a direct wake and an expired deadline processed by `LocalScheduler.tick` and `idle`; dispatch counters assert that neither path reruns the waiting tool. A deterministic two-client CAS workload pauses the first exact commit create, lets the second writer win, and asserts one losing-reducer retry before both commits recover. The report also measures a divergent idempotency conflict followed by exact retry and samples RSS/heap through the local process host boundary. Its `ToolOutput` workload retains and rereads the full result from a process-memory test callback, then verifies the actual UTF-8 preview length returned by the production bound; this is projection evidence, not durable BlobStore output persistence.

The S3 transport uses ordinary general-purpose buckets and single-object writes. Bucket versioning, Object Lock, multipart conditional completion, native sidecars, and bucket administration are not normal Runtime requirements. Custom endpoints and injected clients must satisfy the declared guarantees. Unsupported semantics fail initialization instead of weakening conditional writes.

## Authority, conflicts, and fencing

Object storage owns the recoverable state: admission receipts, operations, Sessions, waits, approvals, schedules, budgets, and pending messages. Host caches, query projections, events, alarms, and queue messages cannot establish that a command committed.

A partition is the serialization and atomicity boundary. Colocate Runs, their children, and affected Sessions when they change together. The application supplies deterministic routing; do not independently hash a child Session into another partition. Cross-partition atomic transactions and live partition reassignment are not provided.

The engine writes immutable numbered commit slots. A conditional-create conflict causes it to read the winning record and re-evaluate deterministic state changes; it must not repeat a model or tool call to resolve contention. An exact command retry returns its original immutable receipt, including `duplicate: false` if that was originally recorded. Reuse of an identity with different input fails with an input conflict. Preserve explicit command IDs for wake, steering, operator actions, and Program settlement; a wake's `event.dedupeKey` is a separate delivery identity.

A timeout is not proof a write failed. The engine reads the attempted slot to reconcile its command identity and digest. If it cannot establish the outcome, `DurabilityFailure` reports `reason: "indeterminate"`; preserve the original identity and reconcile before executing external work. Authentication, rate limits, timeouts, unavailable storage, corrupt bytes, unsupported formats, and configured limits are typed failures, not empty state.

Ownership transfer is committed in the same ordering protocol. Protected transitions validate current Run-attempt and Session-writer authority; an expired clock lease alone does not fence a stale writer. Fencing prevents late canonical writes after replacement authority takes effect. It cannot cancel a request already in flight at an external provider.

External operations commit intent before dispatch, then commit a known result or explicit `Unknown`. Object atomicity does not provide exactly-once payments, messages, model calls, or other external effects. Preserve `pure`, `provider-idempotent`, and `never` replay policies; resolve unknown non-idempotent outcomes using provider evidence or an authorized operator decision.

## Scoping and limits

Canonical keys include environment, tenant, and partition. Tenant blob keys include environment and tenant and are shared by that tenant's partitions. These are storage namespaces, not authentication: authorize every Run, Session, blob, stream, approval, and operator endpoint against the authenticated principal. Do not let untrusted callers choose another tenant's namespace. Use prefix-scoped credentials where the provider supports them.

Configure positive bounded work and storage limits for the actual workload. Runtime options include `maxStateBytes`, `maxCommitBytes`, `maxReplayBytes`, and `snapshotEvery`, alongside scheduler and subscriber bounds. Snapshots contain reconstructible state and retained receipts, not only chat history. The engine still materializes partition state; snapshots and paged user history do not imply constant memory or an unlimited partition. Limit partition growth and test the application's actual Session lengths, retained branches, payloads, and contention.

Large attachments belong in `BlobStore.layer({ environment, tenant, maxBytes? })` over the same transport and Crypto, not in the journal. Its default upload ceiling is 100 MiB. Preserve every referenced blob and external sandbox snapshot; storage references do not make those resources disposable.

## Scheduling and host recovery

The default process scheduler is scoped to the Runtime Layer. A supervisor must restart failed processes. For platform-managed wakeups use `schedulerMode: "external"` and await `LocalScheduler.drain({ fuel })`; its result reports `processed`, `hasMore`, and an optional `nextDueAt`.

The canonical schedule or wait is authoritative; a successful alarm or schedule call is only a wake hint. Run an independent reconciler so a commit followed by failed wake delivery cannot strand accepted work. Cloudflare Durable Objects and Rivet actors host the same object authority. Their local state is not a second persistence model. See [hosts](/features/hosts).

## Snapshots, retention, and garbage collection

Snapshots bound replay work; they do not make older commit slots safe to delete. This implementation retains committed slots and command receipts. Do not configure lifecycle expiration on canonical commits, snapshots, or referenced blobs. Deleting a numbered slot can let a paused writer recreate it and invalidate the committed prefix.

Automatic live-history reclamation and safe concurrent blob collection are not provided. Age or an apparently unreferenced upload is not sufficient evidence for deletion: delayed writers, forks, readers, and backups can still need it. Never delete production objects to repair recovery or reclaim capacity. Retained append-only history, receipts, external outcomes, and incurred costs survive rewind; changing the active branch does not erase accepted work.

## Backup and restore

There is no public one-call snapshot restore API or automatic legacy-store importer. Use a quiesced, complete object backup rather than copying an event stream or one latest snapshot:

1. Stop new admissions, drain or explicitly suspend active Runs, and stop every writer and reconciler for the namespace. Revoke or isolate their write access so stale hosts cannot restart against it.
2. Copy the entire retained canonical namespace, including commit slots, snapshots, tenant blobs, and auxiliary durable-store partitions. Preserve exact bytes and relative keys. Retain external snapshot bytes and the exact compatible executable build and registration configuration separately.
3. Verify the backup's object inventory, complete pagination, byte lengths, and digests. Keep it read-only. A storage provider's asynchronous replication status is not itself a consistency proof.
4. Restore into an empty isolated bucket using the same namespace identities and relative keys. Do not merge it with a live or partly restored prefix. Changing encoded environment, tenant, or partition fields requires a format-aware import tool, not a key rename.
5. Open the destination with the compatible build and new worker identity while external dispatch and public routing remain isolated. Allow the engine to validate the chain and acquire fresh ownership; never edit stored leases or invent successful outcomes.
6. Inspect Runs, Sessions, budgets, pending approvals, schedules, and unknown operations. Verify all referenced bytes are accessible. Resolve uncertain external effects only with evidence, then enable destination hosts, independent reconciliation, and application routing.
7. Retain the source backup and prevent source writers from resuming. Once the destination performs new external effects, blindly switching back can repeat them; rollback requires reconciliation.

Rehearse this procedure with your real provider and failure scenarios before relying on it. A likely startup failure is missing credentials or a custom endpoint without qualified conditional semantics: correct the configuration and provider qualification, not the stored history.

Next: use [typed recovery actions](/features/recovery) for unresolved work and the [Runtime reference](/reference/runtime) for service contracts.

Local integration scenarios: [`durability/object-store.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/durability/object-store.test.ts). Test availability describes the verification boundary, not a claim that every acceptance gate has passed.
