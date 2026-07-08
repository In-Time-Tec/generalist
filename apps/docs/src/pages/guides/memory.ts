import pgvectorStore from "../../snippets/guides/memory/pgvector-store.ts?raw"
import semanticRecall from "../../snippets/guides/memory/semantic-recall.ts?raw"
import workingMemory from "../../snippets/guides/memory/working-memory.ts?raw"
import workingMemoryExpected from "../../snippets/guides/memory/working-memory.expected.txt?raw"
import * as Prose from "../../prose"

export const memory = Prose.definePage({
  path: "/docs/guides/memory",
  title: "How to add memory",
  navTitle: "Memory",
  group: "Guides",
  description:
    "Recall and remember across runs with Memory.Key, WorkingMemory, and SemanticRecall over a VectorStore — including a pgvector adapter recipe.",
  content: [
    Prose.p(
      "Memory is an optional recall/remember seam: before turn 0 the loop asks the ",
      Prose.code("Memory"),
      " service for items to inject, and after turns it hands back the transcript to remember. You opt in per run with ",
      Prose.code("RunOptions.memory"),
      " and a ",
      Prose.code("Memory.Key"),
      " of ",
      Prose.code("{ agent, subject }"),
      " that you choose — Batonfx never derives memory identity from session ids or users.",
    ),
    Prose.h2("working-memory", "1. Start with working memory"),
    Prose.p(
      Prose.code("WorkingMemory.layer"),
      " from ",
      Prose.code("@batonfx/memory"),
      " keeps a rolling window of recent exchanges per key (",
      Prose.code("maxMessages"),
      ", default 20). Provide the layer, pass the same key on both runs, and the second run sees what the first stored:",
    ),
    Prose.codeBlock({ label: "working-memory.ts", source: workingMemory, expectedOutput: workingMemoryExpected }),
    Prose.callout(
      "info",
      "Summarize the overflow",
      "Pass ",
      Prose.code("summarize: { model }"),
      " to ",
      Prose.code("WorkingMemory.layer"),
      " and messages that fall out of the window are folded into a running summary instead of being dropped.",
    ),
    Prose.h2("semantic-recall", "2. Add semantic recall for long-lived subjects"),
    Prose.p(
      Prose.code("SemanticRecall.layer"),
      " embeds the run's user text, queries a ",
      Prose.code("VectorStore"),
      " scoped to the key, and injects the top matches; on terminal turns it embeds and stores the final user–assistant exchange. It needs two services: a ",
      Prose.code("VectorStore"),
      " and an ",
      Prose.code("Ai.EmbeddingModel"),
      " — ",
      Prose.code("Embedding.withOpenAiEmbedding"),
      " from ",
      Prose.code("@batonfx/providers"),
      " supplies the latter:",
    ),
    Prose.codeBlock({ label: "semantic-recall.ts", source: semanticRecall }),
    Prose.p(
      "To run both kinds of memory on one key, use ",
      Prose.code("combinedLayer"),
      " from ",
      Prose.code("@batonfx/memory"),
      " — recall merges items from both, remember writes to both.",
    ),
    Prose.h2("recipe-pgvector", "Recipe: a pgvector VectorStore"),
    Prose.p(
      Prose.code("VectorStore"),
      " is provider-neutral: implement ",
      Prose.code("upsert"),
      " and ",
      Prose.code("query"),
      " and the rest of the memory stack rides on top. A pgvector adapter stores ",
      Prose.code("(agent, subject, id, text, metadata, embedding)"),
      " and filters on the key before ranking by cosine distance. Keep the adapter host-owned behind a client service you control:",
    ),
    Prose.codeBlock({ label: "pgvector-store.ts", source: pgvectorStore }),
    Prose.p(
      "The in-process ",
      Prose.code("VectorStore.memoryLayer"),
      " remains the offline-safe default — swap layers, not call sites, when you move to Postgres.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Understand where recalled items land in the prompt — ",
        Prose.link("/docs/learn/sessions-and-history", "Sessions, history, and persistence"),
        ".",
      ],
      [
        "Keep long sessions inside the window once memory grows — ",
        Prose.link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
    ),
  ],
})
