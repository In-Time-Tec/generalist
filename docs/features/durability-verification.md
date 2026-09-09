---
title: "Durability verification report"
description: "Trace the clean-v1 durability invariants and required cases to bounded local evidence and open gates."
---

This report maps the durability contract in `PLAN.md` to executable tests. It records local evidence, not a proof of every implementation behavior or certification of AWS S3 or deployed Cloudflare R2.

Statuses mean:

- **Verified**: the cited test ran and passed in the local verification commands below.
- **Implemented/unverified**: a test exists, but this report's verification run did not execute it or does not cover the whole requirement.
- **Missing**: no test was found for the exact normative case.
- **Deliberately excluded**: the governing clean-v1 scope excludes the behavior; related safety evidence is still named.

## Fixed long-Session cold recovery — September 8, 2026

The local gate in `scripts/durability-cold-recovery.ts` completes 1,000 actual durable Tool executions and retains eight child conversations. It requires an explicitly configured 64 MiB partition with 16 MiB reserved for settlement. **This workload does not fit the default 16 MiB partition.** Pagination is not a partition-growth solution, and these results do not establish an unlimited Session lifetime.

The measured source checkpoint was `477cc407229cfd52bb19cddc8efc5ef78d5ad2c9`, incorporating bounded Tool kind controls, obligation reservation, retained child Sessions, the corrected continuation ledger and durable Run/message waits from canonical main `2cd1ef8da19e338bb4fdc55bb5b6f5e2dbf4c318`, and the generated API documentation for that source. The machine ran macOS 26.6.2 (25G83), arm64, Bun 1.4.0 (`34cbb9a40`), and Effect 4.0.0-rc.112. The transport was the repository's in-memory ObjectStore simulator over the production durability engine. No model credentials, cloud bucket, or live provider were used.

### Workload and recovery boundary

- One partition contains one coordinating Agent Session, eight child Agent Sessions, and 1,000 sequential sponsored Tool Runs. Each child executes a scripted model response, retaining its prompt and response. Each Tool executes through `RunExecutor` with `replay: "never"`, returns a 256-character ASCII result, and incurs a fixed 1 ms asynchronous handler delay. That delay allows the simulator's host heartbeat timers to run; leases and timeouts are unchanged.
- One additional Tool executes and suspends with a durable ToolWait after the 1,000 completed Tools. The coordinator and suspended Tool remain pending during reconstruction. Payloads and command indices are fixed, with no random payload distribution; runtime-generated cryptographic identities and observation timestamps still vary.
- The build scope closes before each of three independently constructed Layers. Each Layer gets new journal, codec, Runtime, model, and registry instances. Only the simulated bucket's canonical object bytes and the caller's expected identities survive. No product projection, session cache, or executor result cache is provided to recovery.
- Cold timing covers `Layer.build`, including canonical reconstruction. A separate audit verifies all 1,000 terminal statuses and incurred operation records, pages the complete retained family, reads each child conversation, and verifies the pending wait. Handler counts remain exactly 1,001 across all three audits. Afterwards, a fresh activated Layer cancels the pending Tool and coordinator.
- The harness never deletes journal slots, snapshots, or referenced payloads. Closing a test fixture's process is not a production retention policy. This fixture tests fresh worker Layers, not object-service restart, remote network behavior, or a fresh operating-system process.

### Measured baseline and local regression bounds

The complete measured invocation took about 465 seconds. These are three sequential cold samples, not a statistically qualified p95 or p99.

| Metric                                      | Measured baseline                 | Current local gate             |
| ------------------------------------------- | --------------------------------- | ------------------------------ |
| Cold construction                           | 1,261.48 / 1,186.12 / 1,225.96 ms | At most 5,000 ms per sample    |
| Cold object reads                           | 70 per sample                     | At most 256                    |
| Cold object lists                           | 11 per sample                     | At most 32                     |
| Cold returned bytes                         | 25,074,433 per sample             | At most 64 MiB                 |
| Cold object writes                          | 0                                 | Exactly 0                      |
| Process RSS sampled after cold construction | 3.89 / 4.22 / 4.28 GB, decimal    | At most 6 GiB at that boundary |
| Complete outcome/family/wait audit          | 97.34 / 70.08 / 70.33 seconds     | At most 120 seconds per sample |

These thresholds are local regression guards selected from this fixed workload's baseline, not production SLOs. RSS includes the simulator's bucket, retained snapshots, runtime allocations, and the process's GC history; it is not isolated worker memory, a measured allocation delta, or a continuously sampled peak. The report also emits RSS and heap before reconstruction and every 100 completed Tools.

Building the first 1,000 Tools made 50,647 reads, 105,209 lists, and 9,349 create attempts, returning 214,681,844,476 bytes and attempting 956,561,656 write bytes. These totals include the retained-child setup and host maintenance. Repeated canonical validation reads count again even when the underlying simulator supplies memory-resident bytes. They expose a substantial object-operation cost; they are not network throughput, latency, AWS/R2 cost, or deployed capacity measurements. Cold reconstruction is much cheaper than repeatedly auditing every Run through separate canonical reads.

The prior measured source checkpoint `acceb506c2178d2a8b86c02d73a4ac199608d80e` passed the same workload before canonical main added durable Run/message waits; it recorded 1,083.51 / 1,334.91 / 1,123.99 ms cold construction, 68 reads, 25,073,361 returned bytes, and 62.54 / 66.51 / 70.96 second audits. The earlier pre-continuation checkpoint `d18b1ea96d7a56539ffaa593b5fa8f06ff831f7c` recorded 1,232.42 / 1,119.50 / 1,103.22 ms cold construction, 69 reads, 25,072,026 returned bytes, and 66.15 / 66.20 / 67.54 second audits. These historical measurements remain evidence for their respective checkpoints; the current table supersedes them for the merged source.

Before changing the engine, the initial Tool checkpoint `db6abb8fbdf039dc5a29e0a92983ca6c3484c73d` reached 809 completed Tools before the next admission exceeded the default 16 MiB state-plus-receipt limit. After the Tool allocation fix and adding retained children, a run with the default reserve completed 480 Tools before the next Tool reported a failed status; that preliminary log did not record the nested failure, so it establishes a failed gate rather than a precise capacity measurement. The explicit 64 MiB configuration above passed; the default was not enlarged and no compaction or canonical segmentation was introduced.

### Admission headroom and its limits

The journal checks the complete post-transition canonical state **including the new immutable command receipt**, under the same conditional-create ordering as admission. `admissionReserveBytes` defaults to one quarter of `maxStateBytes`. Admission and new operation-dispatch paths cannot consume that region; completion, cancellation, recovery, and exact command receipt reconciliation retain access to the full hard cap. A failed admission does not publish its state transition, and retrying an already committed command still returns its original receipt.

In addition to that global reserve, each nonterminal Tool Run carries a conservative outstanding-obligation reservation. It uses #463's `256 KiB` outcome bound, `64 × 16 KiB` progress bound, bounded progress/outcome encoding overhead, and six bounded control/receipt transitions. As progress and operation phases commit, their consumed allowance is released; cancellation and open waits add one control allowance each. The reservation remains until the Run is terminal, so several concurrently admitted Tools cannot consume one another's settlement capacity. Control allowance is capped by the journal's `maximumEventBytes` boundary, while `maxCommitBytes` still rejects any individual canonical commit that exceeds its configured limit. A Tool progress callback returns `false` rather than dispatching an unbounded durable event if a limit is reached.

`packages/generalist/test/durability/internal/runtime-state/capacity.test.ts` uses a 128 KiB partition and 64 KiB reserve. It fills admission capacity with real RunStore admissions while an incurred operation remains running, then records an 8 KiB external receipt, refuses a new operation after settlement consumes the reserve, completes the incurred Run, and cancels a second Run. A fresh Layer verifies the outcome, terminal statuses, and unchanged admission/cancellation receipts. Invalid or zero reserve configuration is rejected.

These are finite byte reservations, **not a guarantee for arbitrary outstanding work**. Unbounded output outside the Tool policy, other state writes, indefinite heartbeat/receipt growth, or too many independent non-Tool obligations can still consume capacity. The measured acceptance envelope is the workload above plus the separately tested concurrent bounded-settlement case; neither proves that every admitted workload can always settle. Applications must bound pending work and output, stop admitting work before partition exhaustion, and provision a fresh partition for new independent work. Do not split atomically related work or delete canonical history to reclaim room. Exceeding these bounds requires new qualification, not merely a larger UI page size.

### Reproduction and release scope

Install the committed lockfile with Bun 1.4.0, then run from the repository root. On the shared Mac, serialize this workload against full suites with the same advisory lock:

```bash
python3 -u - <<'PY'
import fcntl
from pathlib import Path
import subprocess

path = Path.home() / ".capy/work/generalist-full-gates.lock"
path.parent.mkdir(parents=True, exist_ok=True)
with path.open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    raise SystemExit(subprocess.run(["bun", "scripts/durability-cold-recovery.ts"]).returncode)
PY
```

The fixed workload is an explicit, opt-in long-running gate, not an extra thousand-Tool workload in every unit-test invocation. The focused capacity regression runs in the normal test suite. This change's simulator evidence is separate from local MinIO/Miniflare transport qualification and from release acceptance. Release qualification still requires full check/test/package results and detached-commit artifacts under the release workflow; AWS and deployed R2 remain untested here.

## Independent model bounds

`independent object Runtime domain model` in `packages/generalist/test/durability/internal/domain-model-suite.ts` uses a small business model with counters, run states, active conversation entries, and an external receipt. Expected values come only from authored actions. Production reducers, persisted snapshots, canonical state hashes, and internal digests do not generate the oracle's expected state. The production digest function is used only to form a valid model-response command at the real API boundary.

The model assumes one strongly consistent simulated bucket, one partition, deterministic trusted command authors, immutable retained commits, and no fairness claim. It runs seeds `1, 7, 19, 42, 99, 257, 1024, 0x5eed`: eight traces, nine actions per trace, at most three Runs per trace, 72 real action applications, and 17 distinct control states under a 128-state guard. Every trace covers `admit`, `claim`, `operate`, `cancel`, `fork`, `rewind`, `restart`, `compact`, and `project` once. Restart positions and cancel/rewind order vary by seed.

The integration bridge uses real object Runtime/Journal commands plus native Effect AI `Prompt` and `Response` values. It checks exact admission, claim, operation, response, checkpoint, fork, cancel, and rewind retries; one modeled dispatch admission; retained external receipts; monotonic branch history and tool cost; fresh-Layer reconstruction; inactive-but-retained compaction evidence; and consistency among inspection, snapshot, history cursor, Session path, and operation projections. It checks Run count/status/claim, budget, history cost, active Session entries, branch status, and retained operation state after every transition. Executor and external-reconciliation tests, not the modeled counter, provide the no-redispatch evidence.

The separate `independent bounded numbered-slot protocol model` retains its own stronger sequencing scope: exhaustive depth 18, two writers, two attempts per command, a 250,000-state guard, four authored programs, 16 deterministic seeded programs with at most 64 scheduler actions, and mutation checks for overwrite, gap, stale rebase, ignored fencing, identity-only deduplication, bad digest, premature acknowledgement, and deletion. Its assumptions and per-run frontier counts are emitted by the test on failure or diagnostic output.

## Invariant traceability

| Invariant                                      | Executable evidence                                                                                                                                                                                                                                                    | Current result and limitation                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01 — one logical authority                 | `independent object Runtime domain model > matches the independent business oracle…`; `journal > bounds state plus retained receipts…`                                                                                                                                 | **Verified** for bounded partition state and three related Runs; this is not a proof of arbitrary tenant scale.                                                                                                                                                         |
| INV-02 — complete recoverability               | `object Runtime canonical mutations > recovers an admitted run and its host session on a fresh independent layer`; `canonical runtime state > reconstructs authority, unknown effects, waits and branched Session history on a fresh host`; domain-model seeded traces | **Verified** for cited inventories and traces. Completeness beyond the encoded inventory remains an audit assumption, not something a finite test can prove.                                                                                                            |
| INV-03 — one durable mutation path             | domain-model seeded traces; `object-native > keeps failed publication atomic and retries one exact completion`                                                                                                                                                         | **Verified** through public RunStore commands and the canonical object journal. The tests do not prove an absent hidden writer.                                                                                                                                         |
| INV-04 — deterministic transitions             | `independent bounded numbered-slot protocol model > enumerates every enabled interleaving…`; its eight negative controls                                                                                                                                               | **Verified** within the published finite alphabet and bounds.                                                                                                                                                                                                           |
| INV-05 — one journal protocol per partition    | `journal > serializes independent writers and reevaluates only the losing deterministic reducer`; real JournalEngine bridge cases                                                                                                                                      | **Verified** for local numbered-slot contention. No global ordering is claimed.                                                                                                                                                                                         |
| INV-06 — durable acknowledgement               | `numbered-slot model / real JournalEngine boundary > resolves a successful lost acknowledgement…`; `returns indeterminate rather than an acknowledgement…`                                                                                                             | **Verified** on the simulator fault boundary.                                                                                                                                                                                                                           |
| INV-07 — idempotent commands                   | domain-model exact retries; `journal > returns the winning original receipt…`; `replays one generated Session append…`                                                                                                                                                 | **Verified** for exact retry and divergent input conflict with retained receipts.                                                                                                                                                                                       |
| INV-08 — fenced execution                      | `object-native > raises run and Session fences after fresh-host recovery and rejects stale writes`; `session appends survive restart and stale run/session authority cannot write after transfer`                                                                      | **Verified** for separate run and Session authority.                                                                                                                                                                                                                    |
| INV-09 — honest external effects               | domain-model retained never-replay receipt and modeled dispatch admission; `fresh ownership preserves an uncertain never-replay operation as Unknown`; executor no-redispatch tests                                                                                    | **Verified** for settled and Unknown never-replay operations. The model counter is not executor evidence, and this does not promise exactly-once external execution.                                                                                                    |
| INV-10 — read-only replay                      | domain-model final fresh read Layer (`create` count zero); `discovery > never creates markers, diagnostics, or heartbeats during reconstruction`; `journal > reconstructs with read-only credentials…`                                                                 | **Verified** for these reconstruction paths.                                                                                                                                                                                                                            |
| INV-11 — explicit branch policy                | domain-model rewind; `object branch evidence > A-B-A rewind retains incurred spend…`; shared `fork-rewind` and payload-inheritance cases                                                                                                                               | **Verified** for conversation, ownership, budgets, costs, and operation receipts. Every future canonical field still needs an explicit policy.                                                                                                                          |
| INV-12 — snapshots and retention agree         | `journal > acknowledges a committed command after snapshot failure…`; `refuses a retained-history gap…`; protocol deletion negative control                                                                                                                            | **Verified** for retained recovery and gap rejection. Online prefix reclamation is **deliberately excluded** from clean-v1 acceptance.                                                                                                                                  |
| INV-13 — projections do not decide correctness | domain-model fresh projection; canonical logical-state comparison; `rebuilds a deleted client projection from the authoritative Session snapshot`                                                                                                                      | **Verified** for rebuildable derived client state. The test drops no journal object.                                                                                                                                                                                    |
| INV-14 — explicit stream durability            | fresh-process lane fencing; cadence-bounded storage-authorized WebSocket preview delivery; Server replacement snapshots; Foldkit epoch/generation/attempt/sequence/offset/bound tests                                                                                  | **Verified** for bounded memory-only previews through the shipped view. Authority refresh and network send are not atomic; post-refresh fences, replacement epochs, and client tombstones reject stale delivery. Previews remain outside committed cursors and entries. |
| INV-15 — host-owned authority                  | Server read/mutation authorization denials; tenant/bearer isolation; AG-UI authority-input rejection                                                                                                                                                                   | **Verified** for the tested host/server boundaries. Sandbox credential non-exposure remains an architectural boundary, not a universal proof.                                                                                                                           |
| INV-16 — bounded resource use                  | shared durable-value bounds; journal replay byte bounds; host conversation bounds; model-preview bounds; finite-uninterruptible cancellation test                                                                                                                      | **Verified** for separate storage/projection-facing bounds and honest in-process cancellation. This does not establish forcible termination for trusted in-process code.                                                                                                |
| INV-17 — versioned dependencies and extensions | unknown-Agent recovery; canonical executable authority; component missing/changed-version tests; Tasks accepted-mutation recovery; unavailable inherited-workspace rejection                                                                                           | **Verified** for executable, extension, and current snapshot restoration identity. The journal does not yet carry a portable workspace adapter/base descriptor.                                                                                                         |
| INV-18 — object storage only                   | repository rules; `unstable/cloudflare/export-graphs.test.ts > keeps supported Cloudflare exports free of forbidden imports`                                                                                                                                           | **Verified** by repository-rule checks below for the inspected graph. Dependency absence cannot prove that an application supplied no alternate authority.                                                                                                              |

## Required-case matrix

| Normative case                                   | Test symbol                                                                                                                                                     | Status                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent creates for one sequence              | `journal > serializes independent writers and reevaluates only the losing deterministic reducer`; real JournalEngine delayed-writer bridge                      | **Verified**                                                                                                                       |
| Successful PUT with lost response                | real JournalEngine `resolves a successful lost acknowledgement to the exact original input and receipt`                                                         | **Verified**                                                                                                                       |
| Same idempotency key, different input            | `journal > returns the winning original receipt for concurrent identical commands without reevaluation`                                                         | **Verified**                                                                                                                       |
| Crash before publication                         | `object-native > keeps failed publication atomic and retries one exact completion`                                                                              | **Verified**                                                                                                                       |
| Crash after publication                          | `model response fault conformance > recovers one atomic model projection at after-publication-*`                                                                | **Verified**                                                                                                                       |
| Stale owner after takeover                       | `object-native > raises run and Session fences after fresh-host recovery and rejects stale writes`                                                              | **Verified**                                                                                                                       |
| Unknown external result                          | `object-native > recovers Unknown without redispatch and resolves exactly one outcome across reopen`                                                            | **Verified**                                                                                                                       |
| Atomic model/session update                      | `model response fault conformance > recovers one atomic model projection…`                                                                                      | **Verified**                                                                                                                       |
| Parent suspension plus child admission           | `reopens an atomic object root and initial child admission`; `object preserves the Code Mode boundary after a crash after-atomic-admission`                     | **Verified**                                                                                                                       |
| Cross-partition duplicate delivery               | `fresh two-partition hosts recover lost admitRoot without redispatch` asserts one receiver Run and one execution after ambiguous delivery retry                 | **Verified**                                                                                                                       |
| Admission before lost wake                       | `object-native > recovers a committed event missed while no notification listener exists`                                                                       | **Verified** for a known committed Run; outstanding cross-partition obligation enumeration is not established.                     |
| New partition before catalog notification        | `tenant partition discovery > reopens committed partitions from only tenant scope after all notifications are lost`; fresh-host discovery test                  | **Verified**                                                                                                                       |
| Duplicate schedule occurrence                    | `object-native > persists a schedule and admits one occurrence across two competing scheduler owners`                                                           | **Verified**                                                                                                                       |
| Corrupt or unsupported record                    | journal checksum/version/parent-chain cases; corrupt discovered-journal host case                                                                               | **Verified**                                                                                                                       |
| Snapshot failure                                 | `journal > acknowledges a committed command after snapshot failure but blocks extension until the recovery boundary publishes`                                  | **Verified**                                                                                                                       |
| Paused writer versus GC                          | protocol model deletion mutant and cancelled delayed-create Journal bridge                                                                                      | **Verified** for retention/no deletion; online GC is **deliberately excluded**.                                                    |
| Fork with historical references                  | `object-native > keeps inherited model responses self-contained through nested forks and source rewind`; Artifact branch cases                                  | **Verified**                                                                                                                       |
| Rewind after incurred cost                       | domain-model seeded traces; `object branch evidence > A-B-A rewind retains incurred spend…`                                                                     | **Verified**                                                                                                                       |
| Rewind after ownership transfer                  | domain-model seeded traces; the same A-B-A branch test                                                                                                          | **Verified**                                                                                                                       |
| Extension state on an abandoned branch           | `restores selected component state and receipts while keeping branches independent`                                                                             | **Verified**                                                                                                                       |
| Crash between extension mutation and tool result | `reopens a Tasks mutation accepted before its tool result and retries the unfinished command once`                                                              | **Verified**                                                                                                                       |
| Missing extension version                        | `rejects missing registrations and changed handler versions before scheduling execution`                                                                        | **Verified**                                                                                                                       |
| Session switch versus process exit               | `switching Session views closes only the old subscription without sending shutdown commands`                                                                    | **Verified** for the view/client boundary; this does not exercise underlying workspace shutdown hooks.                             |
| Composed control behaviors                       | Program host-boundary suite; object Code Mode crash/recovery cases; Program fork/rewind branch case                                                             | **Verified** for the mapped ownership, retry, suspension, and nesting behaviors.                                                   |
| Tool emits excessive output                      | shared oversized durable-value test; host active-path bounds; model-preview payload/subscriber bounds                                                           | **Verified** as separate limits; no silent truncation is inferred across the boundaries.                                           |
| Uncooperative execution                          | `keeps cancellation nonterminal until finite uninterruptible tool work exits`                                                                                   | **Verified**                                                                                                                       |
| Old-attempt preview after restart                | fresh-process lane test; `rejects obsolete previews after snapshot rebuild and bounds provisional ordering`; WebSocket old-owner revocation test                | **Verified**                                                                                                                       |
| Subscription gap or duplicate                    | `deduplicates and rejects regressions without inventing gaps across filtered cursors or accepting old epochs`; real Foldkit reconnect suite; AG-UI resync tests | **Verified**                                                                                                                       |
| New client opens an existing session             | `object-native > persists Session metadata, root Runs, and strict replay-then-live cursors`; real Foldkit replacement-snapshot reconnect suite                  | **Verified**                                                                                                                       |
| Untrusted output or spectator request            | Server read/mutation authorization denials and AG-UI authority-input rejection                                                                                  | **Verified**                                                                                                                       |
| Projection deletion                              | `rebuilds a deleted client projection from the authoritative Session snapshot`                                                                                  | **Verified** for the supported client projection; only derived client state is dropped.                                            |
| Tenant or resource escape attempt                | discovery namespace encoding and Server resource-authorization denial suites                                                                                    | **Verified**                                                                                                                       |
| R2 native/S3 interoperability                    | `recovers Journal snapshots and receipts after workerd restart and races native/S3 writers`                                                                     | **Verified** against pinned local gateway emulation; not live-provider certification.                                              |
| Host change with missing executable/workspace    | missing/mismatched executable recovery; `rejects an unavailable inherited workspace instead of starting a fresh one`                                            | **Verified** for missing executable and unavailable retained snapshot under the current provider; no fresh keyed workspace starts. |

## Current commands and gates

The source was an uncommitted working tree based on `58eba62033e3668f86feb79c83addc97162929cf`. These local commands ran with Bun 1.4.0:

```text
bun install --frozen-lockfile
# passed; lockfile unchanged

bun run build
# passed: 2 workspace build tasks

bun --bun vitest run \
  packages/generalist/test/durability/internal/runtime.test.ts \
  packages/generalist/test/durability/internal/protocol-model-suite.ts \
  packages/generalist/test/durability/internal/journal.test.ts \
  packages/generalist/test/durability/internal/runtime-state.test.ts \
  packages/generalist/test/durability/discovery.test.ts \
  packages/generalist/test/testing/runtime-driver/index.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed: 166 tests in 5 discovered files; no skips

bun --bun vitest run \
  packages/generalist/test/runtime/execution/model-response/preview.test.ts \
  packages/generalist/test/server/client.test.ts \
  packages/generalist/test/unstable/foldkit/chat/service.test.ts \
  packages/generalist/test/runtime/child/external/reconciliation.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed: 42 tests in 4 files; no skips

bun --bun vitest run \
  packages/generalist/test/runtime/execution/run-executor.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed: 49 tests; no skips

bun --bun vitest run \
  packages/generalist/test/runtime/state/start.test.ts \
  packages/generalist/test/runtime/code-mode.test.ts \
  packages/generalist/test/core/durable/component.test.ts \
  packages/generalist/test/runtime/program/boundary.test.ts \
  packages/generalist/test/runtime/state/store/host-session/conversation.test.ts \
  packages/generalist/test/tasks/component.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed; exact case-targeted suites, with no skips

bun --bun vitest run \
  packages/generalist/test/durability/object-store.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed against local MinIO and pinned Miniflare/workerd; no live provider was exercised

bun --bun vitest run \
  packages/generalist/test/repl/cell-tool.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed: 27 tests; no skips

bun --bun vitest run \
  packages/generalist/test/durability/internal/{runtime,protocol-model-suite,journal,runtime-state}.test.ts \
  packages/generalist/test/durability/discovery.test.ts \
  packages/generalist/test/testing/runtime-driver/index.test.ts \
  packages/generalist/test/runtime/execution/model-response/preview.test.ts \
  packages/generalist/test/runtime/execution/run-executor.test.ts \
  packages/generalist/test/runtime/child/external/reconciliation.test.ts \
  packages/generalist/test/server/{wire,client,websocket}.test.ts \
  packages/generalist/test/unstable/foldkit/chat/{service,connection}.test.ts \
  packages/generalist/test/repl/cell-tool.test.ts \
  examples/deep-research-agent/web/src/{scene,story}.test.ts \
  --no-file-parallelism --maxWorkers=1
# passed after all edits: 319 tests in 16 discovered files; no skips

bun run --cwd packages/generalist typecheck
# passed

bun node_modules/oxlint/dist/cli.js --deny-warnings \
  packages/generalist/test/durability/internal/domain-model-suite.ts \
  packages/generalist/test/durability/internal/runtime.test.ts
# passed: 0 warnings, 0 errors

bun run docs:api:check && bun run docs:build
# passed: API docs current, Mintlify validation and link checks passed

bun run check
# passed under Bun 1.4.0: build, generated API/docs, formatting, repository rules, oxlint,
# ast-grep, and all workspace typechecks

bun run test
# 2,756 passed and 19 skipped; two unrelated local-scheduler concurrency cases failed under
# whole-suite load, then their complete 23-test file passed in an isolated single-worker rerun

PACKAGE_ARTIFACT_DIR=release bun run package
# passed all Bun, npm/Node, bundle, export, manifest, and Worker/workerd consumer checks
```

The focused Runtime entrypoint accounts for 23 of the 166 passing tests: nine new model/trace tests, seven existing canonical mutation tests, and seven existing branch-evidence tests. The commands above are distinct evidence runs and their counts must not be added as though they were one deduplicated suite.

Live AWS S3 and deployed Cloudflare R2 were not exercised and are not certified. The package smoke gate does not qualify either remote provider. Performance workloads, an uninterrupted green complete repository test run, exact detached-commit proof, CI, and publication remain separate M6–M8 gates.
