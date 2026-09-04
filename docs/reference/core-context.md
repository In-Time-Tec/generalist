---
title: "Context seams"
description: "Instructions, SkillCatalog, Memory, Session, Compaction, Steering, and Handoff."
---

Seven namespaces of generalist shape what the model sees and how a conversation persists. All are optional seams discovered per run; absent means default behavior.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Instructions

An ordered registry of instruction `Provider` values: `{ id, render }`. Every provider renders once into the system message at run start.

| Export                                           | Notes                                                       |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `fromText(id, text)`                             | A static instruction provider; empty text renders nothing   |
| `render(instructions, context)`                  | Renders every provider once and returns the joined baseline |
| `layer(providers)` / `layerTest(implementation)` | Explicit ordered registry; layer from a service             |

## SkillCatalog

The skill registry seam: `{ all, get(name) }` over `Skill = { name, description, instructions, tools, location? }`. The loop derives listings within a token budget and loads instructions lazily through the built-in `activate_skill` tool.

| Export                                               | Notes                                                                                                                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skill`                                              | `name` and `description`, lazy `instructions`, and `tools` required; optional `whenToUse`, `allowedTools`, `disableModelInvocation`, `userInvocable`, `contextFork`, `agent`, `model`, `paths`, and `location` |
| `selectListings(skills, budgetTokens, recentlyUsed)` | Startup listings within a token budget; skills with `disableModelInvocation: true` are excluded, least-recently-used drop first                                                                                |
| `layerSkills(skills)` / `layerEmpty` / `layerTest`   | In-memory catalog, empty catalog, layer from a service                                                                                                                                                         |
| `SkillCatalogError`                                  | `{ source, message, cause? }`                                                                                                                                                                                  |

## Memory

The recall/remember seam keyed by `Key = { agent, subject }`. `recall(input)` returns `Item` values (`{ id, parts, metadata? }`) injected into context; `remember(input)` receives the transcript with a `terminal` flag after each turn.

| Export                      | Notes                                    |
| --------------------------- | ---------------------------------------- |
| `merge(first, second)`      | Concatenates recalls, fans out remembers |
| `layerNoop`                 | Recalls nothing, remembers nothing       |
| `layerTest(implementation)` | Layer from an explicit service           |
| `MemoryError`               | `{ message }`                            |

Implementations live in [generalist/memory](/reference/memory).

## Session

An append-only entry log with a leaf pointer. `Entry` is the closed union `MessageEntry | ToolCallEntry | ToolResultEntry | MemoryEntry | SkillEntry | SteeringEntry | HandoffEntry | CompactionEntry | BranchSummaryEntry`; the store service is `{ reserveEntryId, append, appendCheckpoint, path, setLeaf, leaf }`.

| Entry                | Fields beyond id/parentId/metadata                  | Projection                                                          |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| `MessageEntry`       | `message: Ai.Prompt.Message`                        | Included verbatim                                                   |
| `ToolCallEntry`      | `part: Ai.Prompt.ToolCallPart`                      | Assistant tool-call message                                         |
| `ToolResultEntry`    | `part: Ai.Prompt.ToolResultPart`                    | Tool result message                                                 |
| `MemoryEntry`        | `items: ReadonlyArray<string>`                      | `<memory>` system note                                              |
| `SkillEntry`         | `name`, `body`                                      | `<skill>` system note                                               |
| `SteeringEntry`      | `message: Ai.Prompt.Message`                        | Included verbatim                                                   |
| `HandoffEntry`       | `target`, `summary`                                 | `<handoff>` system note                                             |
| `CompactionEntry`    | `projectedHistory`, `telemetry`, optional `summary` | Self-contained checkpoint; projection never reads entries before it |
| `BranchSummaryEntry` | `summary`                                           | Rendered as an `<abandoned-branch-summary>` system message          |

`Session.buildContext(path)` purely projects a root-to-leaf path into an `Ai.Prompt.Prompt`. `Session.layerMemory` is a keyed Ref-backed non-durable directory; `Session.acquire(sessionId)` retains one exact store and its same-session lane for the current Scope; `layerTest` wraps an explicit directory interface. Store failures are `SessionStoreError{ message }`; stale leaves and reused checkpoint identities fail with `SessionConflict`. Exact checkpoints append idempotently before their stored projection is applied to Chat.

## SessionSync

`SessionSync` is the package-root host seam for comparing a durable Session projection with live Chat history without logging content. Use `SessionSync.coalesceAdjacentText(message)` before provider encoding, `SessionSync.equivalentMessages(left, right)` for representation-neutral comparison, and `SessionSync.diagnose({ sessionId, durableEntryTags, projection, transcript })` to produce bounded counts, roles, part types, and digests for a mismatch.

## Compaction

The seam consulted when context approaches the window: `maybeCompact(request) => Effect<Option<Result>, CompactionError, LanguageModel>`. `Result` is `MicrocompactResult` (tool outputs bounded in place) or `SummarizeResult` (summary checkpoint plus the kept tail).

| Export                                                           | Notes                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultStrategy(options?)`                                      | Two-stage strategy: microcompact tool outputs first, then cut and summarize the head                                                                                                                                       |
| `strategy(parts, base?)`                                         | Compiles ordered capability parts onto a complete strategy; the last part for one capability wins                                                                                                                          |
| `toolOutputBound({ maxBytes })`                                  | Lossless successful-tool-result bound backed by Store                                                                                                                                                                      |
| `structuredSummary(options?)`                                    | Validated `AgentSummary` generation with deterministic string checkpoint rendering                                                                                                                                         |
| `keepRecent({ tokens })`                                         | Token-denominated recent suffix target; Generalist does not infer turns from message roles                                                                                                                                 |
| `layer(options?, strategy?)`                                     | Service layer; `DefaultOptions` are `reserveTokens` (default 16384), `keepRecentTokens` (default 20000), `contextWindow`, `summaryModel`, `summaryPrompt` (default `summaryTemplate`), and an optional compiled `strategy` |
| `layerTruncate(maxTokens)` / `layerTruncateEstimated(maxTokens)` | Truncate-only layers: exact over an `Ai.Tokenizer` (requirement declared), or approximate over the token estimator                                                                                                         |
| `make(strategy, options?)` / `layerTest`                         | Service from a strategy; layer from a service                                                                                                                                                                              |

## Steering

Finite process-local inbox policy and errors for a scoped `Agent.RunHandle`: `steer` drains at model-turn boundaries mid-run, `followUp` drains after the run would otherwise complete.

| Export                                       | Notes                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Options`                                    | Configured under `RunOptions.steering`; `steering.mode` defaults to `"all"`, `followUp.mode` to `"one-at-a-time"`, and overload defaults to typed fail-fast. |
| `defaultCapacity` / `defaultMaxPendingBytes` | 64 entries in each lane and 1 MiB aggregate encoded prompt bytes per Run                                                                                     |
| `Receipt`                                    | Accepted identity: `{ runId, queue, sequence, bytes }`                                                                                                       |
| `InboxFull` / `RunClosed`                    | Typed overload and terminal-admission failures                                                                                                               |

## Handoff

| Export                           | Notes                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `transferTool(target, options?)` | Handled toolkit exposing `transfer_to_<agent.name>` as a same-process handoff tool        |
| `fanOut(children, options?)`     | Runs isolated child agents concurrently (default concurrency 4) and preserves input order |
| `supervisor(options)`            | Builds a supervisor agent plus the handled toolkit of transfer tools for its specialists  |

See [How to compose instructions and instruction providers](/guides/instructions), [How to add skills](/guides/skills), [How to add memory](/guides/memory), [How to stay inside the context window](/guides/compaction), [How to steer and interrupt a running agent](/guides/steering), [How to coordinate multiple agents](/guides/multi-agent), and [Sessions, history, and persistence](/learn/sessions-and-history).
