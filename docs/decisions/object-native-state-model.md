# One object-native state authority

Generalist's clean v1 Runtime uses one object-storage engine with S3 and native R2 transports. The process-local Agent loop remains independent. Local processes, servers, Cloudflare Durable Objects, and Rivet actors own compute scopes; none supplies a competing Generalist database.

## Commit and recovery boundary

One environment/tenant/partition namespace is the serialization and atomicity boundary. Immutable numbered journal slots record deterministic transitions, logical state, and retained command receipts. Conditional-create contention reads the winner and re-evaluates state changes; it never repeats a model or tool effect merely to win a slot. Snapshots accelerate replay but do not make retained slots safe to delete.

Reconstruction validates canonical bytes and pins without effectful dispatch. Explicit scoped activation acquires fresh ownership and starts recovery. Protected writes carry Run-attempt and Session-writer authority; timeout or process interruption alone is not proof that an old external request failed.

## State inventory

| State                                                              | Authority and branch behavior                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runs, operations, waits, approvals, schedules, and child ownership | Canonical partition state and operation outcomes; fresh hosts reconstruct pending obligations rather than guessing from events or host memory.                                                   |
| Session entries, paths, leaves, and model-response references      | Append-only conversation authority with a selected branch projection. Execution metadata does not become model context.                                                                          |
| Command receipts and accepted external outcomes                    | Retained immutable evidence. Exact retries return the original receipt, including its original `duplicate` field. Rewind does not erase accepted work.                                           |
| Budgets, reservations, and incurred costs                          | Canonical accounting. Branch continuation cannot refund prior external spend or reuse an old settlement as a new grant.                                                                          |
| Durable components                                                 | Explicit descriptors pin key/instance, scope, schema, handler, limits, and branch policy. Tasks uses a Run-scoped `restore` component; missing code/version fails closed.                        |
| Hooks                                                              | The ordered key/version/replay-policy chain is pinned. Durable intents, outcomes, and decisions recover without invoking completed hooks; uncertain `never` hooks stay fenced.                   |
| Artifacts and blobs                                                | Canonical update/append receipts and verified referenced bytes. Publication queues are disposable; referenced bytes must remain available across branches and backups.                           |
| Executable registrations and settings                              | Persisted identities and effective settings are data; application resolvers provide matching live code and services. Credentials and executable closures are not serialized as recoverable code. |
| Discovery and delivery hints                                       | Retained markers and canonical obligations support reconciliation. Host authorization must approve a discovered location before activation; a marker or notification alone grants no authority.  |
| Browser views and live previews                                    | Disposable projections rebuilt from bounded committed snapshots and exclusive cursors. Authentication and resource authorization remain application-configured boundaries.                       |

The owning implementation is `packages/generalist/src/durability/`, `src/runtime/state/`, and the domain-specific component, Session, Program, and Host modules. This inventory describes their authority boundaries, not completion of every recovery or performance acceptance case.

## Retention and compatibility decision

There is no Generalist SQL backend, alternate production memory/filesystem Runtime, compatibility reader, alias, or legacy migration path. Use a fresh namespace for the cutover. Retain earlier deployments read-only when historical access is required; do not edit old bytes into the new format.

Rewind changes the current projection while retaining append-only history, receipts, external outcomes, and costs. Never delete production objects to repair recovery or reclaim capacity. Live garbage collection is not implemented, and provider lifecycle expiry can invalidate the retained complete prefix.

## Evidence boundary

Local qualification uses MinIO and persistent Miniflare/workerd with the committed exact-EOF emulator patch. Native/S3 shared-bucket checks pass through Miniflare's gateway and must be labeled accordingly. Local results do not certify AWS S3 or deployed R2. Protocol models prove only their recorded assumptions and explored bounds; they do not substitute for integration tests, measured workloads, full browser acceptance, or an exact detached release candidate.

The [durability verification report](../features/durability-verification.md) maps these invariants to executable tests; current commands and limitations belong in [object durability](../features/durable-stores.md). This decision is not a release-ready or completion claim.
