# ADR-0031 — Model Registry Operation Lifetime

## Status

Accepted.

## Context

`ModelRegistry.provide` can safely govern an `Effect`, but the Agent used it to capture a selected model `Context` and then performed the actual model call after the registered layer scope and semaphore permit had exited. Stream construction also does not represent stream consumption, so governing only construction permits service use after finalization and allows configured concurrency to be exceeded while streams are pulled.

## Decision

`ModelRegistry` exposes `operate(selection, effect)` and `stream(selection, stream)`. `operate` retains the registered layer scope and optional governance permit until the supplied Effect exits. `stream` acquires the permit and layer in the consuming channel's scope, retaining both until complete consumption, early downstream termination, failure, defect, or interruption.

Agent-selected streamed model turns use `stream`; selected terminal structured-output turns use `operate`. Baton does not capture or retain a selected model `Context`. Per-turn model layer overrides continue to bypass registry selection exactly as before.

`provide` remains a deprecated source-compatible alias of `operate`. It will not be removed before 1.0.0 and only in a separately planned major release under ADR-0024.

The alias preserves application call sites. Custom implementations of the public `ModelRegistry.Interface`, including implementations passed to `testLayer`, must add `operate` and `stream`; `provide` may delegate to `operate`. A legacy implementation cannot be adapted into a safely governed incremental stream because its Effect boundary ends before stream consumption, so Baton does not provide an adapter that would recreate the stale-context defect.

## Consequences

- Registered model services are never used after their layer finalizes.
- `maxConcurrentModelCalls` governs complete model operations rather than context capture or stream construction.
- Scope and permits release exactly once on every Effect and Stream exit.
- Selection and model failures remain typed; defects and interruption remain in `Cause`.
- No stale context, detached fiber, runner, or additional concurrency mechanism is introduced.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0024-public-api-import-and-layer-conventions.md`
