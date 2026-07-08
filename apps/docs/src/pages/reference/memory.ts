import * as Prose from "../../prose"

export const memoryReference = Prose.definePage({
  path: "/docs/reference/memory",
  title: "@batonfx/memory",
  navTitle: "memory",
  group: "Reference",
  description: "WorkingMemory, SemanticRecall, the VectorStore seam, and the combined layer.",
  content: [
    Prose.lead(
      "@batonfx/memory implements the core Memory seam twice (a recency window with optional summarization, and embedding-based semantic recall) plus the VectorStore seam they share.",
    ),
    Prose.command("Install", "bun add @batonfx/core @batonfx/memory"),
    Prose.p("Published on npm at 0.1.1. Requires ", Prose.code("@batonfx/core"), "."),
    Prose.h2("exports", "Exports map"),
    Prose.table(
      ["Subpath", "Contents"],
      [
        [
          [Prose.code(".")],
          [
            "Namespaces ",
            Prose.code("WorkingMemory"),
            ", ",
            Prose.code("SemanticRecall"),
            ", ",
            Prose.code("VectorStore"),
            ", plus ",
            Prose.code("combinedLayer"),
          ],
        ],
      ],
    ),
    Prose.h2("working-memory", "WorkingMemory"),
    Prose.p(
      Prose.code("WorkingMemory.layer(options?)"),
      " provides ",
      Prose.code("Memory.Memory"),
      " backed by an in-process store per ",
      Prose.code("Memory.Key"),
      ". It keeps the most recent user/assistant text messages verbatim; overflow beyond the window is optionally folded into a rolling summary. Recall returns the summary (wrapped in ",
      Prose.code("<working-memory-summary>"),
      " tags) followed by the recent items.",
    ),
    Prose.table(
      ["Option", "Default", "Notes"],
      [
        [[Prose.code("maxMessages")], [Prose.code("20")], "Recency window size"],
        [
          [Prose.code("summarize.model")],
          "none",
          ["A ", Prose.code("LanguageModel"), " layer; without it, overflow is dropped and the summary unchanged"],
        ],
        [
          [Prose.code("summarize.prompt")],
          "built-in summary prompt",
          "Instruction for folding overflow into the summary",
        ],
      ],
    ),
    Prose.h2("semantic-recall", "SemanticRecall"),
    Prose.p(
      Prose.code("SemanticRecall.layer(options?)"),
      " provides ",
      Prose.code("Memory.Memory"),
      " and requires ",
      Prose.code("VectorStore"),
      " and ",
      Prose.code("Ai.EmbeddingModel"),
      ". Recall embeds the run's user text and queries the store; remember fires only on terminal runs, embedding the final user/assistant exchange as one document.",
    ),
    Prose.table(
      ["Option", "Default", "Notes"],
      [
        [[Prose.code("limit")], [Prose.code("5")], "Maximum matches returned per recall"],
        [[Prose.code("minScore")], "none", "Minimum cosine score to include a match"],
      ],
    ),
    Prose.p("Match metadata carries the source document metadata plus ", Prose.code("score"), "."),
    Prose.h2("vector-store", "VectorStore"),
    Prose.p(
      "The storage seam: ",
      Prose.code("{ upsert(documents), query(query) }"),
      " failing with ",
      Prose.code("VectorStoreError"),
      ". Documents are scoped by ",
      Prose.code("Memory.Key"),
      "; queries never cross keys.",
    ),
    Prose.table(
      ["Type", "Shape"],
      [
        [[Prose.code("Document")], [Prose.code("{ id, key, text, metadata? }")]],
        [
          [Prose.code("Embedded")],
          [Prose.code("Document"), " plus ", Prose.code("{ embedding: ReadonlyArray<number> }")],
        ],
        [[Prose.code("Match")], [Prose.code("{ document: Embedded, score: number }")]],
        [[Prose.code("Query")], [Prose.code("{ key, embedding, limit, minScore? }")]],
      ],
    ),
    Prose.p(
      Prose.code("VectorStore.memoryLayer"),
      " is the in-process implementation using cosine similarity; it rejects non-finite vectors and mismatched dimensions. ",
      Prose.code("testLayer(implementation)"),
      " wraps an explicit interface; a Postgres/pgvector store implements the same two functions.",
    ),
    Prose.h2("combined", "combinedLayer"),
    Prose.p(
      Prose.code("combinedLayer({ working?, semantic? })"),
      " merges both implementations with ",
      Prose.code("Memory.merge"),
      ": recalls concatenate (working first), remembers fan out. It carries SemanticRecall's requirements (",
      Prose.code("VectorStore"),
      " and ",
      Prose.code("Ai.EmbeddingModel"),
      ").",
    ),
    Prose.p(
      "Embedding layers live in ",
      Prose.link("/docs/reference/providers", "@batonfx/providers"),
      ". See ",
      Prose.link("/docs/guides/memory", "How to add memory"),
      ".",
    ),
  ],
})
