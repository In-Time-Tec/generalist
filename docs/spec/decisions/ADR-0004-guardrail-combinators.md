# ADR-0004 — Guardrail Combinators

## Status

Accepted.

## Context

`ModelMiddleware` is the Baton seam for prompts entering the model and streamed parts leaving it. Guardrails such as prompt validation, regex redaction, and output filtering already fit that seam, but consumers would otherwise repeat boilerplate to build safe middleware values and to preserve the loop's tool-call invariants.

## Decision

Ship `Guardrail` as a set of ergonomic combinators that return `ModelMiddleware.Middleware` values. `validateInput` blocks by failing with `AgentError`; `redactInput` and `redactOutput` rewrite text-bearing prompt/stream fields; `filterOutput` drops non-tool streamed parts while always keeping tool calls.

Guardrail is not a service and not a second policy subsystem. It composes exclusively through `ModelMiddleware.layer([...])`, inherits middleware ordering and error semantics, and does not change the loop.

## Consequences

- Consumers get common guardrail building blocks without forking the agent loop.
- Baton still ships no model-judge guardrails, detection heuristics, external PII dependency, or durable policy runtime.
- Output guardrails remain stream-part based and do not apply to non-streaming structured-output content.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
