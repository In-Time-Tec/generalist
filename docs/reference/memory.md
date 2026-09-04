---
title: "generalist/memory"
description: "WorkingMemory, SemanticRecall, the VectorStore seam, and the combined layer."
---

generalist/memory implements the core Memory seam twice (a recency window with optional summarization, and embedding-based semantic recall) plus the VectorStore seam they share.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

`generalist/memory` is an import subpath, not a package.

## Exports map

| Subpath | Contents                                                                  |
| ------- | ------------------------------------------------------------------------- |
| `.`     | Namespaces `WorkingMemory`, `SemanticRecall`, `VectorStore`, plus `layer` |

## WorkingMemory

`WorkingMemory.layer(options?)` provides `Memory.Memory` backed by an in-process store per `Memory.Key`. It keeps the most recent user/assistant text messages verbatim; overflow beyond the window is optionally folded into a rolling summary. Recall returns the summary (wrapped in `<working-memory-summary>` tags) followed by the recent items.

| Option             | Default                 | Notes                                                                                                                                                    |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxMessages`      | `20`                    | Recency window size                                                                                                                                      |
| `summarize`        | disabled                | Enables overflow summarization. Provide `summarize.model` as a closed LanguageModel layer, or omit it and the layer requires the ambient `LanguageModel` |
| `summarize.prompt` | built-in summary prompt | Instruction for folding overflow into the summary                                                                                                        |
| `summarize.model`  | none                    | Closed `Layer<LanguageModel>` for summary calls                                                                                                          |

## SemanticRecall

`SemanticRecall.layer(options?)` provides `Memory.Memory` and requires `VectorStore` and `Ai.EmbeddingModel`. Recall embeds the run's user text and queries the store; remember fires only on terminal runs, embedding the final user/assistant exchange as one document.

| Option     | Default | Notes                                   |
| ---------- | ------- | --------------------------------------- |
| `limit`    | `5`     | Maximum matches returned per recall     |
| `minScore` | none    | Minimum cosine score to include a match |

Match metadata carries the source document metadata plus `score`.

## VectorStore

The storage seam: `{ upsert(documents), query(query) }` failing with `VectorStoreError`. Documents are scoped by `Memory.Key`; queries never cross keys.

| Type       | Shape                                                  |
| ---------- | ------------------------------------------------------ |
| `Document` | `{ id, key, text, metadata? }`                         |
| `Embedded` | `Document` plus `{ embedding: ReadonlyArray<number> }` |
| `Match`    | `{ document: Embedded, score: number }`                |
| `Query`    | `{ key, embedding, limit, minScore? }`                 |

`VectorStore.layerMemory` is the in-process implementation using cosine similarity; it rejects non-finite vectors and mismatched dimensions. `layerTest(implementation)` wraps an explicit service; a Postgres/pgvector store implements the same two functions.

## layer

`layer({ working?, semantic? })` merges both implementations with `Memory.merge`: recalls concatenate (working first), remembers fan out. It carries SemanticRecall's requirements (`VectorStore` and `Ai.EmbeddingModel`). Enabling `working.summarize` requires `summarize.model` or an ambient `LanguageModel` where the layer is built.

Embedding layers live in [the generalist/providers/\* provider leaves](/reference/providers). See [How to add memory](/guides/memory).
