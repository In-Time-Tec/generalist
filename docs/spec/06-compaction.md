# 06 — Compaction

Baton's `Compaction` module is the optional context-shrinking seam for long non-durable agent runs. It is a strategy boundary, not a hidden persistence system: hosts provide it when they want Baton's loop to shrink projected model context before a turn or after a provider reports context overflow.

## Scope

Baton owns:

- the `Compaction` service boundary;
- a pure `Strategy` shape for trigger, cut-point selection, and summarization;
- a two-stage default strategy that tries tool-output microcompaction before summary checkpointing;
- a truncate-only implementation over `Ai.Tokenizer`;
- optional `Agent.stream` integration that preserves current behavior when `Compaction` is absent.

Baton does not own a model-metadata catalog, durable blob storage, durable session storage, Relay handoff-to-fresh-run behavior, semantic context selection, or provider-native token counting in this milestone.

## Trigger contract

`Usage` is `{ contextTokens, contextWindow, reserveTokens }`.

- Proactive compaction fires when `contextTokens > contextWindow - reserveTokens`.
- Reactive compaction fires when a model call fails with a context-overflow error before any model part was emitted.
- Reactive compaction retries the same turn once. A second overflow, or any overflow after partial emission, fails as a normal `AgentError`.
- If no finite context window is provided, proactive compaction is disabled. Reactive compaction remains available.

The default reserve is `16_384` tokens and the default recent-tail target is `20_000` tokens.

## Strategy contract

A strategy has three responsibilities:

- `shouldCompact(usage)` decides whether a proactive or reactive request should compact.
- `cut(entries, keepRecentTokens)` chooses the session suffix kept verbatim and the prefix summarized.
- `summarize(plan, request)` performs one dedicated `LanguageModel.generateText` call and returns checkpoint text.

Cut points snap to turn boundaries. A kept suffix never starts with a tool-result message and never keeps one side of an assistant tool-call / tool-result pair while dropping the other. If no safe cut exists, the strategy returns no compaction.

## Default two-stage strategy

The default strategy first microcompacts successful tool-result payloads in the projected prompt. When `RunOptions.toolOutputMaxBytes` and `ToolOutputStore` are available, oversized successful results are replaced with the existing `ToolOutput { inline, outputPaths }` envelope. Failed tool results are never spilled.

If the microcompacted context fits under `contextWindow - reserveTokens`, Baton uses that projected context and does not call the summary model.

If the context still exceeds budget, the strategy summarizes the older session prefix with a single dedicated `LanguageModel.generateText` call using `tools: []` / `toolChoice: "none"`, keeps the recent suffix verbatim, and re-injects the summary as one synthetic user checkpoint:

```text
<conversation-checkpoint>
...
</conversation-checkpoint>
```

The summary template has fixed sections: Goal, Constraints, Progress, Key Decisions, Next Steps, Critical Context, and ends with `Do not mention that context was compacted.`.

## Session and losslessness

When both `Compaction` and `SessionStore` are provided, the loop mirrors chat transcript messages into the session log and appends a `Compaction` entry after summary checkpointing. The full pre-compaction conversation remains in the session path; only the prompt projected into the live `Ai.Chat` shrinks.

When no `SessionStore` is provided, Baton can still run an implementation supplied through `Compaction.testLayer`, but the default summary strategy cannot invent a durable history and returns no summary compaction when no safe session path is available.

## Agent integration

`Agent.stream` resolves `Compaction`, `SessionStore`, and `Ai.Tokenizer` optionally. These services do not become static `RunServices` requirements.

- At the top of a model turn, before `chat.streamText`, Baton computes usage from the latest model usage, optional tokenizer counting, and `RunOptions.compaction.contextWindow` or layer defaults. If compaction returns a rebuilt history/prompt, Baton replaces the live chat history before calling the model.
- On a pre-emission context-overflow stream failure, Baton restores the attempted history, compacts with `overflow: true`, and retries the same turn once without emitting another `TurnStarted`.
- Absent `Compaction` preserves current turn, event, session, and completion behavior.

Terminal structured-output compaction is deferred; the same seam can compact normal streamed turns without changing the structured-output event contract.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/decisions/ADR-0009-compaction-strategy-seam.md`
