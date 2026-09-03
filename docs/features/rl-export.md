# RL trajectory export (unstable)

`generalist/unstable/rl-export` projects durable Runtime journals into an operation DAG and streams leaf samples in the flattened `verifiers` v1 JSON Lines shape. The API is experimental: its package path and exported Schemas may change before Generalist 1.0.

## Project the journal DAG

```ts
import { Effect } from "effect"
import { Runtime } from "generalist/runtime"
import { Reward, dag, export as exportTrajectory } from "generalist/unstable/rl-export"

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const trajectory = yield* dag(runtime, "run_123")

  return exportTrajectory(trajectory, {
    format: "verifiers-v1",
    include: {
      logprobs: true,
      compactionBranches: true,
      childBranches: true,
      speculationLosers: false,
    },
    reward: Reward.fromGates,
  })
})
```

Each node is a semantic operation backed by a journal event: a committed or interrupted `ModelCall`, completed `ToolCall`, `ChildLink`, applied `Compaction`, or terminal Run operation. Edges carry the journal fact that connects operations:

- `parent` for the next operation in one Run;
- `fork` from the source operation at `forkedAt` to the retained branch's first new operation;
- `child` from `ChildLinked` to the child Run's first operation;
- `compaction` into an applied compaction operation.

A fork journal contains a copied retained prefix. Projection shares that prefix with its source and emits only operations after `forkedAt`, so the DAG does not duplicate copied work. Child Runs remain separate branches. A root, fork, or child Run without a model response fails with `generalist/trajectory/ProjectionFailed`, as the stable trajectory projection does.

Projection reads each Run through the cross-driver Runtime surface once and performs bounded linear passes over its journal. Export enumerates the precomputed leaves and emits each JSONL record before evaluating the next reward, so records and reward writes are streamed rather than buffered as one dataset.

## Verifiers v1 records

Every emitted UTF-8 line decodes with `VerifiersV1Record`:

```ts
{
  messages: ReadonlyArray<Prompt.Message>
  tokens?: ReadonlyArray<number>
  logprobs?: ReadonlyArray<number> | null
  reward: number
  env: {
    taskset: string
    harness: string
  }
}
```

This is Generalist's flattened branch interchange contract, not the native full `verifiers` Trace or Episode wire record. It intentionally contains only the fields in issue #359; consumers that require a complete native Trace must adapt these branch records.

`messages` is the exact Session-backed conversation at that leaf. `env.taskset` is the root Agent name because the export options do not define a separate task-set identity. `env.harness` is read from the package manifest as `generalist@<version>`.

`childBranches: false` omits leaves whose ancestry crosses a `child` edge. `compactionBranches: false` omits leaves whose ancestry contains an applied compaction. Fork leaves are always included because v1 has no fork include flag. `speculationLosers` is accepted now, but issue #358 has not added speculation journal branches; either value therefore adds no records, and the exporter never fabricates loser paths.

## Tokens and log probabilities

Generalist records token ids and log probabilities only on `ModelCall` operations whose persisted Effect AI response metadata contains either fact under the provider's `generalist` metadata. The deterministic model exposed by `generalist/testing/model` can emit this metadata through `TestModel.turn(..., { tokens, logprobs })`.

Pinned Effect AI exposes provider metadata but no provider-neutral token-id or logprob fields. The current Generalist OpenAI, Anthropic, OpenRouter, Groq, and Mistral adapters do not preserve logprobs in normalized response metadata, so their bundled `ModelCatalog` entries declare `logprobs: false`. The exporter does not reconstruct token ids from text or probabilities from token counts.

With `include.logprobs: true`, a leaf gets concatenated model-call `logprobs` only when every model call in that Run segment supplied them; otherwise it gets `logprobs: null`. `tokens` is emitted only when every model call supplied token ids. Child paths start a new Run segment at the `child` edge. With `include.logprobs: false`, both optional fields are omitted. Malformed or misaligned metadata is treated as unavailable.

## Rewards

Reward policies are directly supplied services:

- `Reward.fromGates` returns 1 when the latest verdict for every completion gate passes and 0 otherwise. No gates pass vacuously, matching `Eval.gatesPassed()`.
- `Reward.fromEval(scorers)` runs existing `generalist/eval` scorers in order and averages their scalar values. At least one scorer is required.
- `Reward.make(source, effectOrEvaluator)` accepts a custom Effect or leaf-aware Effect function.

Every finite result is appended to the same Runtime journal as `Rewarded { leaf, value, source }` before its record is emitted. There is no second event store or storage schema. A non-finite custom result fails with `generalist/rl-export/RewardInvalid` and is not journaled.
