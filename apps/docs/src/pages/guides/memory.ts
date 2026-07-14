import pgvectorStore from "../../snippets/guides/memory/pgvector-store.ts?raw"
import semanticRecall from "../../snippets/guides/memory/semantic-recall.ts?raw"
import workingMemory from "../../snippets/guides/memory/working-memory.ts?raw"
import workingMemoryExpected from "../../snippets/guides/memory/working-memory.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const memory = definePage({
  path: "/docs/guides/memory",
  title: "How to add memory",
  navTitle: "Memory",
  group: "Guides",
  description:
    "Recall and remember across runs with Memory.Key, WorkingMemory, and SemanticRecall over a VectorStore, including a pgvector adapter recipe.",
  content: [
    p(
      "Memory is an optional recall/remember seam: before turn 0 the loop asks the ",
      code("Memory"),
      " service for items to inject, and after turns it hands back the transcript to remember. You opt in per run with ",
      code("RunOptions.memory"),
      " and a ",
      code("Memory.Key"),
      " of ",
      code("{ agent, subject }"),
      " that you choose. Batonfx never derives memory identity from session ids or users.",
    ),
    h2("working-memory", "1. Start with working memory"),
    p(
      code("WorkingMemory.layer"),
      " from ",
      code("@batonfx/memory"),
      " keeps a rolling window of recent exchanges per key (",
      code("maxMessages"),
      ", default 20). Provide the layer, pass the same key on both runs, and the second run sees what the first stored:",
    ),
    codeBlock({ label: "working-memory.ts", source: workingMemory, expectedOutput: workingMemoryExpected }),
    callout(
      "info",
      "Summarize the overflow",
      "Pass ",
      code("summarize: { model }"),
      " to ",
      code("WorkingMemory.layer"),
      " and messages that fall out of the window are folded into a running summary instead of being dropped.",
    ),
    h2("semantic-recall", "2. Add semantic recall for long-lived subjects"),
    p(
      code("SemanticRecall.layer"),
      " embeds the run's user text, queries a ",
      code("VectorStore"),
      " scoped to the key, and injects the top matches; on terminal turns it embeds and stores the final user–assistant exchange. It needs two services: a ",
      code("VectorStore"),
      " and an ",
      code("Ai.EmbeddingModel"),
      "; ",
      code("Embedding.withOpenAiEmbeddingFetch"),
      " from ",
      code("@batonfx/providers"),
      " supplies the latter:",
    ),
    codeBlock({ label: "semantic-recall.ts", source: semanticRecall }),
    p(
      "To run both kinds of memory on one key, use ",
      code("combinedLayer"),
      " from ",
      code("@batonfx/memory"),
      ": recall merges items from both, remember writes to both.",
    ),
    h2("recipe-pgvector", "Recipe: a pgvector VectorStore"),
    p(
      code("VectorStore"),
      " is provider-neutral: implement ",
      code("upsert"),
      " and ",
      code("query"),
      " and the rest of the memory stack rides on top. A pgvector adapter stores ",
      code("(agent, subject, id, text, metadata, embedding)"),
      " and filters on the key before ranking by cosine distance. Keep the adapter host-owned behind a client service you control:",
    ),
    codeBlock({ label: "pgvector-store.ts", source: pgvectorStore }),
    p(
      "The in-process ",
      code("VectorStore.memoryLayer"),
      " remains the offline-safe default; swap layers, not call sites, when you move to Postgres.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Understand where recalled items land in the prompt: ",
        link("/docs/learn/sessions-and-history", "Sessions, history, and persistence"),
        ".",
      ],
      [
        "Keep long sessions inside the window once memory grows: ",
        link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
    ),
  ],
})
