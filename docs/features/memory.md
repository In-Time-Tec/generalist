# Memory

Memory is an optional `recall` / `remember` / `forget` / `history` / `revert` seam keyed by a
host-chosen `{ agent, subject }`. Generalist injects recalled items before the
run prompt, then projects them out before retention.

## Usage

```ts
import { Effect } from "effect"
import { Agent, Memory } from "generalist"
import { WorkingMemory } from "generalist/memory"

const key: Memory.Key = { agent: "support-agent", subject: "user-ada" }
const agent = Agent.make({ name: "support-agent", memory: { agent: "support-agent", subject: "default-user" } })

const program = Effect.gen(function* () {
  // RunOptions.memory.key overrides agent.memory.
  yield* Agent.run(agent, "Ada prefers dark mode.", { memory: { key } })
  return yield* Agent.run(agent, "What does Ada prefer?", { memory: { key } })
}).pipe(Effect.provide(WorkingMemory.layer({ maxMessages: 8 })))
```

The application also provides its language-model layer. Both runs select
`user-ada`, not the Agent default.

## What runs

```text
Agent.run("What does Ada prefer?")
├── select key: RunOptions.memory.key
├── Memory.recall({ key, turn: 0, prompt })
├── insert one recalled user message
│   ├── after system: "support-agent instructions"
│   └── before prompt: "What does Ada prefer?"
├── model/tool loop
└── after each completed turn
    ├── project retention transcript
    └── Memory.remember({ turn, transcript, terminal, evidence: [{ runId, turn }] })
```

## Versioned entries

`remember` always carries journal evidence. A new semantic entry starts at version `1`; a correction names both the globally unique `entryId` and the active numeric `supersedes` version. The adapter appends the next version rather than replacing old text.

```ts
yield *
  memory.remember({
    key,
    turn: 2,
    transcript,
    terminal: true,
    entryId,
    supersedes: 1,
    evidence: [
      { runId: "run:original", turn: 0 },
      { runId: "run:correction", turn: 2 },
    ],
  })

yield * memory.history(entryId)
// [{ version: 1, text, evidence, appliedAt },
//  { version: 2, text, evidence, supersedes: 1, appliedAt }]

yield * memory.revert(entryId, { to: 1 })
```

`history` is append-only and ordered by version. `forget({ key, id })` removes an entry from active recall but retains its versions. `revert` points active recall at an existing retained version and does not delete later versions or append a synthetic version.

## Data flow

```text
Memory.Item[]
[{ id: "working-1", content: [text("User: Ada prefers dark mode.")] }]
        │ flatten content; item ids and metadata are not injected
        ▼
Prompt.UserMessage
role: "user"
options["generalist/memory"] = { origin: "memoryRecall" }
        │ insert after system and before live prompt
        ▼
Model prompt
[system, recalled user, user("What does Ada prefer?")]
        │ projectTranscript() before remember
        ▼
Retention transcript
[system, user("What does Ada prefer?"), assistant(...)]
```

## Working and semantic memory

- `WorkingMemory.layer` keeps a non-durable recency window per key and can
  summarize overflow into a `working-summary` item. Pass
  `summarize: { model }` with a closed `Layer<LanguageModel>` (typically a
  provider's `layerModel`) to give summary calls their own model; omit `model`
  and the layer carries the ambient `LanguageModel` requirement.
- `SemanticRecall.layer` embeds prompt user text for similarity search and
  stores the final user/assistant exchange only on terminal turns. It owns
  version history through its `VectorStore` and needs one Effect AI
  `EmbeddingModel`.
- `layer({ working?, semantic? })` concatenates working recall first; remember
  and forget fan out to both implementations.

Working memory is a bounded prompt window, not version authority: superseding
`remember` and `revert` fail with `MemoryError { reason: "unsupported" }`, and
`history` returns no entries. Semantic memory is retrieval across older exchanges. In the
combined layer, version operations route to the semantic implementation that
owns the entry. Use a semantic-only layer where versioned rewrites must also be
the complete recalled view; working-memory copies have their own item identities
and are not rewound by semantic reversion.

## Semantic adapters

### In-memory

`VectorStore.layerMemory` is deterministic process-local storage for tests and
short-lived applications. It retains append-only versions and active-version
pointers but is not durable.

### PostgreSQL with pgvector

`layerPgVector` uses the shared `SqlClient` from `@effect/sql`; it
does not create a second connection pool or depend on `pg`.

```ts
import { Layer } from "effect"
import { layer as layerMemory, layerPgVector } from "generalist/memory"
import { layerEmbedding } from "generalist/providers/amazon-bedrock"

const memory = layerMemory({ semantic: { limit: 5 } }).pipe(
  Layer.provide(layerPgVector({ table: "generalist_memory", dimensions: 1024 })),
  Layer.provide(layerEmbedding({ model: "amazon.titan-embed-text-v2:0" })),
)
```

Provide the resulting layer with your existing PostgreSQL `SqlClient`. Before
the first run, enable pgvector in that database with an account allowed to
install extensions:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The application account only needs normal create/read/write privileges for the
configured table after that. The adapter creates the configured active-vector
table plus a minimal `<table>_history` companion containing version, evidence,
supersession, application time, and active-pointer state. This changes the
pre-1.0 pgvector persisted shape but does not change the durable Runtime SQL
schema. Existing active rows are backfilled as version `1` with empty evidence
and the migration time as `appliedAt`; duplicate legacy ids across memory keys
fail setup because version operations require global entry ids. The adapter
validates every vector against `dimensions`, scopes rows by the complete
`{ agent, subject }` key, and keeps data when its layer is closed and rebuilt.

### Supermemory

Supermemory replaces both local embeddings and `VectorStore`:

```ts
import { Config } from "effect"
import { layerSupermemory } from "generalist/memory"

const memory = layerSupermemory({
  apiKey: Config.redacted("SUPERMEMORY_API_KEY"),
  containerTag: "session:user-ada",
})
```

A string binds the layer to one Supermemory container. For one layer shared by
many keys, also pass `containerTagForKey: (key) => key.subject`; the host remains
the authority that maps keys to tenant-safe container tags. Whole-key `forget`
deletes that container through Supermemory's container-tag endpoint, which
requires an organization owner or admin API key. One-item `forget` uses the v4
memory endpoint. HTTP and response-decoding failures become `MemoryError` with
a typed `SupermemoryError { status, body }` in `cause`.

Supermemory's remote API does not expose append-only history or atomic revert.
Its ordinary `recall`, new-entry `remember`, and `forget` operations remain
available, but superseding `remember`, `history`, and `revert` fail explicitly
with `MemoryError { reason: "unsupported" }`. It does not register the
`versioning` conformance capability.

Tests use recorded HTTP responses. A live run is intentionally opt-in: set
`SUPERMEMORY_API_KEY` and use the same layer with `FetchHttpClient.layer`; do
not put the key in source control.

## Embedding models

Semantic recall accepts the provider-neutral `EmbeddingModel` from
`effect/unstable/ai`:

- OpenAI: `generalist/providers/openai-embedding`.
- Amazon Bedrock Titan: `layerEmbedding` from
  `generalist/providers/amazon-bedrock`. Titan v2 supports 256, 512, and 1024
  dimensions; its default is 1024.
- Ollama and other OpenAI-compatible servers:
  `generalist/providers/openai-compatible-embedding` with the server base URL.

To bring your own provider, implement the batch boundary once:

```ts
import { Effect, Layer } from "effect"
import { AiError, EmbeddingModel } from "effect/unstable/ai"

declare const embedBatch: (inputs: ReadonlyArray<string>) => Effect.Effect<Array<Array<number>>, AiError.AiError>

const embeddings = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      embedBatch(inputs).pipe(Effect.map((results) => ({ results, usage: { inputTokens: undefined } }))),
  }),
)
```

The vector-store `dimensions` must exactly equal the model output length.

## Invariants

- Hosts choose every memory key; Generalist derives neither subject identity
  nor retention policy.
- `RunOptions.memory.key` overrides `Agent.memory`; either requires a `Memory`
  service. With neither, the seam is inactive.
- Recall runs once before turn `0` against the initial prompt.
- All non-empty recalled item content becomes one user message after an initial
  system message and before the run prompt; no message is inserted when every
  item is empty.
- Recall provenance is structural: `options["generalist/memory"]` is
  `{ origin: "memoryRecall" }`.
- Retention removes structurally provenanced recall, never text-equal content;
  matching user-authored text remains eligible.
- With Session and compaction, retention projects from the lossless active
  Session path and excludes synthetic recall and checkpoint content.
- `remember` receives the projected transcript after each completed turn plus
  its `turn`, `terminal` status, and `{ runId, turn }` evidence.
- Semantic entry ids are global because `history(entryId)` and
  `revert(entryId, ...)` do not take a key.
- Semantic versions are retained in insertion order; only the active version
  participates in recall.
- `forget({ key })` is host-requested cleanup for the whole key;
  `forget({ key, id })` removes one implementation-owned item.
- Core defines the seam and a no-op layer. Retention policy remains host-owned;
  only pgvector and hosted Supermemory survive process loss, and only pgvector
  of those durable adapters supports version history.

The Memory conformance suite records `versioning` separately. The local
SemanticRecall/VectorStore composition and pgvector register it; WorkingMemory
and Supermemory do not.

## Related

- Source: `packages/generalist/src/core/context/memory.ts`
- Source: `packages/generalist/src/memory/`
- Site: `/docs/guides/memory`
- Site: `/docs/reference/memory`
