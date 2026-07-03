# 09 — Memory

Baton memory is an optional core seam for recall before the first model turn and remember after completed turns. Core owns only the timing and prompt insertion contract. Concrete non-durable implementations live in `@batonfx/memory`; durable implementations remain host-owned.

## Scope

Baton owns:

- the `Memory` service interface in `packages/core/src/memory.ts`;
- the per-run `RunOptions.memory.key` contract;
- recall insertion into the initial prompt;
- remember calls after completed turns;
- loud error mapping into `AgentError`.

Baton core does not own vector stores, embedding models, summarization, extraction, ranking, durable storage, or automatic key derivation. `@batonfx/memory` owns only in-process, non-durable implementations over core's seam.

## Key isolation

`Memory.Key` is `{ agent, subject }`. `agent` scopes memory to an agent identity. `subject` is the host-chosen isolation boundary: a user id, chat id, tenant id, or composite value. Baton never invents a subject from `sessionId`, persistence ids, or agent names.

## Recall

When `RunOptions.memory` is set and the `Memory` service is present, Baton calls `recall({ key, turn: 0, prompt })` once for non-resume runs. `prompt` is the run's initial prompt before recalled memory is inserted.

Recalled items are flattened in source order into one user message. That message is inserted after an initial system message when one exists and before the run prompt. Recall happens before model middleware, so guardrails and other prompt middleware see the enriched prompt.

Resume runs skip recall because turn 0 already happened before suspension.

## Remember

Baton calls `remember({ key, turn, transcript, terminal })` after each completed streamed turn. `transcript` is the full `Ai.Chat` history at that point. `terminal` is `true` when the run would otherwise complete with no pending tool results and `false` when tool results will be re-fed to a follow-up turn.

Terminal remember runs before persisted-chat save and before `Completed`. Suspension does not remember at the suspension point; the host re-enters with `RunOptions.resume`, and the resumed run's completed turns remember normally.

## Missing services and errors

`Agent.stream` resolves `Memory` with `Effect.serviceOption`, so `RunServices` does not grow. If `RunOptions.memory` is absent, missing `Memory` preserves current behavior. If `RunOptions.memory` is set and `Memory` is absent, Baton fails before the first model call with `AgentError { message: "RunOptions.memory requires Memory in context", turn: 0 }`.

`MemoryError` from `recall` or `remember` maps to `AgentError { message, turn, cause }` and fails the run. Hosts that want best-effort memory wrap their implementation to ignore or recover from memory failures.

## Service helpers

`Memory.merge(first, second)` recalls from both memories with `first` items first and remembers to both. `noopLayer` provides a memory that recalls nothing and records nothing. `testLayer(implementation)` provides exact recall/remember behavior for tests.

## `@batonfx/memory`

`@batonfx/memory` depends only on `@batonfx/core` and `effect`. It imports provider-neutral Effect AI tags, never provider SDKs. Embeddings are supplied by an upstream `Ai.EmbeddingModel.EmbeddingModel` layer; language-model summarization is supplied by a caller-provided `Ai.LanguageModel.LanguageModel` layer.

The package exports `VectorStore`, `SemanticRecall`, `WorkingMemory`, and `combinedLayer`.

## VectorStore

`VectorStore` stores `Document { id, key, text, metadata? }` values with embeddings and queries by cosine similarity. The in-process `memoryLayer` stores documents in a `Ref<HashMap>` and is non-durable.

Key isolation is part of the contract: query candidates must match both `key.agent` and `key.subject` exactly before scoring. Upsert replaces only the same `(agent, subject, id)` tuple. A matching-key embedding dimension mismatch fails with `VectorStoreError` instead of being silently ignored.

External stores such as pgvector or Chroma are host adapters, not part of this milestone.

## SemanticRecall

`SemanticRecall.layer(options?)` provides `Memory.Memory` from `VectorStore` and `Ai.EmbeddingModel.EmbeddingModel`. Recall extracts current user text from the run prompt, embeds it, queries the vector store, and returns each match as one text `Memory.Item` with match score metadata.

Remember is terminal-only. On terminal turns, semantic recall extracts the final user/assistant exchange, embeds that text, and upserts it into the vector store under the provided `Memory.Key`. Nonterminal turns do not upsert semantic memory.

Embedding and vector-store failures map to `MemoryError`; hosts that want best-effort behavior wrap the layer.

## WorkingMemory

`WorkingMemory.layer(options?)` provides an in-process bounded recent text tail per `Memory.Key`. Recall returns the rolling summary first when present, followed by recent user/assistant messages in order as role-prefixed text items.

Remember normalizes full transcripts to text-bearing user/assistant messages, deduplicates against the stored tail, and keeps `maxMessages` recent messages. Overflow is dropped unless `summarize` is configured. When summarization is configured, overflow plus any existing summary are summarized with the caller-provided language-model layer, not the agent loop's ambient model.

## Combined memory

`combinedLayer(options?)` builds working memory and semantic recall and provides `Memory.merge(working, semantic)`. Recall ordering is working memory first and semantic matches second. Remember fans out to both layers.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
