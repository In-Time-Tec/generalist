# 03 — Instructions and Context Epoch

Baton's `Instructions` module is the ordered context-source registry for model instructions and contextual updates. A run opens a `ContextEpoch` once at turn 0: baseline sources render into a stable system-message baseline, while dynamic sources are retained for later incremental update rendering.

## Scope

Baton owns:

- the `ContextSource` registry seam;
- the static baseline source constructor;
- `openEpoch`, which renders baseline sources once and freezes the dynamic source list;
- `renderUpdate`, which renders dynamic sources into one optional incremental update;
- minimal Agent integration for first-turn system-message derivation when an `Instructions` service is present.

Baton does not own filesystem `AGENTS.md` / `CLAUDE.md` discovery, skills catalog rendering, memory recall sources, durable epoch storage, provider-specific prompt-cache controls, or full per-turn update injection in this milestone.

## Public model

- `RenderContext` carries `{ agentName, turn }` to every source render.
- `ContextSource` has a stable `id`, a cache class (`"baseline" | "dynamic"`), and a `render(context)` effect that returns `Option<string>` or fails with `AgentError`.
- `Instructions` provides an ordered immutable array of sources.
- `ContextEpoch` stores the rendered baseline string plus the dynamic sources to re-render later.

## Rendering contract

- Source order is preserved.
- Baseline sources are rendered by `openEpoch` exactly once for an epoch.
- Dynamic sources are not included in `epoch.baseline`; they are kept in `epoch.dynamic` in their original relative order.
- `Option.none()` contributes no text.
- Rendered fragments are joined with one blank line (`"\n\n"`).
- `renderUpdate(epoch, context)` renders only `epoch.dynamic`, joins non-empty fragments with blank lines, and returns `Option.none()` when no dynamic source contributes text.

## Agent integration

`Agent.stream` resolves `Instructions` optionally so its static requirement set does not grow.

- When `Instructions` is absent, system-message derivation remains `options.system ?? agent.instructions`.
- When `options.system` is set, it wins and the registry is ignored.
- When `options.history` is set, the provided history is used verbatim and the registry is ignored.
- Otherwise, Baton opens an epoch with `{ agentName: agent.name, turn: 0 }`; a non-empty `epoch.baseline` becomes the first-turn system message.
- If the registry baseline is empty, Baton falls back to `agent.instructions`.
- Dynamic updates are exposed through `renderUpdate` but are not injected by the Agent until the compaction/update milestone.

Persisted chats keep the current seeding contract: the derived system message seeds only an empty persisted chat, and non-empty persisted history is not re-seeded.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/decisions/ADR-0006-instructions-context-epoch.md`
