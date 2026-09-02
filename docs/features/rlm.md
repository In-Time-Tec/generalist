# Recursive Language Models

`generalist/unstable/rlm` provides a Recursive Language Model (RLM) as an Effect AI `LanguageModel` Layer. An RLM lets a root model inspect a large prompt as data in a sandbox instead of requiring the provider to reason over every token directly. The root uses `exec` to slice, search, or transform the `prompt` variable and `llm_query` to ask a leaf model focused questions about selected context.

```ts
import { Effect, Layer } from "effect"
import { Agent, Compaction } from "generalist"
import { SandboxProvider } from "generalist/sandbox"
import * as RLM from "generalist/unstable/rlm"

declare const sandbox: Layer.Layer<SandboxProvider>

const model = RLM.layer({
  root: rootModel,
  leaf: leafModel,
  maxDepth: 2,
  maxSubCalls: 64,
}).pipe(Layer.provide(sandbox))

const compaction = Compaction.layer(Compaction.strategy([RLM.rlmOffload({ keepRecentTokens: 30_000 })]))
const services = Layer.merge(model, compaction)

const result = Agent.run(agent, input).pipe(Effect.provide(services))
```

`root` writes the analysis steps. `leaf` answers recursive `llm_query` calls after depth zero. `maxDepth` controls how many nested query levels may expose `llm_query`; `exec` remains available at the final depth. `maxSubCalls` is a hard limit across the whole outer model invocation. Reaching it fails with the existing `RunBudget.Exhausted` value for `toolCalls`, so a durable Runtime suspends through its ordinary `BudgetExhausted` / `AwaitBudget` path.

## Sandbox and replay

The Layer requires `SandboxProvider`. Each model invocation serializes the Effect AI `Prompt` through `sandbox.files`; generated source receives it as the `prompt` variable. Prompt text is never interpolated into generated code. Compacted history is similarly available as `offloadedContext`. The sandbox must support files and either `TypeScript` commands or `Process` commands with Bun available, so this leaf is not supported by the Cloudflare Worker Loader sandbox.

Every admitted `llm_query` is executed through `NestedOperation.run`. A durable host journals the prompt, depth, result, failure, and usage. Replay returns a completed nested result without contacting the leaf provider again. Root and leaf usage is aggregated into the outer model finish part, so existing token and cost accounting sees the complete recursive call tree.

## Offload instead of summary

`rlmOffload` is a compaction strategy part. It keeps the requested recent-token suffix verbatim, appends older prompt messages to a file in the RLM sandbox, and replaces them with a small checkpoint marker. Later RLM calls recover the same layer-owned sandbox and expose those messages as `offloadedContext`.

Offload beats summarization when exact old details matter, the history is too large to summarize reliably in one pass, or later questions are not predictable during compaction. Summarization is usually better when the discarded context has a stable meaning that fits in a short checkpoint, or when runs must remain independent of a live sandbox. Offloaded state lasts for the lifetime of the provided RLM Layer; use Session history as the durable lossless authority.

## Cost

RLM trades context-window pressure for computation. One answer may require several root turns, sandbox executions, and leaf calls. This can increase model tokens, latency, and provider cost even when each leaf prompt is small. Set `maxDepth` and `maxSubCalls` deliberately, keep the run's `RunBudget` bounded, and prefer ordinary compaction when a concise semantic summary is sufficient.
