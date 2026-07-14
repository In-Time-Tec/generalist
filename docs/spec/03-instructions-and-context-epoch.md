# 03 — Instructions and Context Epoch

Baton's `Instructions` module is the ordered context-source registry for baseline model instructions. A run opens a `ContextEpoch` once at turn 0 and baseline sources render into a stable system-message baseline. Baton does not automatically render or inject dynamic instruction updates.

## Scope

Baton owns:

- the `ContextSource` registry seam;
- the static baseline source constructor;
- `openEpoch`, which renders baseline sources once and freezes the dynamic source list;
- minimal Agent integration for first-turn system-message derivation when an `Instructions` service is present.

Baton does not own filesystem `AGENTS.md` / `CLAUDE.md` discovery, memory recall sources, durable epoch storage, provider-specific prompt-cache controls, or automatic dynamic-instruction rendering or transcript insertion.

## Public model

- `RenderContext` carries `{ agentName, turn }` to every source render.
- `ContextSource` has a stable `id`, a cache class (`"baseline" | "dynamic"`), and a `render(context)` effect that returns `Option<string>` or fails with `AgentError`.
- `Instructions` provides an ordered immutable array of sources.
- `ContextEpoch` stores the rendered baseline string plus dynamic sources retained only for compatibility with deprecated direct `renderUpdate` callers.

## Rendering contract

- Source order is preserved.
- Baseline sources are rendered by `openEpoch` exactly once for an epoch.
- Dynamic sources are not included in `epoch.baseline`; they are kept in `epoch.dynamic` in their original relative order.
- `Option.none()` contributes no text.
- Rendered fragments are joined with one blank line (`"\n\n"`).
- The deprecated `renderUpdate(epoch, context)` compatibility export renders only `epoch.dynamic`, joins non-empty fragments with blank lines, and returns `Option.none()` when no dynamic source contributes text. Baton does not call it.

## Agent integration

`Agent.stream` resolves `Instructions` optionally so its static requirement set does not grow.

- When `Instructions` is absent, system-message derivation remains `options.system ?? agent.instructions`.
- When `options.system` is set, it wins and the registry is ignored.
- When `options.history` is set, the provided history is used verbatim and the registry is ignored.
- Otherwise, Baton opens an epoch with `{ agentName: agent.name, turn: 0 }`; a non-empty `epoch.baseline` becomes the first-turn system message.
- If the registry baseline is empty, Baton falls back to `agent.instructions`.
- If `SkillSource` is present and `history` is absent, Baton appends selected skill listings after the derived system message. The listing fragment is opt-in through `SkillSource`; absent `SkillSource`, byte-for-byte prompt derivation is unchanged.
- Baton does not render or inject dynamic instruction updates before any model turn. No invocation frequency, transcript position, replay, resume, or persistence behavior is implied.
- TurnPolicy `Continue.overrides.instructions` is independent of `Instructions`: the policy prepends it once to the selected follow-up prompt. `Ai.Chat` then commits that system message to transcript history, so later turns and persisted chats may retain it. Baton does not render it through `renderUpdate`.

Persisted chats keep the current seeding contract: the derived system message seeds only an empty persisted chat, and non-empty persisted history is not re-seeded.

## Migration

`renderUpdate` remains exported with source-visible `@deprecated` JSDoc for compatibility and will not be removed before 1.0.0 or outside a separately planned major release. Agent-integrated callers should model stable content as baseline sources, provide them with `Instructions.layer`, and let Agent call `openEpoch`. Changing content has no Agent-integrated replacement: a host may temporarily call `renderUpdate`, but that host owns transcript insertion, ordering, replay, resume, and persistence. Do not substitute TurnPolicy instruction overrides for dynamic sources because policy overrides prepend a transcript message through an independent policy contract.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/decisions/ADR-0006-instructions-context-epoch.md`
