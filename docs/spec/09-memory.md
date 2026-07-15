# 09 — Memory

Baton memory is an optional core seam for recall before the first model turn, remember after completed turns, and host-requested lifecycle cleanup. Core owns the timing, structurally provenanced prompt insertion, memory-specific transcript projection, and service operation contract. Concrete non-durable implementations live in `@batonfx/memory`; durable implementations remain host-owned.

## Scope

Baton owns:

- the `Memory` service interface in `packages/core/src/memory.ts`;
- the agent default `Agent.make({ memory })` and per-run `RunOptions.memory.key` contracts;
- recall insertion into the initial prompt with structural origin;
- memory-specific transcript projection and remember calls after completed turns;
- host-requested forget lifecycle cleanup;
- loud error mapping into `AgentError`.

Baton core does not own vector stores, embedding models, summarization, extraction, ranking, durable storage, or automatic key derivation. `@batonfx/memory` owns only in-process, non-durable implementations over core's seam.

## Key isolation

`Memory.Key` is `{ agent, subject }`. `agent` scopes memory to an agent identity. `subject` is the host-chosen isolation boundary: a user id, chat id, tenant id, or composite value. Baton never invents a subject from `sessionId`, persistence ids, or agent names.

## Recall

When `Agent.make({ memory })` or `RunOptions.memory` is set and the `Memory` service is present, Baton calls `recall({ key, turn: 0, prompt })` once for non-resume runs. `prompt` is the run's initial prompt before recalled memory is inserted. A run-specific `RunOptions.memory.key` overrides the agent default.

`Memory.Item.content` is `ReadonlyArray<Memory.ItemPart>`, where `ItemPart` is exactly Effect AI's `Prompt.UserMessagePart` (`Prompt.TextPart | Prompt.FilePart`). Recalled items are flattened in item and content order into one user message. That message carries the schema-backed Effect AI message option `@batonfx/core/memory: { origin: "memoryRecall" }`, is inserted after an initial system message when one exists, and precedes the run prompt. The option remains structural through Prompt concatenation, Chat persistence, Session message projection, suspension, and resume; Baton never parses message content to recover origin. If every recalled item has empty content, no message is inserted. Recall happens before model middleware, so guardrails and other prompt middleware see the enriched prompt. Because the item type admits only user-message content, a well-typed item never fails later during prompt insertion because of its part kind.

Reasoning, tool calls, tool results, and tool approval request/response parts are protocol transcript content and cannot enter recall through `Memory.Item`. `Memory.itemFromPromptPart(part)` is the explicit legacy conversion boundary: it returns `Option.some` for text and file parts and `Option.none` for every protocol-only part. A migrating implementation may filter broad legacy arrays with this function or reject the whole stored item when any result is `None`; it must not silently stringify or reinterpret rejected parts.

```ts
import { Array, Option } from "effect"
import { Memory } from "@batonfx/core"

const content = Array.getSomes(legacyParts.map(Memory.itemFromPromptPart))
const item: Memory.Item = { id, content }

const rejectedPart = legacyParts.find((part) => Option.isNone(Memory.itemFromPromptPart(part)))
```

This is a breaking experimental interface correction: consumers rename `parts` to `content` and narrow broad stored arrays through the explicit conversion boundary. Built-in memory implementations emit text-only content and require only that mechanical field rename.

Resume runs skip recall because turn 0 already happened before suspension.

## Remember

Baton calls `remember({ key, turn, transcript, terminal })` after each completed streamed turn. `transcript` is a memory-specific projection of the authoritative conversation: it excludes every message with structural `memoryRecall` origin while preserving ordinary system, user, assistant, and tool messages in order, including that turn's completed framework tool results exactly once. `Memory.projectTranscript` defines this pure projection for plain Chat histories. User-authored text identical to recalled text remains because classification never uses equality, prefixes, tags, or any other content heuristic.

When Compaction and SessionStore are active, Agent uses `Session.buildMemoryContext` over the lossless path rather than the compacted Chat projection. It ignores recalled-origin messages and synthetic Session/compaction context while retaining prompt-native pre- and post-compaction transcript entries in path order. This prevents a checkpoint summary derived from recall from entering memory without discarding legitimate authored transcript content. Without an active Session path, Agent projects the current Chat transcript directly. Legacy histories whose messages lack the Baton option are ordinary transcript content.

Prompt middleware must preserve each recall-origin message's identity lineage. Passing the same message object through does so directly; middleware that must rebuild recalled user content uses `Memory.replaceRecalledMessage` to retain the lineage while preserving structural options. Agent snapshots lineage before invoking each middleware step and fails with `MiddlewareViolation` if a marker is removed, fabricated, duplicated, or moved onto another message. Compaction receives schema-detached message data in its history, prompt, and Session-path views so in-place message mutation cannot corrupt Chat or the lossless Session path, including when compaction declines. Its result must preserve recalled-message lineage across combined history and prompt when no lossless Session path exists. With Session, a result may omit recall-origin history already represented in the lossless path, but it must preserve every recall-origin message from the unsynchronized current prompt and may not introduce or move markers.

`terminal` is `true` when the run would otherwise complete with no pending tool results and `false` when tool results will be re-fed to a follow-up turn.

Terminal remember runs after any completed-tool-result checkpoint save, then before the final persisted-chat save and `Completed`. Suspension does not remember at the suspension point; the host re-enters with `RunOptions.resume`, and the resumed run's completed turns remember normally.

## Forget

`Memory.forget({ key, id? })` is a host-requested lifecycle cleanup operation for non-durable memory implementations. Baton never calls it from the agent loop and never infers when a subject should be cleaned up. Hosts call it when their own lifecycle indicates that in-process memory for a key or one recalled item should be dropped.

Forget is store-agnostic. Omitting `id` deletes all non-durable working state for the exact `Memory.Key`. Supplying `id` narrows deletion to one implementation-owned `Memory.Item.id` under that exact key. Implementations may delegate to a backing store that supports delete-by-key and delete-by-id, or no-op when no state is retained. It does not introduce durability, retention policy, or cross-key behavior.

## Missing services and errors

Configuring `Agent.memory` adds `Memory` to the Agent's requirement parameter. Selecting `RunOptions.memory` adds `Memory` to that operation's environment. If both are absent, `Memory` remains unnecessary. Defensive runtime checks fail before the first model call for JavaScript or unsafe callers that bypass the typed contract.

`MemoryError` from `recall` or `remember` maps to `AgentError { message, turn, cause }` and fails the run. `MemoryError` from host-called `forget` is returned to the host. Hosts that want best-effort memory wrap their implementation to ignore or recover from memory failures.

## Service helpers

`Memory.merge(first, second)` recalls from both memories with `first` items first, remembers to both, and forgets from both. `layerNoop` provides a memory that recalls nothing, records nothing, and forgets successfully. The deprecated `noopLayer` compatibility alias remains available under ADR-0024. `testLayer(implementation)` provides exact recall/remember/forget behavior for tests.

## `@batonfx/memory`

`@batonfx/memory` depends only on `@batonfx/core` and `effect`. It imports provider-neutral Effect AI tags, never provider SDKs. Embeddings are supplied by an upstream `Ai.EmbeddingModel.EmbeddingModel` layer; language-model summarization is supplied by a caller-provided `Ai.LanguageModel.LanguageModel` layer.

The package exports `VectorStore`, `SemanticRecall`, `WorkingMemory`, and `combinedLayer`.

## VectorStore

`VectorStore` stores `Document { id, key, text, metadata? }` values with embeddings and queries by cosine similarity. The in-process `layerMemory` stores documents in a `Ref<HashMap>` and is non-durable. The deprecated `memoryLayer` compatibility alias remains available under ADR-0024.

Key isolation is part of the contract: query candidates must match both `key.agent` and `key.subject` exactly before scoring. Upsert replaces only the same `(agent, subject, id)` tuple. Delete without `id` removes the exact key; delete with `id` removes the exact `(agent, subject, id)` tuple. A matching-key embedding dimension mismatch fails with `VectorStoreError` instead of being silently ignored.

External stores such as pgvector or Chroma are host adapters, not part of this milestone.

## SemanticRecall

`SemanticRecall.layer(options?)` provides `Memory.Memory` from `VectorStore` and `Ai.EmbeddingModel.EmbeddingModel`. Recall extracts current user text from the run prompt, embeds it, queries the vector store, and returns each match as one text `Memory.Item` with match score metadata.

Remember is terminal-only. On terminal turns, semantic recall extracts the final user/assistant exchange, embeds that text, and upserts it into the vector store under the provided `Memory.Key`. Nonterminal turns do not upsert semantic memory.

Embedding and vector-store failures map to `MemoryError`; hosts that want best-effort behavior wrap the layer.

## WorkingMemory

`WorkingMemory.layer(options?)` provides an in-process bounded recent text tail per `Memory.Key`. Recall returns the rolling summary first when present, followed by recent user/assistant messages in order as role-prefixed text items.

Remember normalizes full transcripts to text-bearing user/assistant messages, deduplicates against the stored tail, and keeps `maxMessages` recent messages. Overflow is dropped unless `summarize` is configured. When summarization is configured, overflow plus any existing summary are summarized with the caller-provided `WorkingMemory.SummaryModel` service, not the agent loop's ambient model. `WorkingMemory.make` exposes that service as an Effect requirement and `WorkingMemory.layer` exposes it as a layer requirement. The service is captured once when working memory is constructed, reused across overflows, and remains owned by the scope that provided it. One `SynchronizedRef` owns the complete state map. Remember and forget transitions use that same ownership boundary; summarization and publication form one effectful transition, so concurrent operations cannot overwrite summaries, recent items, counters, or another key's state. Recall reads the latest committed snapshot without waiting for an in-flight transition to publish.

`WorkingMemory.summaryModelLayer` derives `WorkingMemory.SummaryModel` from the provider-neutral Effect AI `LanguageModel` service. Applications compose their chosen language-model layer into this adapter and then provide it to `WorkingMemory.layer`.

The former `summarize.model` layer-valued option remains temporarily supported for migration. It is deprecated and, when used through `WorkingMemory.layer`, is built once in that layer's owning scope rather than on every overflow. New code provides `SummaryModel` through Effect composition. Before:

```ts
WorkingMemory.layer({ summarize: { model: modelLayer } })
```

After:

```ts
WorkingMemory.layer({ summarize: {} }).pipe(
  Layer.provide(WorkingMemory.summaryModelLayer.pipe(Layer.provide(modelLayer))),
)
```

Forget without `id` drops the exact key's in-process working-memory state. Forget with `id` removes one recalled item id within the exact key; the special `working-summary` id removes the summary while preserving the recent tail.

## Combined memory

`combinedLayer(options?)` builds working memory and semantic recall and provides `Memory.merge(working, semantic)`. Recall ordering is working memory first and semantic matches second. Remember fans out to both layers.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
- `docs/spec/decisions/ADR-0024-public-api-import-and-layer-conventions.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0026-working-memory-summary-model.md`
- `docs/spec/decisions/ADR-0027-memory-item-user-content.md`
- `docs/spec/decisions/ADR-0033-truthful-agent-requirements.md`
- `docs/spec/decisions/ADR-0036-framework-tool-result-checkpoint.md`
- `docs/spec/decisions/ADR-0040-memory-recall-provenance.md`
