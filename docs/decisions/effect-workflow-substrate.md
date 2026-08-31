# Keep Generalist Runtime as the durable substrate

Generalist Runtime remains the sole scheduler, journal, claim, wait, and recovery authority. Do not place Effect Workflow or Cluster around a durable Run while retaining Generalist state to supply missing execution guarantees.

The evaluated substrate was `effect@4.0.0-rc.111`, upstream commit `648f566dd259898e7697c7fcb796183ccbc474ab`, for PostgreSQL and Cloudflare topologies. It failed the mandatory ownership gate: `RunnerStorage.acquire` and `refresh` return owned shard identities but no monotonic ownership epoch that can be carried into Session, operation, checkpoint, and event writes. Interrupting a stale runner is not storage-enforced rejection of its late writes.

The same release also has no durable unknown workflow result or operator resolution path for a non-idempotent activity whose effect may have happened before its reply committed. Unreplied SQL messages become eligible for delivery again after ten minutes. Its activity idempotency key is a deterministic value for integrations, not an exactly-once executor. No released Cloudflare Workflow topology exists at this pin.

The gate stopped at these structural failures. Atomic Agent commits, wait races, child behavior, upgrades, and performance were not evaluated and are not claimed to have failed. No Effect Workflow production code or schema was introduced, so there is no losing authority to delete.

Re-evaluate with a new bounded spike only when a released Effect version propagates a storage-enforced monotonic fence into domain writes, provides an explicit unknown/reconciliation policy for possibly completed activities, and supports every required deployment topology without a second Generalist lifecycle authority.
