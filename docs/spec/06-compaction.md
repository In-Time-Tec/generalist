# 06 — Compaction

Baton's `Compaction` module is the optional context-shrinking seam for long non-durable agent runs. It is a strategy boundary, not a hidden persistence system: hosts provide it when they want Baton's loop to shrink projected model context before a turn or after a provider reports context overflow.

## Scope

Baton owns:

- the `Compaction` service boundary;
- a pure `Strategy` shape for trigger, cut-point selection, and summarization;
- composable strategy parts for lossless tool-output bounding, structured summarization, and recent-tail retention;
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

All internal size estimates (`fits`, cut-point selection, `keepRecentTokens`) are token-denominated. Without provider-native token counting, the default strategy estimates tokens from serialized length at approximately 4 characters per token, so char-denominated lengths and token budgets never mix.

## Strategy contract

A strategy has three responsibilities:

- `shouldCompact(usage)` decides whether a proactive or reactive request should compact.
- `cut(entries, keepRecentTokens)` chooses the session suffix kept verbatim and the prefix summarized.
- `summarize(plan, request)` performs one dedicated `LanguageModel.generateText` call and returns checkpoint text.

The three required methods remain the complete host-decoration boundary. In particular, `summarize` continues to return `string` so a durable host can journal the nondeterministic model result before Baton uses it.

## Composable strategy pack

`strategy(parts, base?)` compiles ordered `StrategyPart` values onto a base strategy, defaulting to `defaultStrategy()`. A part may replace one required strategy method or set one optional execution parameter. Parts are applied left to right; the last part defining the same capability wins. The result is an ordinary `Strategy`, so existing custom strategies and decorators remain valid.

The public parts are:

- `toolOutputBound({ maxBytes })`, which supplies the lossless successful-tool-result bound used before semantic summarization. An explicit `Request.toolOutputMaxBytes` wins over the strategy part. Bounding still depends on `ToolOutputStore`: when the store does not accept a spill, Baton preserves the original result rather than truncating it. Failed tool results are unchanged.
- `structuredSummary({ objectName?, summaryModel?, summaryPrompt? })`, which replaces only `summarize`. It calls `LanguageModel.generateObject` directly with the exported `AgentSummary` schema, no toolkit, and `toolChoice: "none"`. Baton deterministically renders the decoded value into the existing string checkpoint contract.
- `keepRecent({ tokens })`, which supplies the non-negative safe-integer token target for the verbatim suffix. Baton deliberately does not infer turns from message roles because session entries do not carry a canonical turn identifier.

`AgentSummary` has this fixed validated shape:

```ts
Schema.Struct({
  goal: Schema.String,
  facts: Schema.Array(Schema.String),
  decisions: Schema.Array(Schema.String),
  openQuestions: Schema.Array(Schema.String),
  toolFindings: Schema.Array(Schema.String),
})
```

Its checkpoint renderer emits the fields in schema order with fixed Markdown headings and list order. Structured generation does not change `SummarizeResult.summary`, `Session.CompactionEntry.summary`, or the host-facing `Strategy.summarize` type.

`layer({ strategy, ...options })` accepts a compiled strategy in the option object. The existing `layer(options, strategy)` positional form remains supported. Invalid `maxBytes` or `tokens` values are programmer configuration defects detected while constructing the part.

Cut points snap to turn boundaries. A kept suffix never starts with a tool-result message and never keeps one side of an assistant tool-call / tool-result pair while dropping the other. If no safe cut exists, the strategy returns no compaction.

## Default two-stage strategy

The default strategy first microcompacts successful tool-result payloads in the projected prompt. When `RunOptions.toolOutputMaxBytes` and `ToolOutputStore` are available, oversized successful results are replaced with the existing `ToolOutput { inline, outputPaths }` envelope. Failed tool results are never spilled.

If the microcompacted context fits under `contextWindow - reserveTokens`, Baton uses that projected context and does not call the summary model.

If the context still exceeds budget, the strategy summarizes the older session prefix with a single dedicated `LanguageModel.generateText` call using `tools: []` / `toolChoice: "none"`, keeps the recent suffix verbatim, and re-injects the summary as one synthetic user checkpoint. Any `system` messages in the summarized prefix are hoisted out and kept ahead of the checkpoint, so summary checkpointing never drops the run's system prompt:

```text
<conversation-checkpoint>
...
</conversation-checkpoint>
```

When a tool-output bound is active, Baton applies it both to the head sent to the summary model and to tool results in the retained suffix before assembling the checkpoint history. Summary checkpointing never reintroduces a raw oversized tool result from the session path.

The summary template has fixed sections: Goal, Constraints, Progress, Key Decisions, Next Steps, Critical Context, and ends with `Do not mention that context was compacted.`.

`structuredSummary` is an alternative semantic summarizer. It uses the fixed `AgentSummary` object contract and deterministic renderer instead of the free-form default template. It still summarizes the same microcompacted head and keeps the same recent suffix and system-message behavior.

## Session and losslessness

When both `Compaction` and `SessionStore` are provided, the loop mirrors chat transcript messages into the session log and appends a `Compaction` entry after summary checkpointing. The full pre-compaction conversation remains in the session path; only the prompt projected into the live `Ai.Chat` shrinks.

When no `SessionStore` is provided, Baton can still run an implementation supplied through `Compaction.testLayer`, but the default summary strategy cannot invent a durable history and returns no summary compaction when no safe session path is available.

## Agent integration

`Agent.stream` resolves `Compaction`, `SessionStore`, and `Ai.Tokenizer` optionally. These services do not become static `RunServices` requirements.

- At the top of every model turn, before `chat.streamText`, Baton measures the fully assembled current history and prompt. It uses `Ai.Tokenizer` when provided and otherwise uses the deterministic serialized-length estimate. Provider-reported input usage is telemetry and aggregate budget data only; usage from an earlier model request is never reused as the size of a different current prompt. `RunOptions.compaction.contextWindow` or layer defaults supply the context window. If compaction returns a rebuilt history/prompt, Baton replaces the live chat history before calling the model, and the next compaction decision measures that rebuilt current context.
- On a pre-emission context-overflow stream failure, Baton restores the attempted history, compacts with `overflow: true`, and retries the same turn once without emitting another `TurnStarted`.
- Absent `Compaction` preserves current turn, event, session, and completion behavior.

Terminal structured-output compaction is deferred; the same seam can compact normal streamed turns without changing the structured-output event contract.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/decisions/ADR-0009-compaction-strategy-seam.md`
