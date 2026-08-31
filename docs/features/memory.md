# Memory

Memory is an optional `recall` / `remember` / `forget` seam keyed by a
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
  yield* Agent.generate(agent, { prompt: "Ada prefers dark mode.", memory: { key } })
  return yield* Agent.generate(agent, { prompt: "What does Ada prefer?", memory: { key } })
}).pipe(Effect.provide(WorkingMemory.layer({ maxMessages: 8 })))
```

The application also provides its language-model layer. Both runs select
`user-ada`, not the Agent default.

## What runs

```text
Agent.generate("What does Ada prefer?")
├── select key: RunOptions.memory.key
├── Memory.recall({ key, turn: 0, prompt })
├── insert one recalled user message
│   ├── after system: "support-agent instructions"
│   └── before prompt: "What does Ada prefer?"
├── model/tool loop
└── after each completed turn
    ├── project retention transcript
    └── Memory.remember({ turn, transcript, terminal })
```

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

## Implementations

- `WorkingMemory.layer` keeps a non-durable recency window per key and can
  summarize overflow into a `working-summary` item.
- `SemanticRecall.layer` plus `VectorStore.layerMemory` is non-durable. It
  embeds prompt user text for recall and stores the final user/assistant
  exchange only on terminal turns.
- `layer({ working?, semantic? })` concatenates working recall first; remember
  and forget fan out to both implementations.

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
  its `turn` and `terminal` status.
- `forget({ key })` is host-requested cleanup for the whole key;
  `forget({ key, id })` removes one implementation-owned item.
- Core defines the seam and a no-op layer. Durable storage and retention policy
  remain host-owned; in-memory implementations do not survive process loss.

## Related

- Source: `packages/generalist/src/core/context/memory.ts`
- Source: `packages/generalist/src/memory/`
- Site: `/docs/guides/memory`
- Site: `/docs/reference/memory`
