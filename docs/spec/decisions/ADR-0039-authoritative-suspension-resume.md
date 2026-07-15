# ADR-0039 — Authoritative Suspension Resume

## Status

Accepted.

## Context

`RunOptions.resume` accepted an arbitrary replacement call. Ordinary resume executed that call without consulting Chat, while authorization resume compared only id, name, and params against an unresolved call. The suspension token was not persisted in Chat, so core could not reject a stale or fabricated token from authoritative state. A caller could therefore substitute ordinary tool input or replay a completed suspension without one typed, deterministic checkpoint boundary.

ADR-0025 makes transformed response parts authoritative, ADR-0036 checkpoints completed framework results exactly once, and ADR-0037 rejects duplicate transformed call IDs before duplicate side effects. Resume must consume those invariants rather than establish a second caller-owned call authority.

## Decision

`Resume` contains the exact `AgentSuspended` identity received by the host. Baton records the JSON-safe suspension fields on the suspending authoritative transformed tool-call part before exposing the suspension checkpoint. The call part remains authoritative for id, name, and params; its Baton metadata records token, reason, authorization stage, active tools, and activated skills. The existing Chat semaphore owns this metadata update, ordered sibling-result append, and persisted save as one suspension checkpoint transition.

Every resume first reads the current Chat history and derives exactly one unresolved non-provider tool call carrying valid Baton suspension metadata. It reconstructs the expected `AgentSuspended` and compares the complete value with the supplied suspension. No checkpoint produces `ResumeMismatch { reason: "checkpoint-not-found", received }`; a different token, reason, id, name, params, authorization stage, active tools, or activated skills produces `ResumeMismatch { reason: "identity-mismatch", expected, received }`.

Comparison occurs before skill restoration, authorization, tool execution, model invocation, result append, or persistence save. A successful comparison uses only the checkpoint call and checkpoint suspension snapshot for dispatch. Once its result is checkpointed, the call is resolved; a duplicate resume deterministically reports `checkpoint-not-found`. Ordinary and persisted entrypoints share this same internal path.

## Consequences

- Callers migrate from `{ resume: { call } }` and separate snapshot fields to `{ resume: { suspension } }`.
- Stale, fabricated, parameter-edited, and duplicate resumes fail with one public schema-backed error and initiate no resumed side effects.
- Persisted Chat now contains a Baton-owned JSON metadata field on an unresolved suspended call. Existing transcripts without that metadata cannot be safely verified and fail `checkpoint-not-found` when resumed.
- Baton provides process-local checkpoint validation, not distributed locking or exactly-once execution across competing hosts.
- Validation is a lazy Effect operation over existing scoped Chat state and adds no service requirement, detached work, resource, or concurrency.

## Rejected alternatives

- Keep an arbitrary call input and compare it opportunistically: rejected because ordinary resume and tokens remain caller-authoritative.
- Preserve a deprecated legacy constructor: rejected because a legacy call lacks a verifiable suspension token.
- Store suspension state in a new Baton persistence service: rejected because Chat already owns the authoritative transformed call and persisted checkpoint boundary.
- Treat a duplicate resume as success: rejected because core cannot prove distributed exactly-once completion and must not fabricate a tool result.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0035-unified-tool-authorization.md`
- `docs/spec/decisions/ADR-0036-framework-tool-result-checkpoint.md`
- `docs/spec/decisions/ADR-0037-unique-transformed-tool-call-ids.md`
