# ADR-0003 — Model Resilience

## Status

Accepted.

## Context

Baton currently converts model stream failures into in-band `error` parts and then into `AgentError`. A transient provider failure before any streamed output therefore fails the whole run even though retrying the model call would be safe.

Retrying the whole agent stream is not safe. A turn may have already emitted model parts, dispatched tools, or persisted transcript updates through a host. Re-running after partial output can duplicate text, tool calls, and host-side events.

## Decision

Add `ModelResilience` as an optional core seam. The service classifies live model-call failures as `transient` or `terminal` before Baton converts them to diagnostic strings or `AgentError`, and supplies the retry schedule used inside the active model call.

`Agent.stream` resolves `ModelResilience` with `Effect.serviceOption`, so the loop requirement set does not grow. If absent, model-call behavior stays unchanged. If present, Baton wraps the active `Ai.LanguageModel.Service` for each turn, including per-turn `TurnPolicy` model overrides.

`generateText` and `generateObject` retry transient typed failures as plain effects. `streamText` retries only when a typed stream failure happens before that attempted model call emits any part. Once any stream part has been emitted, the turn is never re-run; a later typed failure becomes one `Ai.Response` `error` part and follows Baton's existing `AgentError` path. Provider-emitted in-band `error` parts are stream values, not failures, and are never classified or retried.

## Consequences

- Standalone Baton can retry provider model calls without adopting a durable runtime.
- Durable hosts such as Relay can provide `ModelResilience` as a thin policy layer while keeping durability, event folds, and provider selection host-side.
- Partial streamed output is never replayed or deduplicated by Baton.
- The default/absent behavior remains no retry.

## Rejected alternatives

- Making `ModelResilience` a required `Agent.stream` service: rejected; no-retry remains the default and the service is optional runtime policy.
- Retrying the whole agent stream: rejected because previous turns, emitted stream parts, and tool executions may already be externally observed.
- Retrying streaming failures after partial output: rejected because it can duplicate text and tool calls.
- Implementing retry as `ModelMiddleware`: rejected because retry must wrap model call failure channels before stream parts are folded.
- Classifying after conversion to `AgentError` or strings: rejected because retry policy must see the original provider error.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
