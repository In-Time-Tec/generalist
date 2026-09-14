---
title: "Durability verification"
description: "Understand what Generalist's local durability checks establish and what remains application-owned."
---

Generalist verifies the object-native Runtime and its two maintained transports without treating local tests as provider certification.

## Maintained evidence

- `packages/generalist/test/testing/runtime-driver/` owns shared Runtime capability expectations.
- `packages/generalist/test/durability/` covers canonical state, recovery, contention, fencing, receipts, snapshots, and object-transport conformance.
- `packages/generalist/test/durability/object-store.test.ts` runs the S3-compatible transport against local MinIO.
- `packages/generalist/test/durability/fs.test.ts` exercises the local-directory transport.
- Fresh-Layer tests close and reopen Runtime services so process-local caches cannot masquerade as recovery.

Run the complete maintained evidence with:

```bash
bun run check
bun run test
bun run package
```

`bun run package` creates `release/generalist.tgz` and `release/SHA256SUMS`. It verifies package construction, not every possible consumer environment.

## What this does not establish

Local simulation and MinIO do not certify AWS S3 or another deployed S3-compatible service. Generalist publishes no throughput, latency, memory-ceiling, cold-recovery, or cross-region performance baseline. Applications should qualify their selected service, workload bounds, credentials, deployment topology, and recovery procedure.

The object engine does not make external effects exactly once. A timeout can leave a provider operation with an unknown outcome; callers must preserve command identity and reconcile against provider evidence before retrying non-idempotent work.

## Extension qualification

Custom object transports implement the contract exported by `generalist/durability/object-store`. Run the shared conformance suite plus a real close/reopen test against an isolated namespace. Passing those checks establishes compatibility with the tested contract only; it is not a claim about untested service tiers or operating conditions.
