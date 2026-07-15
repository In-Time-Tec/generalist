# ADR-0032 — Atomic Tool-name Validation

## Status

Accepted.

## Context

Effect AI toolkits are name-keyed. The pinned `Toolkit.make` assigns each input directly into that record, so later duplicate names erase earlier schemas before Baton receives a pre-built toolkit. Baton also assembled static, built-in, and activated-skill schemas separately from dispatch, while Handoff advertised the last duplicate but dispatched the first. Those paths could present one schema to the model and permissions while executing another handler.

## Decision

Baton validates ordered tool declarations with explicit `Static`, `Builtin`, `Skill`, and `Handoff` origins before constructing an advertised Effect AI toolkit. A successful immutable registry snapshot owns advertisement, permission and approval lookup, and dispatch for one model turn. Every run owns its registry state. Skill activation prospectively validates the complete next set and publishes it atomically only after body loading succeeds.

`ToolNameCollision` is a public `Schema.TaggedErrorClass` in `Agent.RunError`. It reports the conflicting name and every participant origin in declaration order. Baton does not select a winner or convert this framework invariant failure into a tool result.

`Agent.make` retains the existing `toolkit` option and adds a mutually exclusive ordered `tools` option. Both use Effect AI `Tool` and `Toolkit` values; `tools` is provenance, not a second definition model. Callers use `tools` when static/static collision evidence must survive. Baton cannot detect a duplicate already erased by upstream `Toolkit.make`, and does not fabricate evidence for it. Handoff retains declaration provenance before constructing its compatibility handled toolkit and defers collision failure to the supervisor run so agent definitions remain plain values.

## Consequences

- One advertised name has exactly one schema, permission subject, handler, and origin.
- Initial conflicts fail before model calls or tool execution; activation conflicts fail before body reads, state publication, or the next model request.
- Valid unique sets retain declaration and advertisement order.
- Concurrent runs cannot observe partial or cross-run skill activation state.
- Existing valid `toolkit` inputs remain source-compatible, while static authors that need complete duplicate proof migrate to `tools: [first, renamed]`.

## Rejected alternatives

- Reconstructing duplicates from a pre-built toolkit is impossible because the earlier declaration no longer exists.
- Replacing Effect AI tools or toolkits with Baton wire types would violate the payload and dependency boundary.
- Making `Agent.make` or `Handoff.supervisor` Effectful would broadly break plain agent definitions without helping dynamic skill activation.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/07-skills.md`
- `docs/spec/10-multi-agent.md`
