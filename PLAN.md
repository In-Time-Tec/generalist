# Governing execution plan: object-native harness, clean v1 contract

The revised harness plan below defines the required behavior, not a requirement to preserve older contracts. The user's subsequent instruction overrides compatibility and migration provisions: keep no legacy implementation, backward-compatible reader, shim, alias, or old-format migration path. Reset current Generalist-owned contract/schema versions to v1 and migrate every caller directly. Use a fresh object-storage namespace; do not read existing namespaces as the new format or delete production data. Third-party API versions and monotonic content revisions are not Generalist schema versions and remain unchanged. This does not declare API stability or authorize a package release.

Preserve compliant work: this is a state-model and harness refactor, not a mechanical SQL-to-JSON port. Remove all SQL integrations from Generalist, with no alternate production durability backend. Preserve invariant coverage while replacing its implementation; the finished tree must contain no temporary reference harness.

## Completion and release execution plan — September 7, 2026

This section owns the remaining execution order. The normative revision below still owns behavior; earlier checkpoint observations are historical, not current proof. The subsequent September 7 instruction requires all acceptance testing on the local machine with no external service dependencies or credentials. It supersedes live-provider qualification and external workload-approval prerequisites throughout the historical plan; do not claim live AWS/R2 certification from local results. The September 7 request authorizes completing this migration, pushing its branch, merging the verified result to `main`, and publishing a documented new Generalist version. It does not authorize production data deletion, live data cutover, credential changes, or deployment of a qualification Worker.

Object storage means one production durability engine over S3 and native R2, not Cloudflare Durable Objects as the only compute host. Hosts remain separate from storage authority. Keep non-durable Core execution, a test-only object store, clean Generalist-owned v1 contracts, and fresh namespaces. Do not restore SQL, a second memory Runtime, filesystem durability, compatibility readers, aliases, or old-format migrations.

### Verified restart baseline

- Inspected checkpoint: `dfec0dba24222ab3599135c574163288e8c6fc7a`, branch `object-storage-only-durability`, version `0.62.0`; clean checkout before this planning change. Its diff from its merge base contains 554 files, 21,198 insertions, and 39,701 deletions.
- `origin/main` is now `bb1f9154a2e0c870c401ce5cb5a955a70805b414`. Seven commits after the branch base include the native Rivet runtime host, recovery fixes, package-size measurement, and release `0.63.0`. GitHub's latest release and npm both report `0.63.0`. These changes must be reconciled, not overwritten by the older checkpoint.
- Installed the pinned Bun `1.4.0` and release-consumer npm `11.19.0`. `bun install --frozen-lockfile` passed without a lockfile change.
- A fresh `bun run build` failed: 70 source diagnostics across 24 files. Current failures include missing runtime-state type imports, declaration emit names, command identities, Prompt boundaries, captured-observation requirements, and omitted typed durability failures. This replaces the old compiler count as the current build observation; it is not a full workspace typecheck result.
- The completed focused run passed 91/92 tests across 11 files: shared runtime driver 37/37, interrupted model responses 5/5, runtime boundary 6/6, runtime-state codec 10/10, protocol model 21/21, and Artifact 12/13. The remaining Artifact fork failure is a missing `commandId` through `host.sessions.fork`, not the old missing-model/worker failure. A separate branch-evidence run passed 7/7; that suite is now registered by `packages/generalist/test/durability/internal/runtime.test.ts` under `object branch evidence`. Combined current evidence is 98/99; it does not certify the broader migrated suite or build.
- Native R2 qualification still drops the failed case from its evidence array in `packages/generalist/src/testing/durability/native-r2.ts`. A failed run must preserve the case name, duration, and sanitized failure classification, mark later cases not run, and retain uncertain-writer cleanup protection.
- Configuration-only provider preflight reports all three provider gates unmet: remote-write authorization, scoped bucket identities, credentials, and the authenticated native Worker endpoint/token are absent. No live provider requests were made by this preflight.

### Dependency-ordered milestones

Current integration progress (not completion of M1): the source stabilization has passed `bun run build` on the primary machine, and the focused runtime/Artifact/codec/branch/protocol gate now passes 101/101 across 12 files. Reloading current operation state after immutable admission receipts fixes duplicate memory and nested-operation replay; all four memory-restart cases and 22 nested-operation cases pass. The codec also preserves nested approval denial types and rejects malformed retained failures. Native qualification evidence/request regressions pass 19/19 locally.

The new local service suite passes 4/4 on the primary machine: Alchemy-managed MinIO, unchanged shared native R2 object-store conformance, journal/snapshot/receipt recovery across service/workerd restart, and same-bucket native/S3 contention through Miniflare's built-in gateway. R2 transport tests pass 43/43. The native emulator is pinned Miniflare `5.20260811.1-alpha` with a tracked one-line exact-EOF range correction (`offset >= size`); this is explicit patched-emulator evidence, not live AWS/R2 qualification. Container and volume teardown passed. The older Cloudflare Runtime host fixture remains failing, broad fixture migration is underway, and full typecheck/lint/check/package gates remain open.

Each milestone requires an inspected diff, current checks, and evidence tied to a commit before it is complete. One integration owner controls canonical schemas, command identity, receipts, fencing, and branch policy. Parallel contributors own disjoint consumers only after those contracts are fixed. Build success alone never closes a behavioral milestone.

| Milestone                                                     | Required work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Exit gate                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 — Recover a trustworthy baseline                           | Fix source command IDs, typed failure channels, captured observations, declaration emit, and Prompt boundaries. Rebuild before diagnosing declaration-dependent callers. Rerun the focused runtime, Artifact, codec, branch, and protocol suites, then migrated state, operation, run, Program, child, messaging, Core, and memo tests. Fix qualification evidence reporting with failure-path regression coverage.                                                                                                                                                                                                           | Fresh package build and typecheck pass; focused and migrated tests pass without weakening existing expectations. Record exact commands, counts, failures, and skips.                                                                                                                                                                                                                                                                                                    |
| M2 — Reconcile current main and freeze canonical contracts    | Merge current `origin/main` into the migration branch, preserving the new Rivet host and recovery behavior while converting its durability to the single object engine. Complete the state inventory: per-kind codecs, semantic records versus indexes, command/observation/receipt identity, atomic scopes, field-level branch policies, executable pins, payload references, and bounded recovery.                                                                                                                                                                                                                          | Every recoverability-critical category has one authoritative mutation and recovery consumer; no transitional unknown payload substitutes for a required codec. Main's retained host behavior has object-backed tests. Rebuild and rerun M1 gates after integration.                                                                                                                                                                                                     |
| M3 — Finish durable harness state                             | Implement durable component declarations and instance identity, versioned hooks and recorded decisions, representative built-ins, settings ownership/inheritance/effective values, and resumable Program control through the canonical command path. Retain current security restrictions and monotonic cost/receipt evidence across branches.                                                                                                                                                                                                                                                                                | Reopen/fork/rewind tests cover abandoned extension state, accepted mutation before tool completion, missing component code/version, settings changes, nested control/retry ownership, and distinct detach/switch/cancel/shutdown reasons. Reconstruction invokes no effectful hook.                                                                                                                                                                                     |
| M4 — Finish execution, inference, and workspace contracts     | Unify operation/job identity and durable intent/outcomes; enforce separate intake, persisted-output, and projection bounds; represent uncertain effects and termination limitations honestly. Persist inference compatibility decisions and exact request/normalization references. Pin workspace identity/base/snapshots/patches and executable requirements; keep credentials and live handles outside persisted state.                                                                                                                                                                                                     | Fresh-host tests prove no redispatch of settled or unknown unsafe operations, bounded excessive output, honest uncooperative cancellation, exact inference recovery, stale-file rejection, isolated child workspaces, and explicit activation failure for missing code/workspace.                                                                                                                                                                                       |
| M5 — Finish host, discovery, retention, and client guarantees | Add durable partition discovery independent of catalog notifications; reconcile sender/receiver obligations and receipts after lost delivery. Keep active journal slots and receipt dependencies retained; define safe namespace retirement without online GC claims. Complete host start/reconcile/drain/stop, client initial snapshots, committed cursors, subscription epochs/gap resync, stale-preview rejection, and server-enforced spectator/tenant authorization.                                                                                                                                                     | Crash immediately after a new partition commit but before notification and recover it from a fresh host. Exercise delayed writers versus retirement, retained fork/blob dependencies, sleeping work, projection deletion, stale epochs, duplicate/gapped delivery, snapshot without a new message, and denied spectator mutations.                                                                                                                                      |
| M6 — Complete independent correctness and provider proof      | Extend the independent domain oracle/property sequences across admit, claim, operate, cancel, fork, rewind, restart, compact, and project. Tie bounded sequencing/takeover/lost-response/deletion models to real integration traces. Exercise the production S3 transport against a locally provisioned S3-compatible service and native R2 against persistent local Miniflare/workerd. Test cross-transport state where the local harness supports a shared bucket, labeling any gateway/emulation boundary. Measure local workload latency, request/byte amplification, replay, memory, artifacts, and idle reconciliation. | All 18 invariants and the normative required-case matrix link to actual test symbols and current results. Publish model assumptions/bounds/seeds. All local integration gates pass without external services or credentials. Publish exact server/emulator versions and distinguish local transport compatibility from untested live AWS/R2 behavior. Set reproducible local workload and regression bounds before optimization; do not invent remote latency promises. |
| M7 — Finish public surfaces and release candidate             | Update supported host examples, manifests/exports, generated API/OpenAPI/host surfaces, READMEs, guides, architecture/tradeoffs, `CONTEXT.md`, repository instructions, and release skill to the shipped object-only contract. Remove stale SQL examples/dependencies/check requirements rather than suppressing checks. Document breaking changes, fresh-namespace setup, recovery, retention, credentials, and honest limitations.                                                                                                                                                                                          | `bun run check`, `bun run test`, and `PACKAGE_ARTIFACT_DIR=<new-directory> bun run package` pass. Audit source and the packed tarball for removed imports/exports and SQL durability dependencies; fresh core-only, Bun, npm, Node, and optional transport consumers pass. Runnable S3/R2 and supported-host examples compile and execute under their stated conditions.                                                                                                |
| M8 — Merge and publish one verified version                   | Prepare the lockstep version and changelog, independently review the final diff, verify one exact detached candidate, land that exact release commit on `main`, wait for its successful main CI, then tag and publish through the existing workflow.                                                                                                                                                                                                                                                                                                                                                                          | The immutable tag points at the verified main commit; the workflow succeeds; GitHub assets, npm version, tarball integrity, checksums, and post-publication isolated consumer installation agree. Report the release URL, workflow run, full SHA, version, and remaining limitations.                                                                                                                                                                                   |

M1 precedes destructive integration. M2 is the shared contract boundary for M3–M5. After M2, component/settings work, execution/workspace work, and host/client work can run in parallel only with disjoint file ownership; discovery and journal retention remain with the canonical-engine owner. Independent tests and documentation can grow alongside implementation but cannot certify unfinished features. M6 and M7 both block M8.

### Bounded implementation slices

The source audit distinguishes missing contracts from existing foundations. Reuse the latter instead of replacing useful behavior with a second framework. Paths below are relative to `packages/generalist/`.

1. **Canonical schema and mutation boundary:** extend `src/durability/internal/runtime-state/schema.ts` and the existing runtime command families with approved semantic records. Define per-kind operation codecs and branch policy before consumers add fields. A schema that exhaustively covers today's `RuntimeState` is not proof that the governing recovery inventory is complete.
2. **Component vertical slice:** build on `src/hooks/index.ts` and the canonical engine, with stable component/instance identity, bounded authorized state, schema/handler pins, and branch/redaction policies. Migrate Tasks first from `src/tasks/internal.ts` and the loop checkpoint. Add pinned hook-chain identity and operation-backed effectful outcomes to `src/core/agent/lifecycle/hooks.ts`; existing decision checkpointing alone leaves a crash window between an effectful callback and its recorded decision. Memo and administrative rules follow their distinct cache/security branch policies, not blanket rewind.
3. **Settings before control and inference:** reuse normalization and child narrowing in `src/core/agent/lifecycle/fan-out.ts` and the pinned Agent manifest. Add declared ownership/defaults/precedence/access, deterministic conflicts, effective values and accepted-change provenance. Extend existing Program state and runner with bounded control ownership, plan/verification/yield state, suspension relationships, and capability expiry; do not invent another workflow primitive.
4. **Output and one concrete job adapter:** close typed operation input/outcome contracts before adding job admission/reconnect/settlement. `src/core/tools/tool-output.ts` currently bounds already-materialized values; implement intake limits and incremental spill before accumulation. Preserve exact final-result semantics, separately bounded provisional previews, and the honest cancellation evidence in `src/core/tools/tool-executor-cancellation.ts`. Begin with one adapter whose termination/reconnect capabilities are real; not every operation must become a job.
5. **Inference and workspace activation:** persist selected provider/model/settings, tool-contract and compatibility-policy identities, and bounded request/normalization evidence under the existing model operation and budget. Extend `src/runtime/executable/resolver.ts` rather than replacing its pin checks. A snapshot ID recovered by `src/runtime/execution/agent/sandbox-snapshot.ts` is not yet a portable workspace contract: pin base/references/restore adapter and validate the dependency closure before activation.
6. **Discovery and host lifecycle:** `src/runtime/child/external/store.ts` already owns placement/admission/settlement/acknowledgement but needs bounded outstanding-obligation enumeration and recovery of newly committed partitions. A known-run missed-event test cannot prove unknown-partition discovery. Preserve Rivet's periodic reconciliation and sleep/destroy disposal, incorporate current main's native host work, and add a real Cloudflare host recovery example rather than treating the qualification Worker as a runtime host example.
7. **Authorization and resumable clients:** extend the current server authorization boundary with application-supplied principal/resource permissions, including read-only spectators. Apply it before HTTP mutations, cancel sockets, Artifact edits, and operator actions. Add a snapshot-plus-exclusive-cursor and epoch contract to host/client transport; deduplicate and resync without assuming filtered opaque cursors are arithmetically contiguous. Artifact already sends a snapshot; preserve it while closing its authenticated-peer edit policy.
8. **Retention and release evidence:** retain active committed slots, receipts, and referenced payloads; publish capacity/receipt-growth limits and an offline fenced-retirement procedure. Online GC is not required for this release and is not certified by snapshotting. Keep negative legacy-import tests in package smoke and historical release prose. Audit supported production import closure and packed exports rather than claiming incidental SQLite dependencies anywhere in the lockfile necessarily represent Generalist durability. Add exact-source local service/Workers evidence to release acceptance. Live AWS/R2 behavior remains untested and is documented, not an unmet external prerequisite under the latest instruction.

### Verification ladder and evidence rules

Use the repository's existing commands and authoritative shared runtime-driver suite. Do not add a second conformance harness or a new release script.

1. Run `bun run build`, then `bun run --cwd packages/generalist typecheck` against fresh declarations. Do not hide `DurabilityFailure`, manufacture nondeterministic retry identities, weaken schemas, or erase Effect requirements to satisfy the compiler.
2. Run the actual focused destinations: `packages/generalist/test/testing/runtime-driver/index.test.ts`, `packages/generalist/test/durability/{branch,runtime,runtime-state,protocol-model}.test.ts`, `packages/generalist/test/runtime/execution/model-response/interrupted.test.ts`, and `packages/generalist/test/artifact`, using `bun --bun vitest run <paths> --no-file-parallelism --maxWorkers=1`.
3. Run the broader migrated suites and new invariant regressions. Every persistence claim crosses a fresh Layer or close/reopen boundary. Read-only reconstruction must not probe, heartbeat, dispatch, publish, or acquire execution authority. Replay must use the exact authoritative cursor without redispatch.
4. Run all service integration on this machine: a local S3-compatible service, persistent native R2 under Miniflare/workerd, and explicitly labeled shared-bucket gateway interoperability where supported. Reuse the existing conformance expectations. Retain sanitized per-case evidence including failures, exact local service versions, seeds, and restart boundaries. Do not run the remote qualification script or request cloud credentials; fix its known reporting defect with local tests. Uncertain writes still prohibit unsafe cleanup.
5. Run the complete check/test/package gates. The final object-only instruction update must replace obsolete SQL requirements with the real object-backed conformance and local service/Workers gates; removing SQL cannot mean removing its preserved behavior from verification.
6. Follow `generalist-release` from an exact detached commit and a new artifact directory. If source, version, tools, or generated output changes, create new evidence. Dirty-worktree package output is never commit proof.

For each required invariant/case, record the implementation path, test file and symbol, commit, command, observed result, and whether the evidence is local, host-native, or live-provider. Use explicit statuses: implemented/unverified, verified, missing, blocked, or deliberately excluded by the governing scope. Historical local counts and inaccessible prior-agent artifact references are not current release evidence.

### Version, merge, and publication policy

Target `0.64.0` as the next pre-1.0 breaking minor release, subject to rechecking `main`, tags, and npm immediately before creating the candidate. Do not reuse `0.62.0` or republish `0.63.0`. Keep root and package versions identical, regenerate the locked/public version surfaces, and document removed storage imports and their object-native replacements in `CHANGELOG.md`. Generalist-owned schema v1 does not mean package 1.0 or stable Effect AI APIs.

Keep the unfinished migration on its branch and expose it as a draft PR; do not merge a plan-only checkpoint or enable auto-merge while behavioral gates are open. Preserve concurrent main work through a normal merge into the branch and rerun affected gates. Review the full net diff, including deletions, dependency closure, examples, and host recovery.

The release source must be exactly the commit tested in detached proof and present on `main`. Prefer a merge that preserves the verified candidate commit. If repository policy requires squash/rebase or creates a different release source, run detached proof for the resulting main commit before tagging; do not transfer evidence between SHAs. Wait for successful latest push CI on that exact main commit before pushing `v<version>`, as `.github/workflows/publish.yml` requires. Never publish from the workstation. Manual workflow dispatch only reconciles an existing immutable tag with its full expected SHA.

### Machine-local acceptance and release access

The latest user instruction removes external services, credentials, live-provider qualification, and external performance approval as prerequisites. Complete all implementation and acceptance tests on this machine. Provision local test services and use installed Workers tooling; do not ask the user for cloud accounts, endpoints, deployment permission, or bucket credentials.

- Use Effect-native Alchemy.run for local service provisioning and teardown where supported. Pin it as development tooling, keep Generalist's Effect version and public dependency boundary intact, and use local state with Docker/local-process resources only. Plain `alchemy dev` is not permission to provision cloud-backed resources. Give every container, network, volume, and process an explicit lifecycle owner; retain test data through restart assertions, destroy owned resources afterward, and surface cleanup failures without touching unrelated resources.
- Exercise the actual production S3 client against a real local S3-compatible server, and native R2 against Miniflare/workerd with persisted state. Local test credentials are disposable and scoped to the machine, not real account secrets. Do not add a production filesystem or alternative durability engine to achieve this.
- Exercise create contention, delayed/lost responses, stale writers, corrupted payloads, reopen/fresh-process recovery, snapshots, strict replay, and retained dependencies through those boundaries. A gateway exposing a local R2 bucket through S3 can verify shared logical state, but is emulator/gateway evidence and cannot establish AWS or Cloudflare service semantics.
- Use reproducible local workloads covering one hot partition, many independent partitions, long history, bounded large output, sleeping work, and repeated owner replacement. Record latency distributions, request/byte growth, replay, memory, and idle cost. Set local regression budgets from measured workload conditions, not vendor latency claims.
- Run final build, checks, complete tests, package smoke, and detached release proof here, including fresh Bun/npm/Node and Workers consumers. Skipped local acceptance tests are not a pass. Keep CI as an additional publication prerequisite rather than the sole validation environment.
- Document AWS S3 and deployed Cloudflare R2 qualification as not performed. This limitation does not block release under the latest instruction; it must not be relabeled as provider certification.
- Branch pushes, the verified main merge, tag, and canonical publication workflow remain authorized. Use the connected repository/release identity; never publish from the workstation or bypass exact-commit/checksum checks. No production data cutover, deletion, or deployment is authorized.

## Historical worktree and observed baseline

- Worktree: `/Users/dallenpyrah/Projects/in-time-tec/generalist-object-storage-only`.
- Branch: `object-storage-only-durability`, created from freshly fetched `main` at `7042211fb3d29c8ff74234e9b400dc6286c03d1d` (0.62.0).
- Reconciliation observed 154 unstaged paths and 9 untracked entries; no staged changes. Counts describe the paused checkpoint, not a permanent inventory. Runtime memory path deletions include moves into neutral state/hosting paths.
- Pre-refactor focused baseline: 118 tests passed across four test files in 12.48 seconds. This is behavioral baseline evidence, not an admission-latency benchmark or proof of the replacement.
- Paused-checkpoint local checks: 19 journal tests, 26 native R2 adapter tests, 19 object-store simulator tests and 16 signed S3 transport tests passed in focused runs. New dependencies were installed successfully. The S3 fixture shutdown order was corrected after a real Bun teardown failure. These are local checks, not remote-provider qualification; the journal is receiving additional v2 corrections.
- Current local protocol evidence: 28 signed S3 transport tests, 38 native R2 adapter tests, 23 journal tests, 19 deterministic object-store tests, and 19 independent protocol-model tests passed. Reads now require explicit byte budgets, consume bounded streams, validate ranges and cancel oversized bodies. Native R2 deadlines preserve uncertain create outcomes; its InvalidRange code is classified distinctly from service unavailability.
- Effective-call authority checks passed nine hook tests and eight capability tests, including replacement/revocation boundaries. The Session fixture and repeated-run identity failures were repaired; all 44 Session memory/history tests now pass. Five object-runtime recovery tests and eight runtime-state codec tests pass; this is focused integration evidence, not the complete runtime conformance suite.
- Remote runner preflight was exercised with `bun scripts/durability-provider.ts aws-s3 r2-s3`: exit 1, provider qualification unmet, no network requests. Evidence is `artifacts/durability-provider/7bb6704e-59f4-4c13-aa15-8ef5564f71e6.json`. Real AWS/R2 qualification and native/S3 interoperability remain blocked on explicit authorization, credentials and the native endpoint contract.
- `bun scripts/durability-benchmark.ts` measured 100 sequential admissions on the local simulator. Before verified-prefix reuse: 113,395.865 ms total, 10,002 object reads; after: 7,826.058 ms total, 201 reads. Both runs attempted the same 851,405 write bytes with 102 creates and 615 list requests. Fresh-layer recovery after the change read 101 objects, created none, and recovered all 100 runs in 2,078.289 ms. Exact evidence is retained under `artifacts/durability-benchmark/`. This is request-amplification/CPU evidence, not remote-provider latency; eager partition materialization and listing costs remain open performance risks.
- S3/R2 transports, deterministic object faults, journal, blob facade, neutral operation/errors and hosting extraction have implementation work present. Focused checks pass, but the full build, runtime conformance, host recovery and packaging checks are not yet complete.
- Runtime adapter and state codec are intermediate, not a complete canonical model. Known v2 gaps include read-only reconstruction, explicit command observations, branch policies, extension/settings/job/workspace state, lazy payload hydration and independent correctness oracles.
- SQL production trees (`src/pg`, `src/mysql`, `src/runtime/sql`, `sql-driver.ts`, `sqlite-bun.ts`), SQL schema errors/reexports, and the obsolete eager SQL scheduler composition have been deleted after checking retained production imports and mapping replacement invariants. Generic behavioral test migration continues; physical SQL test/helper deletion and full package verification are unfinished. The latest bounded shared-suite run passed 12 of 37 object-runtime cases and all six branch cases; 25 conformance failures remain explicit work, not certified coverage.
- No remote AWS/R2 credentials were found in relevant environment names, `.aws/config`, `.aws/credentials`, worktree `.env*`, or `.dev.vars`. Actual provider gates remain unmet. No deployment or retained production data source has been identified.
- No publish, push, deployment, credential change, live data cutover or production deletion is authorized.

## Ownership and sequencing

Main is the single integration authority for domain schemas and the commit protocol. Existing workers implement bounded slices under that contract; they may not independently widen canonical APIs. Transport and host work resumes only against approved contracts. An independent reviewer must use a separate invariant oracle, not only implementation-generated digests.

| Invariant | Accountable owner / implementation slice | Required responsibility                                                          |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| INV-01    | Main / ObjectRuntime                     | Versioned entities, bounded partition materialization, no giant authority object |
| INV-02    | Main / RuntimeStateCodec                 | Complete runtime, extension, settings, workspace and job recovery inventory      |
| INV-03    | Main / ObjectRuntime                     | Authorized commands; one durable mutation and committed application path         |
| INV-04    | Main / ObjectRuntime                     | Explicit captured observations; no reducer clocks or callbacks                   |
| INV-05    | Main / JournalEngine                     | Partition atomicity and ordered canonical commit protocol                        |
| INV-06    | Main / JournalEngine                     | Durable acknowledgement and indeterminate-write reconciliation                   |
| INV-07    | Main / JournalEngine                     | Scoped idempotency, original receipts and retention                              |
| INV-08    | Main / ObjectRuntime                     | Separate run/session fencing and fresh activation authority                      |
| INV-09    | Main / ObjectRuntime                     | Intent barriers and honest external Unknown outcomes                             |
| INV-10    | Main / ObjectRuntime                     | Read-only reconstruction separated from activation and probes                    |
| INV-11    | Main                                     | Branch policy, monotonic cost/receipts and non-rewindable security               |
| INV-12    | Main / JournalEngine                     | Snapshot anchors and retained journal/payload dependencies                       |
| INV-13    | Main / PackageTrain                      | Non-authoritative views and honest projection lag                                |
| INV-14    | Main                                     | Attempt-scoped previews and committed cursor subscriptions                       |
| INV-15    | Main / ObjectHosts                       | Host authorization, credential isolation and spectator enforcement               |
| INV-16    | Main                                     | Bounded jobs, input/storage/projection limits and honest termination             |
| INV-17    | Main                                     | Versioned extension/tool/config descriptors and missing-code rejection           |
| INV-18    | Main / PackageTrain                      | SQL-free production graph, no alternate authority or fallback                    |

The invariant-to-test map is pending reconciliation and must name real test symbols and observed results. Existing tests are evidence candidates, not automatically certified coverage. All 50 phase steps, 34 required test cases, three model/property verification tasks, and ten final deliverables are tracked separately in the active todo list.
The initial state-category and branch-policy decision is recorded in `docs/decisions/object-native-state-model.md`; extension, settings, job/workspace and client inventories are still being reconciled.

## Revised execution order and decisions

1. Finish the v2 state inventory, branch policy and invariant-to-test map before resuming destructive cutover.
2. Correct known protocol boundaries first: reconstruction must not run the capability probe, heartbeat or dispatch; reducers consume captured observations rather than a fixed substitute Clock; errors retain typed retry classification; network calls remain interruptible.
3. Define the canonical command, accepted-change, observation and receipt schemas under one integration owner. Generic JSON patches remain internal encoding machinery, never extension/client authority.
4. Integrate extensions, effective settings, Program control, job/workspace descriptors and branch policies into that model before calling the runtime codec complete.
5. Resume adapters, clients, examples and package tooling against the approved contracts. Independent provider and fault tests can run without certifying the unfinished runtime.
6. Run independent invariant/property/model checks and public runtime crash scenarios. Delete remaining legacy implementations only after preserved behavior has a replacement and evidence.

Branch policy is a field-level contract, not a blanket snapshot rewind. Conversation, plans and branch-local settings restore by branch; costs, receipts and consumed security evidence remain monotonic; execution authority and future operation identities are freshly allocated; administrative restrictions remain current; immutable dependencies retain verified identities; scoped handles never become persisted authority.

The existing extra `durability/auxiliary` export is provisional work from v1. Its final placement depends on the unified component/administrative-policy contract; it is not an approved additional canonical engine or public patch interface.

## Supplied normative revision

# Generalist: object-native durability and harness refactor

## Implementation handoff · Revision 2 · September 6, 2026

Repository: `In-Time-Tec/generalist`

Verified `main` baseline: `7042211fb3d29c8ff74234e9b400dc6286c03d1d`, Generalist `0.62.0`. [R1]

Status: Proposed implementation plan. Source inspection informed this document. No implementation, provider benchmark, migration, or production deployment ran for this revision.

This document replaces the earlier durability plan and the incomplete implementation prompt. It is standalone. Earlier code examples describe proposed APIs, not verified existing exports.

# 1. Assignment and fixed decisions

Refactor Generalist into an Effect-native runtime with one recoverable state model and one production durability engine over object storage.

Make this a state-model refactor, not a mechanical SQL-to-JSON conversion. Preserve useful domain behavior while removing duplicated persistence machinery.

1. Remove PostgreSQL, MySQL, SQLite, and generic SQL from Generalist's production durability implementation.
2. Use one canonical state schema family across all supported hosts.
3. Use one transition path for every durable mutation.
4. Persist canonical records and required payloads in object storage.
5. Provide stable durability exports outside `unstable`.
6. Support generic S3 transport and native Cloudflare R2 bindings through the same engine.
7. Keep Tonbo and SlateDB outside the default durability dependency graph.
8. Keep runtime placement separate from durability semantics.
9. Preserve TypeScript and the repository's pinned Effect v4 stack.
10. Remove obsolete code after the replacement passes its acceptance gates.

Do not introduce a public choice between native, Tonbo, and SlateDB canonical engines during this refactor. Such a choice recreates the backend matrix.

Use a test-only object store for deterministic tests. Do not retain a second memory-backed runtime implementation.

Do not add a stable filesystem durability backend. Local durable development uses an S3-compatible server through the production transport. Ordinary non-durable agent execution can remain a separate execution mode.

Applications can still use their own SQL databases. Generalist must not require those databases for durability, blobs, claims, schedules, receipts, or recovery. Move unrelated optional SQL integrations outside the default package graph, or remove them with documented replacements.

## Working-tree rules

Read repository instructions before editing. Inspect the actual branch and uncommitted changes before applying this plan. Another agent can already own part of this work.

Preserve existing compliant changes. Update the remaining work instead of restarting the refactor. Do not overwrite another agent's work or revert unrelated changes.

Complete non-blocked implementation work before requesting clarification. Ask only about decisions that materially alter correctness, scope, or deployment requirements.

Routine reversible edits and tests need no additional confirmation. This assignment does not authorize production deletion, deployment, credential changes, or a live data cutover.

# 2. Scope derived from the harness review

The Stencil article is architectural input, not a specification or validation of an object-storage commit protocol. [W1]

| Article area       | Generalist disposition                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| Design envelope    | Test concurrent local use, remote control, spectators, and unattended execution. |
| State              | Require complete recovery and branch-aware state.                                |
| Runtime            | Centralize bounded execution and enforce host authority.                         |
| Control plane      | Persist settings and multi-turn control state.                                   |
| Inference          | Centralize compatibility decisions and validate normalized results.              |
| Tool surface       | Version contracts and measure discovery costs.                                   |
| Interface          | Provide typed, resumable views and an executable debug contract.                 |
| Stack              | Keep Effect and enforce one repository style.                                    |
| Closing principles | Assign each invariant an owner and a test.                                       |
| Appendix A         | Add adversarial extension-lifecycle regressions.                                 |
| Appendix B         | Apply model-based verification; defer its specific terminal algorithm.           |

Do not copy XML state, language choices, terminal machinery, or a shell interpreter merely because the article uses them. The sections below specify Generalist requirements independently.

## Required now versus separate follow-up

The required scope includes canonical state, persistence, recovery, existing extension behavior, settings, operations, host integration, and client projection contracts.

Existing features must use the new contracts. This work does not require new voice models, local helper models, document converters, or a complete renderer.

A new Bash interpreter, Python extension runtime, Rust rewrite, terminal layout engine, and automatic external issue reporter remain separate proposals.

# 3. Verified starting points

The reviewed source already contains valuable semantics. Preserve those semantics instead of replacing them with a minimal transcript store.

| Existing source                      | Observed behavior                                                                              | Refactor action                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `runtime/run/store-types.ts`         | SQL backend types, execution claims, session-writer claims, and atomic child-admission inputs. | Extract domain types and retain atomic scopes. [R2]                     |
| `runtime/run/store.ts`               | Broad runtime contract for sessions, operations, waits, schedules, children, and artifacts.    | Route these capabilities through one engine. [R3]                       |
| `runtime/sql/store.ts`               | Transactions combine claim checks, domain changes, and validation.                             | Replace mechanics without weakening invariants. [R4]                    |
| `core/durable/driver/contract.ts`    | Deterministic operation identities, replay policies, checkpoints, and unknown outcomes.        | Retain and integrate these concepts. [R5]                               |
| `hooks/index.ts`                     | Typed lifecycle events and serializable hook decisions.                                        | Extend recovery coverage instead of creating another hook system. [R6]  |
| `core/tools/tool-executor.ts`        | Typed outcomes, routing, cancellation, and toolkit stream handling.                            | Preserve integration and define preliminary-versus-durable output. [R7] |
| `blob-store/index.ts`                | Several backends and a small injected S3 client without a journal contract.                    | Reuse content references over the new object transport. [R8]            |
| Cloudflare and Rivet adapters        | SQL-backed runtime composition.                                                                | Retain hosting responsibilities and remove SQL authority. [R9, R10]     |
| `testing/runtime-driver/contract.ts` | Existing behavioral conformance scenarios.                                                     | Convert them into mandatory engine and host suites. [R11]               |

Paths in this table are relative to `packages/generalist/src/`.

The prior plan already proposed deterministic transitions. This revision makes their ownership, extension coverage, branch behavior, and verification requirements explicit.

# 4. Architectural invariants

Each invariant needs an implementation owner and executable tests. Record that mapping before deleting legacy implementations.

## INV-01 — One logical authority, not one giant object

Represent durable state through versioned, schema-validated entities and relationships. Normalized maps, trees, and references can coexist within that model.

Do not create one global mutable object, one tenant-wide lock, or one function containing every domain rule.

A runtime materialization is authoritative only for its verified committed cursor. Its in-memory representation does not override persisted commits.

## INV-02 — Complete recoverability

Persist every mutable fact that affects future execution, or reference an immutable dependency with a verified identity.

The inventory includes runs, sessions, ancestry, messages, operations, attempts, outcomes, continuations, approvals, waits, signals, schedules, steering, cancellation, acknowledgements, children, and fan-out.

It also includes budgets, receipts, artifacts, branch relationships, executable references, ownership generations, delivery obligations, extension state, and effective configuration.

Transient caches remain allowed. Their loss must not alter an accepted decision or erase an obligation.

## INV-03 — One durable mutation path

All durable mutations enter an authorized command boundary. Domain APIs can remain when they delegate to that boundary.

For example, `completeOperation()` can remain a useful facade. It cannot independently persist an operation while another service independently persists its session entry.

Untrusted extensions and clients cannot submit arbitrary internal patches or write journal objects.

## INV-04 — Deterministic transitions

Compute proposed changes from verified state and explicit inputs. Do not read clocks, random generators, files, networks, or mutable environment values inside reducers.

Capture nondeterministic observations outside the reducer. Persist observations that the accepted transition uses.

Record effectful hook decisions as operation outcomes. Do not rerun arbitrary hook code during historical reconstruction.

## INV-05 — One journal protocol per partition

A partition is the unit of ordered commits and atomic state changes. One format and engine serve many partitions.

Do not require global order across the entire application. Colocate state that requires atomic changes.

A parent suspension, child admission, and related session changes need a common atomic boundary or an explicitly redesigned distributed protocol.

## INV-06 — Durable acknowledgement

Return a durable receipt only after the engine establishes commit success and required payload availability.

A transport timeout is not proof of failure. A cancelled request can still reach the provider.

Represent unresolved commit status explicitly. Do not release the associated external operation while its admission remains indeterminate.

## INV-07 — Idempotent commands

Scope idempotency keys to tenant, partition, and operation semantics. Pair each key with a canonical input digest.

An exact retry returns the original receipt. Reuse with different input produces a typed conflict.

Preserve receipt evidence for the documented retention interval. A snapshot or migration cannot silently shorten that interval.

## INV-08 — Fenced execution

A fencing token identifies an ownership generation. Validate the relevant generation on every protected transition.

Persist ownership changes through the same ordered protocol. A stale owner cannot commit after a newer ownership generation takes effect.

Preserve separate run-attempt and session-writer authority where their semantics differ. Time-based leases help progress, but they do not replace fencing.

## INV-09 — Honest external effects

Persist operation intent before dispatch when the operation requires a durability barrier. Persist the outcome before advancing dependent execution.

Preserve `pure`, `provider-idempotent`, and `never` replay policies. Preserve the explicit unknown outcome. [R5]

Do not promise exactly-once execution of arbitrary external effects. Storage fencing does not cancel a request already accepted by an external service.

## INV-10 — Read-only replay

Historical reconstruction must perform no model calls, tool calls, extension callbacks, job launches, or provider writes.

Separate reconstruction from activation. Activation examines reconstructed obligations, acquires fresh authority, and follows each operation's recovery policy.

A snapshot comparison or historical inspector must not launch a job merely because it sees a job record.

## INV-11 — Explicit branch policy

Classify canonical fields as branch-local, shared monotonic evidence, immutable dependencies, or references to current administrative policy.

Rewind can restore branch-local plans and conversation state. It must not restore an old ownership token or reactivate revoked credentials.

Rewind must not erase incurred cost, duplicate an external receipt, or automatically reuse a one-time approval.

Forks receive fresh ownership and future operation identities. Shared budgets require a new allocation rather than a copied allowance.

## INV-12 — Snapshots and retention agree

Recovery uses a verified retained checkpoint plus its committed journal tail and referenced payloads.

While the full journal survives, a snapshot can be rebuilt. After prefix reclamation, the retained checkpoint becomes necessary recovery data.

Never describe all snapshots as disposable while also deleting the records required to reconstruct them.

## INV-13 — Projections do not decide correctness

Search indexes, analytical tables, client views, and local caches derive from committed data.

They cannot decide ownership, uniqueness, budget admission, approval validity, or whether an external operation completed.

If a rebuildable projection fails, correctness continues. Any affected query must report its lag or availability honestly.

## INV-14 — Explicit stream durability

Distinguish provisional updates from committed records. Give each provisional stream an attempt identity and sequence.

Do not claim token-level recovery unless bounded stream chunks are actually durable. Never persist one object per token by default.

Discard previews from superseded attempts. Reconnect through a committed snapshot and cursor before adding current previews.

## INV-15 — Host-owned authority

The trusted host owns authorization, policy enforcement, runtime state, and dispatch. Sandboxes receive scoped execution requests.

Do not expose canonical bucket credentials to repository code, arbitrary model code, or a sandbox stub.

A process, actor, or Durable Object can cache state. Its private durable database cannot become necessary Generalist recovery state.

## INV-16 — Bounded resource use

Centralize deadlines, cancellation, concurrency, retry limits, queue capacity, output limits, and artifact limits.

Bound data before it exhausts host memory. Bound stored output independently from the model's context allowance.

A forced-stop guarantee requires a terminable execution boundary. Cooperative cancellation alone does not establish that guarantee.

## INV-17 — Versioned dependencies and extensions

Persist executable, extension, tool-contract, prompt, and configuration identities where they affect recovery.

Reject unsupported versions before mutation. Never silently initialize missing extension state during recovery.

Static registries and process handles are execution infrastructure, not serialized state. Persist their reconstruction descriptors and required versions.

## INV-18 — Object storage only

The production durability graph must contain no SQL clients, SQL row codecs, SQL migrations, or alternate host-local state authority.

No failure path can fall back to SQL, memory, or an unconditional overwrite.

A compatible executable, credentials, and external service access remain prerequisites for activation. Object storage does not replace those prerequisites.

# 5. Target architecture and internal contracts

```text
SDK / API / authenticated remote commands
                    |
        Authorization and command preparation
                    |
          Deterministic domain decisions
                    |
        One partition commit and replay engine
                    |
       ObjectStore: atomic objects and discovery
              /                     \
      Generic S3 transport       Native R2 binding
              \                     /
           One canonical on-object format

Committed records --> snapshots and typed read views
                  --> client subscriptions
                  --> optional search/analytical projections

Durable obligations --> host activation --> bounded execution
                                         --> outcome command
```

Keep domain decisions independent from storage transport. Keep storage concerns independent from UI rendering and provider-specific inference behavior.

## Command, change, and observation are different types

A command requests a mutation. A committed change describes an accepted mutation. An observation records a nondeterministic result.

Use one canonical application path for committed changes. Do not maintain a second hand-written recovery reducer.

The following pseudocode defines responsibilities, not existing Generalist APIs:

```ts
// Proposed internal contract. Resolve concrete types through Effect Schema.
interface CommandEnvelope<Command> {
  readonly commandId: string
  readonly tenantId: string
  readonly partitionId: string
  readonly inputDigest: string
  readonly command: Command
}

interface TransitionDraft<Change, Receipt> {
  readonly changes: ReadonlyArray<Change>
  readonly receipt: Receipt
}

// Pure decision. Pending effects appear as durable changes, not live callbacks.
decide(currentState, authorizedCommand): TransitionDraft

// The same function serves live materialization and historical replay.
applyCommitted(currentState, verifiedCommit): RuntimeState

// Effectful orchestration. A conflict retries decisions, not external work.
submit(command): Effect<DurableReceipt, DurabilityError>
```

Do not accept caller-supplied authority merely because it appears in the envelope. Resolve tenant access and execution claims at the trusted boundary.

Persist pending effects as state within the commit. Do not put them only in an in-memory `effects` array after publication.

Use small domain-specific transition functions under one dispatcher. Avoid a single unmaintainable reducer and avoid independently mutable stores.

## Public surface

```text
generalist/durability
generalist/durability/s3
generalist/durability/r2
generalist/testing/durability
```

The first three are the intended stable production exports. Host integrations can remain under `unstable` independently.

The S3 export wraps an S3-compatible network API. The R2 export wraps an injected Workers binding. Cloudflare documents differences between those APIs. [W3]

Both exports must use identical namespace, codec, commit, receipt, and recovery semantics. R2 access from Node or Rivet uses the generic S3 transport.

The R2 export must not import an AWS credential provider. The default durability export must not eagerly import native database libraries.

Keep most implementation types internal. Do not expose every journal, reducer, snapshot, and retention detail as a stable extension point.

# 6. Object protocol and storage plan

## Provider contract

Require atomic create-if-absent, complete object reads, integrity preservation, direct read visibility, and a documented discovery contract.

AWS documents `If-None-Match` for conditional creation and `If-Match` for conditional replacement. [W2]

R2 supports native conditional writes, but a failed native `put()` precondition returns `null`. Normalize that outcome into a typed conflict. [W3]

Keep these responsibilities separate:

| Interface             | Responsibility                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| Runtime object access | Read, conditional create, metadata inspection, and paginated discovery.                |
| Advisory metadata     | Optional conditional replacement where the selected protocol needs it.                 |
| Blob access           | Bounded upload, range reads, integrity checks, and completed-upload references.        |
| Maintenance access    | Controlled deletion and retention operations with separate credentials where possible. |

Do not expose unrestricted object overwrite to the normal journal path.

Support custom endpoints, region configuration, temporary credentials, and appropriate addressing styles. Use a maintained signing implementation.

Treat ETags as provider tokens, not Generalist content digests. Use a defined byte encoding and independent content hashes.

Do not rely on public cached URLs for canonical reads. Do not assume an incomplete LIST page marks the end of a listing.

Document any required listing consistency. If discovery uses weaker listing guarantees, prove how another canonical mechanism prevents missed committed work.

## Default protocol candidate

Start with immutable numbered commits, complete immutable payloads, and verified snapshots.

```text
v1/tenants/{tenant}/partitions/{partition}/
  commits/{sequence}.json
  snapshots/{sequence}-{digest}.json
  latest-hint.json

v1/tenants/{tenant}/blobs/sha256/{prefix}/{digest}
v1/tenants/{tenant}/projections/{name}/...
```

Use a defined decimal representation for wide sequences. Select one initial metadata codec, with canonical UTF-8 JSON as the default proposal.

Do not add several codecs or compression formats before measurements justify them. Version every persistent envelope independently from package releases.

Keep the commit record small. Reference large changesets, prompts, outputs, and artifacts only after their uploads complete.

R2 documents a concurrent same-key write limit. That makes a frequently contested mutable head a performance concern. [W4]

Treat numbered commits as a candidate requiring validation, not as an already proven algorithm. Record the selected linearization point in an architecture decision.

## Commit procedure

1. Load verified partition state.
2. Resolve any receipt for the command identity.
3. Validate the command against current authority and domain rules.
4. Compute its deterministic transition draft.
5. Upload required immutable payloads.
6. Create the next commit object conditionally.
7. If creation conflicts, load the winning commit.
8. Re-evaluate the command against the updated state.
9. If the write outcome is ambiguous, reconcile the exact attempted object.
10. Materialize the confirmed commit through the shared application function.
11. Return the committed receipt.
12. Notify clients and wake dispatchers from committed obligations.

Normal commits must extend a verified predecessor without gaps. Imports and genesis need explicit baseline rules.

One active sequencer per partition reduces contention. The atomic object operation establishes order, not the sequencer's local mutex.

A lost response needs digest and receipt comparison. Never infer successful publication from elapsed time or a local cache.

## Discovery and liveness

Design partition discovery together with admission. A new committed partition cannot depend on an uncommitted secondary catalog update.

Use a canonical registry or a recoverable enumeration protocol. Prove recovery across the crash between root creation and discovery notification.

An independent reconciler must enumerate durable obligations without relying on a healthy query projection or delivered wake message.

Define the maximum supported reconciliation delay under stated host-availability assumptions. A bucket does not activate compute by itself.

## Atomicity across partitions

Colocate related sessions and child admissions when they need one atomic transition. Do not independently shard children by session hash.

Use durable outbox and inbox records across partitions. The sender retains delivery intent until the receiver provides the required receipt.

Make duplicate delivery safe. Specify deduplication retention and delivery ordering where the domain requires it.

Reserve shared budget allocations before dispatch. Keep authoritative naming and routing decisions out of eventually updated query indexes.

Do not introduce cross-partition transactions or live rebalancing in the initial release. Represent distributed workflows with explicit pending states and recovery.

## Retention and garbage collection

Initially retain committed sequence slots. Disable lifecycle deletion for the active journal namespace.

A delayed writer can recreate a deleted sequence key. SlateDB's draft boundary RFC describes this risk. Its design is not automatic proof of Generalist correctness. [W5]

Before online reclamation, validate a deletion boundary or sealed-generation protocol against paused writers and delayed requests.

Preserve checkpoint roots, branch references, reader cursors, receipt evidence, and retained blobs. Protect uploads against concurrent collection before publication.

Object age alone does not prove abandonment. Start with conservative or offline orphan maintenance.

Retire a namespace before purging it. Fence its writers and prevent old credentials or delayed work from restoring live authority.

# 7. Recovery, branches, and workspace semantics

Provide separate operations for inspection, reconstruction, activation, fork, and rewind. Do not combine them through a callback with hidden side effects.

A fresh compatible host must reconstruct the same logical state from retained canonical objects. Define a canonical logical-state digest for comparisons.

Keep payload hydration lazy. Recovery must not load every historical tool output or repository snapshot into memory.

A recovered operation can require provider reconciliation rather than retry. Preserve uncertainty until evidence or an authorized operator decision resolves it.

## Branch policies

| State class                                                 | Fork and rewind behavior                                |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| Conversation, plans, todo state, branch-local configuration | Restore the selected branch state.                      |
| Future operation identities and ownership                   | Allocate fresh identities and generations.              |
| Incurred usage and external-operation receipts              | Retain monotonic evidence; do not erase history.        |
| Approval grants and security restrictions                   | Apply declared scope and current authorization rules.   |
| Shared budget allocation                                    | Reserve a new branch allocation.                        |
| Immutable prompts, artifacts, and workspace references      | Share retained references when policy permits.          |
| Process handles and provider connections                    | Reconstruct, reconnect, or report unsupported recovery. |

Do not describe all persistent values as automatically rewindable. Their declared policies determine behavior.

## Workspace boundary

Agent-state durability does not automatically make a sandbox filesystem durable.

Record workspace identity, base revision, snapshot references, and accepted patches where resume depends on them. Define which adapter can restore each reference.

Isolate concurrent child workspaces or enforce explicit shared-workspace coordination. Merge child changes through a validated result path.

Do not restore arbitrary credentials, untracked secrets, or host files through a default workspace snapshot.

File edits need stale-content checks at execution time. A preview is not authorization to edit a changed file.

Historical reconstruction cannot run workspace cleanup hooks. Session detach, session switch, branch switch, cancellation, and process shutdown need distinct lifecycle reasons.

# 8. Harness integration workstreams

These workstreams extend the canonical runtime. They must not introduce parallel state containers or provider-specific persistence.

## 8.1 Durable extensions and hooks

Build on the existing typed hook system. Existing hook decisions already have serializable representations. [R6]

Define a durable component declaration with a stable key, schema version, initial state, scope, command schema, and transition handlers.

Declare fork behavior, redaction, size limits, and migration behavior where needed. Include an extension-instance identity when several instances can coexist.

Static handlers remain code. Their descriptor, version, and mutable state participate in the canonical model.

An extension receives a bounded state view and an authorized command capability. It cannot mutate another extension's namespace or built-in authority fields.

Effectful hooks use the operation pipeline. Their accepted outcomes become durable inputs to later transitions.

Do not rerun nondeterministic hooks to reconstruct historical state. Record enough evidence to distinguish a replayed decision from a new decision.

Missing extension code must not silently reset state. Permit read-only inspection of retained opaque data where safe, but reject unsupported execution.

Require representative built-in features to use the same extension contract. Avoid privileged hidden paths that bypass its durability rules.

Do not ban every `Map` or closure. Ban recoverability-critical mutable state outside the canonical model. Static registries, memoized projections, and scoped handles remain valid.

## 8.2 Settings and multi-turn control

Declare setting behavior where each setting is defined. Specify schema, default, ownership, scope, inheritance, persistence, and access rules.

Persist effective run settings and explicit changes. Do not reread changing environment defaults during recovery.

Store secret references rather than plaintext credentials. Current security restrictions must constrain restored historical settings.

Define deterministic precedence for application defaults, profiles, session overrides, and child overrides. Reject conflicting declarations instead of silently using module order.

Audit existing Program, hooks, and continuation abstractions before adding another control primitive.

Represent resumable plan, goal, verification, and yield-control behavior as canonical descriptors with bounded retries and explicit parent relationships.

If the current Program model expresses this contract, extend that model. Otherwise, add one scoped behavior abstraction rather than several mode-specific mutexes.

Keep inference-request decisions separate from completion or yield decisions. Make ownership of a multi-turn decision inspectable.

A behavior cannot bypass cancellation, hard budgets, approvals, or host security. Temporary capabilities must expire through explicit transitions.

Test competing behaviors together. Test recovery while one behavior suspends another. Test cancellation before and after a behavior completes.

Do not persist UI keybindings or themes as execution state unless they actually affect execution. Clients translate controls into authorized commands.

## 8.3 Operations, jobs, and bounded streams

Use one durable operation identity across input preparation, execution, provisional updates, cancellation, and settlement.

Retain typed input, tool version, input digest, intent, output references, diagnostics, usage, replay policy, and attempt identity.

Keep raw domain output separate from warnings and display notices. A programmatic consumer must not parse presentation text to recover structured data.

Audit the current toolkit path that filters preliminary results before `Stream.runLast`. Preserve useful progress through a bounded preview channel. [R7]

Do not infer that the entire framework lacks streaming from that one path. Audit other execution routes before replacement.

Use a shared job supervisor for shells, remote tasks, subagents, and other long-lived work where the semantics match.

The supervisor owns deadlines, output limits, concurrency, durable job descriptors, and cancellation. Domain-specific job adapters still implement real execution behavior.

Persist reconstructible job identity and recovery policy, not a JavaScript process handle. After a crash, reconnect only when the host can verify the exact job.

Separate maximum synchronous wait from total job lifetime. If background execution is supported, its obligation must survive process failure.

Enforce an intake byte limit before decoding or accumulating untrusted output. Enforce a separate artifact-storage limit and model-projection limit.

Spill output incrementally when permitted. If the artifact limit cuts output, record that fact. Do not label a truncated artifact as complete output.

Programmatic calls need structured errors, bounded streams, or artifact references for oversized results. Never silently truncate a typed return value.

## 8.4 Cancellation and trust boundaries

Expose cancellation states that distinguish request, acknowledgement, confirmed termination, and unknown external status.

A timeout on the host is not proof that remote work stopped. A backend without confirmed termination must report that limitation.

Run untrusted executable extensions and model-generated code behind a process, worker, container, or sandbox boundary with enforceable limits.

Trusted in-process Effect handlers can remain supported under explicit cooperative-cancellation semantics. Do not advertise them as forcibly terminable.

Enforce workspace and network policy at actual resource boundaries. Do not treat a parsed shell string as complete enforcement for arbitrary binaries.

A new shell interpreter is not a prerequisite for this refactor. Reuse existing sandbox enforcement and define honest capability limits.

Authorize final normalized tool inputs, not only their preliminary preview. Recheck stale workspace content and applicable policy before execution.

## 8.5 Provider compatibility and inference recovery

Reuse the existing inference integrations and Effect AI services where they already own transport, schemas, or provider behavior.

Centralize remaining compatibility knowledge by provider, model identity, API, and relevant version. Represent unknown capability separately from unsupported capability.

Define explicit precedence and reject ambiguous overrides. Do not spread provider-name checks through tools, UI, hooks, and durability modules.

Record the selected model, effective request settings, tool-contract versions, and compatibility-policy version for each durable model operation.

Preserve original input evidence and normalized output evidence where repair occurs. Bound retained payload sizes and apply the configured privacy policy.

Repair only unambiguous protocol representations. Do not turn arbitrary prose into an executable tool call without an explicit parser contract and validation.

Keep tool authorization after normalization. A repair must not broaden requested permissions or change a target resource silently.

For forced calls or structured output, define acceptable fallback behavior. A required guarantee cannot silently become best effort.

Bound corrective inference, repetition recovery, and retries under the same budget. Persist retry decisions when they affect subsequent execution.

Distinguish transport retries from semantic retries. Avoid multiplying retries through SDK, provider, runtime, and tool layers.

Extend existing providers for required capabilities rather than inventing a separate authentication system for every tool. Keep token refresh coordination outside reducers.

Do not add every possible provider feature in this refactor. Implement the compatibility boundary and migrate features that Generalist already exposes.

## 8.6 Tools, resources, and feedback

Version tool schemas and behavior contracts. Bind each invocation to the version actually used.

Keep the default tool surface small enough to measure. Provide bounded discovery or code-based composition for larger integrations when existing abstractions support it.

Discovery must not bypass authorization. Newly exposed tools still enter the same operation journal, quota checks, approvals, and result validation.

Record tool-roster changes when they affect subsequent inference. Do not assume that a smaller roster always improves every model or task.

Use existing media, artifact, and resource abstractions before adding another resource registry. Support range access and typed content metadata where necessary.

Resource adapters cannot fetch secrets, cross tenant boundaries, or escape workspace restrictions through alternate URI schemes.

A resource projection that influences a decision becomes a recorded operation observation. A recomputable preview does not need independent authority.

Provide an optional structured feedback record tied to tool version, run, operation, and diagnostic evidence.

Treat automated feedback as untrusted reports. Do not change code, classify tool correctness, or publish external issues solely from a model complaint.

## 8.7 Client views, prompts, and debugging

Provide one typed read model with stable entity identities and committed cursors. Build prompt context and client views from that model.

Use bounded snapshots and incremental updates. Define gaps, duplicate updates, ordering, cursor expiry, and resynchronization explicitly.

A client must receive existing state before sending a new message. Opening a session cannot depend on a future mutation to populate the view.

A read-only spectator receives no mutation capability. Enforce that rule on the server, not through hidden buttons.

Keep optimistic user actions and provisional tool output separate from committed state. Include attempt and subscription epochs to reject obsolete updates.

Slow subscribers need bounded queues and a resync outcome. Do not drop canonical updates silently or block the entire partition indefinitely.

Typed diagnostics, media references, and tool outcomes must not require clients to parse ANSI text or model-facing summaries.

Sanitize external terminal controls, markup, and unsafe links at the rendering boundary. Preserve raw data only in controlled artifact access.

Keep terminal layout, wrapping, animation, and native scrollback outside durability. A UI's finalized block is not a storage commit receipt.

Define a non-destructive debug interface for snapshots, subscriptions, command injection, and fake model/tool execution.

Existing UI adapters must test against real runtime projections. Do not replace those tests with a parallel mock state machine.

A full terminal layout rewrite remains separate. The required deliverable is a typed protocol that existing and future clients can use.

# 9. Host adapters and activation

## Cloudflare

Wrap `R2Bucket` through the stable native transport. Remove Generalist's SQLite-backed Durable Object store.

Use a Durable Object for host lifecycle and execution locality where appropriate. Persist Generalist obligations in R2.

Treat alarms as wake delivery, not the authoritative schedule. Cloudflare documents at-least-once alarm delivery with finite automatic retries. [W6]

Provide a configured reconciler for missing wakeups and exhausted retries. Test a crash after durable admission but before alarm registration.

Do not assume asynchronous event handlers serialize all storage and network work. Keep canonical order in the shared commit protocol.

## Rivet

Retain actor composition, bounded drain, executable resolution, and lifecycle integration where they remain useful. Replace SQL activation and recovery. [R10]

Use ephemeral actor state for caches. Do not persist canonical Generalist state through `rivetkit/db` or a separate actor database.

Persist job and schedule intent through Generalist. Treat platform schedules as delivery mechanisms with duplicate and failure handling.

Verify actual actor lifecycle behavior against the installed Rivet version. Do not infer exactly-once delivery from an actor abstraction.

## Node, Bun, and other hosts

Use the same engine and format. Supply scoped process resources, a restart strategy, and a configured reconciler.

Keep host-specific dependencies outside portable imports. Use `Uint8Array` and portable stream boundaries in shared modules.

Cross-host recovery requires compatible executable code, credentials, and any referenced workspace adapter. Test those prerequisites explicitly.

# 10. Tonbo, SlateDB, and query projections

Keep neither engine in the default durability dependency graph.

Treat them as optional derived engines above object storage, not implementations of the raw bucket interface.

Evaluate Tonbo for analytical records and SlateDB for indexed query state. This is an integration proposal, not a compatibility or performance claim.

Feed integrations through committed records and verified checkpoints. Store their data under separate namespaces with separate write authority.

Define their source cursor, schema version, lag, rebuild procedure, and corruption behavior. Projection consumers must handle duplicate delivery.

Specify what a rebuild reconstructs. A current-state snapshot cannot recreate analytics that require deleted historical records.

Retain canonical history for the promised analytical window, or explicitly limit the rebuild contract.

Check exact binding versions, runtime support, and remote durability semantics before implementation. SlateDB distinguishes acceptance into memory from completion at object storage. [W7]

Do not force a native library into Workers. Isolate optional native dependencies in separate packages when subpath isolation is insufficient.

If the native journal fails measured correctness or maintenance requirements, revisit one default engine decision through an architecture review.

Do not solve uncertainty by supporting three canonical engines. Any later canonical-engine replacement needs a format migration and the complete conformance suite.

# 11. Cleanup and dependency plan

Verify paths against the actual implementation branch. The paths below describe the reviewed baseline, not an instruction to delete equivalent compliant replacements.

| Area                                                     | Required outcome                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/pg/**`, `src/mysql/**`                              | Remove production durability implementations and public exports.                                               |
| `src/runtime/sql/**`                                     | Extract domain semantics, then remove SQL persistence, locks, migrations, and row codecs.                      |
| `src/runtime/sql-driver.ts`, `src/runtime/sqlite-bun.ts` | Remove backend composition and exports.                                                                        |
| `src/runtime/memory/store*`                              | Remove duplicate runtime behavior; test the production engine through a test object store.                     |
| `src/runtime/memory/layer/**`                            | Move generic composition to storage-neutral modules.                                                           |
| `src/blob-store/index.ts`                                | Retain useful references and access semantics over object storage; remove alternate production backing stores. |
| `src/unstable/cloudflare/durable-objects/**`             | Remove SQL bridges; retain the thin host integration.                                                          |
| `src/unstable/rivet/actors/**`                           | Remove SQL ownership and recovery; retain the thin host integration.                                           |
| `src/testing/runtime-driver/**`                          | Preserve behavioral cases and remove backend-specific exemptions.                                              |
| Package manifests and lockfile                           | Remove unused SQL drivers, SQL peers, and obsolete exports.                                                    |
| Docs, examples, generated surfaces                       | Replace backend matrices with one durability model and transport setup.                                        |

Paths are relative to `packages/generalist/` unless stated otherwise.

Audit memo persistence, policy storage, instruction revisions, executable registrations, and artifacts. Do not leave a hidden SQL authority outside `runtime/sql`.

Preserve input limits, exact retry checks, session ancestry validation, cancellation outcomes, and operator recovery.

Avoid forwarding files with no useful boundary. Avoid duplicate serializers, parallel schema libraries, and generic plugin layers without an actual extension need.

Keep new domain services small enough to explain. Simplification means fewer independent implementations, not one enormous service.

# 12. Effect and implementation rules

Use the repository's pinned Effect APIs and established conventions. The inspected code uses `Context.Service`, `Layer`, `Schema`, and typed Effect results. [R6, R7]

Do not copy obsolete service examples from earlier conversation sketches. Compile every published example against the actual package.

Decode object bytes at trust boundaries. Use tagged errors for conflict, missing data, invalid state, unsupported format, stale authority, and unavailable storage.

Keep error causes and retry classifications. Do not replace errors with unstructured strings merely to shorten signatures.

Use scoped fibers, resources, queues, and finalizers. Put Promise conversion at SDK boundaries and host entrypoints.

Do not use `Effect.orDie`, unchecked casts, or relaxed schemas to preserve a legacy signature that no longer describes failures.

Do not make entire network calls uninterruptible. Reconcile ambiguous outcomes after interruption.

Keep time and randomness injectable. Tests need deterministic clocks, generated identities, and transport faults.

Use immutable committed data or controlled encapsulation. Clients must not receive mutable references to internal canonical objects.

Enforce import boundaries through automated checks. A code review convention alone is insufficient to keep SQL and native libraries outside the portable graph.

# 13. Implementation sequence and acceptance gates

Each phase produces integrated code and evidence. Do not stop after investigation when implementation remains non-blocked.

## Phase 0 — Reconcile and inventory

1. Read repository instructions and inspect the active worktree.
2. Record the implementation baseline and existing refactor work.
3. Inventory every durable field, mutation, dependency, and recovery path.
4. Map current tests to the invariant IDs.
5. Assign branch policy and atomic scope to each state category.
6. Record baseline measurements and representative fixtures.

Deliverables: state inventory, dependency map, behavior matrix, and architecture decisions for partitioning and replay.

Gate: Every existing capability is preserved, explicitly redesigned, or explicitly removed with a reason.

## Phase 1 — Extract the domain model

1. Move storage-neutral schemas and errors out of SQL modules.
2. Define command, change, observation, and receipt contracts.
3. Implement deterministic decisions and one committed-state application path.
4. Preserve a temporary reference harness for old behavior.
5. Add independent invariant checks for the new model.

Gate: Domain modules have no SQL or host-storage dependencies. Live application and replay agree without external work.

## Phase 2 — Build the object protocol

1. Implement the shared ObjectStore contract.
2. Implement generic S3 and native R2 transports.
3. Add deterministic transport and crash faults.
4. Implement commits, receipts, fencing, discovery, and snapshots.
5. Validate the protocol model before enabling deletion.
6. Add provider conformance tests against actual supported services.

Gate: Independent clients converge on one valid committed prefix under faults. Required provider tests have recorded results.

## Phase 3 — Migrate runtime semantics

1. Migrate admission, sessions, model outcomes, and tool outcomes.
2. Migrate waits, approvals, cancellation, and steering.
3. Migrate children, fan-out, budgets, and acknowledgements.
4. Migrate schedules, outbox delivery, and operator recovery.
5. Migrate artifacts, forks, and rewind.
6. Test all crash boundaries through real public runtime operations.

Gate: Existing domain conformance cases pass without SQL. Unknown external outcomes remain honest.

## Phase 4 — Integrate extensions and control state

1. Implement durable component declarations through existing extension abstractions.
2. Migrate representative stateful built-ins and hooks.
3. Centralize setting declarations and inheritance.
4. Integrate resumable multi-turn control through the existing Program model where possible.
5. Add adversarial fork, switch, crash, and resume scenarios.

Gate: Stateful features need no custom lifecycle repair code to restore their declared state.

## Phase 5 — Integrate bounded execution and inference

1. Unify operation identity across previews, results, and cancellation.
2. Integrate bounded jobs and artifact output.
3. Centralize compatibility resolution for existing inference features.
4. Persist effective request and normalization evidence.
5. Verify isolation, termination reporting, and policy enforcement.

Gate: New execution paths preserve typed results, enforce limits, and never bypass durable intent barriers.

## Phase 6 — Replace hosts and client paths

1. Replace Cloudflare and Rivet SQL composition.
2. Integrate Node and Bun lifecycle and reconciliation.
3. Expose committed snapshots and resumable subscriptions.
4. Update existing UI and remote adapters.
5. Test fresh-session display and read-only spectators.
6. Test cross-host recovery through both R2 access paths.

Gate: Supported hosts recover without private Generalist databases. Clients consume the same committed state.

## Phase 7 — Rehearse migration and delete legacy code

1. Determine whether an identified deployment requires retained-data migration.
2. Implement fixture-verified export and import when preservation applies.
3. Validate a fresh namespace and rollback boundaries.
4. Remove legacy durability implementations and dependencies.
5. Regenerate documentation, package exports, and checked artifacts.
6. Run the complete verification pipeline.

Gate: Production imports contain no SQL durability or required native database engine. No retained feature uses a hidden legacy path.

## Phase 8 — Stabilize and publish evidence

1. Define supported formats, compatibility rules, and retention guarantees.
2. Publish actual provider and host support results.
3. Publish benchmark configuration and measured results.
4. Document backup, restore, corruption, and stalled-operation procedures.
5. Complete the final invariant traceability report.

Gate: Stable status follows verified semantics and release checks, not an export rename.

Evaluate optional Tonbo or SlateDB projections after these gates. Do not block canonical durability on optional analytical integrations.

## Parallel work rules

One implementation owner controls domain schemas and the commit protocol. Other agents can implement transport, host, and projection integrations after those contracts stabilize.

An independent reviewer tests failure cases and authority boundaries. That review must not accept the implementation's own state hash as its only correctness oracle.

Integrate each subagent result into the primary branch. Do not leave completed work as disconnected patches or substitute plans for implementation.

# 14. Required tests

Use deterministic simulation, public-API integration tests, real-provider conformance, and host tests. Keep seeds and failure traces.

| Case                                             | Required result                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Concurrent creates for one sequence              | One commit wins; losing commands re-evaluate without external re-execution. |
| Successful PUT with lost response                | Reconciliation returns the original receipt.                                |
| Same idempotency key, different input            | A typed conflict prevents acceptance.                                       |
| Crash before publication                         | No partial transition becomes canonical.                                    |
| Crash after publication                          | Fresh recovery includes the committed transition.                           |
| Stale owner after takeover                       | Protected writes fail under the old generation.                             |
| Unknown external result                          | Recovery does not invent success or blindly retry.                          |
| Atomic model/session update                      | Operation outcome, session ancestry, and continuation agree.                |
| Parent suspension plus child admission           | The declared atomic scope contains all required changes.                    |
| Cross-partition duplicate delivery               | The receiver applies the identified message once within its guarantee.      |
| Admission before lost wake                       | Reconciliation discovers the obligation.                                    |
| New partition before catalog notification        | Recovery still discovers the committed partition.                           |
| Duplicate schedule occurrence                    | The occurrence produces one accepted transition.                            |
| Corrupt or unsupported record                    | Recovery fails explicitly before mutation.                                  |
| Snapshot failure                                 | A retained valid recovery path still exists.                                |
| Paused writer versus GC                          | No retired sequence reappears as an accepted new commit.                    |
| Fork with historical references                  | Required blobs and state remain available.                                  |
| Rewind after incurred cost                       | Historical costs and external receipts remain intact.                       |
| Rewind after ownership transfer                  | Old execution authority never returns.                                      |
| Extension state on an abandoned branch           | Current recovery excludes the abandoned branch's local state.               |
| Crash between extension mutation and tool result | Accepted extension state survives without a synthetic tool result.          |
| Missing extension version                        | Execution rejects incompatibility instead of resetting state.               |
| Session switch versus process exit               | Switching views does not run shutdown-only side effects.                    |
| Composed control behaviors                       | Recovery preserves ownership, retries, and nesting.                         |
| Tool emits excessive output                      | Intake, storage, and projection limits apply independently.                 |
| Uncooperative execution                          | The backend terminates it or reports an honest limitation.                  |
| Old-attempt preview after restart                | Clients reject obsolete provisional updates.                                |
| Subscription gap or duplicate                    | Clients resync or deduplicate without hidden state loss.                    |
| New client opens an existing session             | The initial snapshot appears without a new user message.                    |
| Untrusted output or spectator request            | Rendering and server authorization preserve their boundaries.               |
| Projection deletion                              | Runtime correctness survives; supported projections rebuild.                |
| Tenant or resource escape attempt                | Access fails before bytes or mutations cross the boundary.                  |
| R2 native/S3 interoperability                    | Both transports recover the same logical state and receipt history.         |
| Host change with missing executable/workspace    | Activation fails explicitly rather than starting different work.            |

Add property-based sequences for admit, claim, operate, cancel, fork, rewind, restart, compact, and project.

Use an independent small reference model or invariant oracle. Test replay equality, but do not treat replay equality as the entire correctness proof.

Model-check critical sequencing, takeover, lost-response, and deletion interleavings with a bounded state-space model. Document assumptions and explored bounds.

A finite model check is not a proof of every implementation behavior. Tie modeled actions to integration tests and real failure traces.

Remote tests require real credentials and services. If unavailable, record an unmet gate. Do not label skipped tests as provider support.

# 15. Performance and compatibility gates

Measure durable receipt latency separately from provisional responsiveness.

Record p50, p95, and p99 for admission, outcome commits, state reads, cold recovery, and wake recovery.

Measure requests per accepted command, bytes per transition, replay work, conflict retries, live memory, artifact throughput, and idle reconciliation cost.

Exercise one hot partition, many independent partitions, long histories, large tool output, sleeping work, and repeated owner replacement.

Measure tool-roster and inference changes separately from storage changes. Do not attribute a model-performance change to object storage without evidence.

Record runtime version, provider, region, payload distribution, concurrency, retry settings, and test seed.

Choose numeric gates from the actual product workload before optimization. Do not invent latency promises from aggregate object-store benchmarks.

Test standard S3 and both R2 paths first. Qualify other S3-compatible providers independently.

Specialized bucket types can need different authentication, addressing, and discovery behavior. Do not claim S3 Express support from a custom endpoint alone.

A successful capability probe detects obvious incompatibilities. It does not prove arbitrary concurrent correctness.

# 16. Data migration and rollout

Use a bounded maintenance cutover for retained production data. Do not add permanent dual-write or fallback logic.

1. Stop new admissions in the source deployment.
2. Drain or explicitly suspend active runs.
3. Fence and stop all source writers.
4. Export a consistent source snapshot.
5. Export required identities, receipts, outcomes, and pending obligations.
6. Copy and verify referenced payloads.
7. Import into a fresh destination namespace.
8. Compare domain state, branches, budgets, and recovery decisions.
9. Issue fresh destination ownership generations.
10. Switch routing under controlled deployment procedures.
11. Resume only operations permitted by their recovery policy.
12. Retain the source backup read-only.

Do not export only the public event stream. Include extension state, settings, session ancestry, unresolved effects, and branch policies.

A missing legacy field is a migration question, not permission to invent historical state. Record explicit import limitations.

Keep SQL readers in a standalone migration utility pinned to the old release. Do not ship that utility inside stable Generalist durability.

When no retained deployment needs migration, use a fresh namespace. Do not retain SQL adapters merely for hypothetical compatibility.

Rollback before new external actions can restore source routing under fencing. After new actions, rollback requires reconciliation or reverse migration.

Do not automatically switch to the old database after a destination failure. That behavior can repeat accepted work.

# 17. Completion definition and agent report

The refactor is complete only when the supported production path satisfies the invariant matrix.

Provide the following deliverables:

1. Provide the implementation and deleted legacy code.
2. Provide a state inventory with branch policies and atomic scopes.
3. Provide architecture decisions for protocol, discovery, retention, and compatibility.
4. Provide compiled S3 and native R2 examples.
5. Provide host recovery examples for supported deployment targets.
6. Provide invariant-to-test traceability and actual test results.
7. Provide dependency and export audits.
8. Provide migration fixtures and procedures where required.
9. Provide benchmark evidence with stated conditions.
10. Provide remaining limitations without presenting them as completed features.

The final report must distinguish implemented, tested, untested, deferred, and blocked work.

Report exact commands and their outcomes. Report skipped remote tests separately. Do not weaken schemas, suppress failures, or replace real integration tests to obtain a green result.

Do not call the work complete while SQL remains on the supported durability path or required state remains outside canonical recovery.

The target is one recoverable runtime model, one object-native durability engine, thin host adapters, and a smaller maintained implementation.

# Reference notes

The sources below support inspected facts and protocol cautions. The normative requirements above are Generalist design decisions, not claims that another system implements them.

Repository sources use the verified review commit. The implementation agent must inspect its current branch before changing any path.

- [R1] Review baseline: https://github.com/In-Time-Tec/generalist/commit/7042211fb3d29c8ff74234e9b400dc6286c03d1d
- [R2] Store types and claims: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/runtime/run/store-types.ts
- [R3] RunStore contract: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/runtime/run/store.ts
- [R4] SQL store composition: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/runtime/sql/store.ts
- [R5] Durable driver contract: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/core/durable/driver/contract.ts
- [R6] Existing hook declarations: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/hooks/index.ts
- [R7] Existing tool executor: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/core/tools/tool-executor.ts
- [R8] BlobStore: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/blob-store/index.ts
- [R9] Cloudflare adapter: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/unstable/cloudflare/durable-objects/index.ts
- [R10] Rivet adapter: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/unstable/rivet/actors/runtime-actor.ts
- [R11] Conformance contract: https://github.com/In-Time-Tec/generalist/blob/7042211fb3d29c8ff74234e9b400dc6286c03d1d/packages/generalist/src/testing/runtime-driver/contract.ts
- [W1] Stencil, The Harness Playbook, September 2, 2026: https://stencil.so/blog/harness-playbook
- [W2] AWS conditional writes: https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
- [W3] R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- [W4] R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- [W5] SlateDB garbage-collection boundary RFC, draft: https://slatedb.io/rfcs/0026-garbage-collector-boundary/
- [W6] Durable Object alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- [W7] SlateDB write semantics: https://slatedb.io/docs/design/writes/
- [W8] R2 S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/
- [W9] Tonbo project: https://tonbo.io/
