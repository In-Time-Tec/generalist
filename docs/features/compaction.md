# Compaction

Compaction shortens the active model prompt without deleting the authoritative `Session` history. A strategy decides when to run, divides the projected prompt into verbatim and summarized regions, and produces the checkpoint text.

## Cache-aware usage

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, Compaction, Session } from "generalist"
import { TestModel } from "generalist/testing"

const summaryModel = TestModel.layer([TestModel.text("## Goal\nContinue the task.")])
const agent = Agent.make({
  name: "assistant",
  input: Schema.String,
  output: Schema.String,
  instructions: "Be concise.",
})

const services = Layer.mergeAll(
  TestModel.layer([TestModel.text('"Done."')]),
  Session.layerMemory,
  Compaction.layer(
    Compaction.cacheAware({
      stablePrefixTurns: 2,
      keepRecentTokens: 20_000,
      summarize: Compaction.summarizeWithModel({ model: summaryModel }),
    }),
  ),
)

const program = Agent.run(agent, "Continue.", {
  sessionId: "conversation-1",
  compaction: { contextWindow: 64_000 },
}).pipe(Effect.provide(services))
```

`cacheAware` leaves instructions and the first `stablePrefixTurns` user-led turns byte-identical, replaces only the middle with one checkpoint message, and keeps the `keepRecentTokens` suffix verbatim. A turn begins with a user message and includes the following assistant and tool messages up to the next user message. If the stable prefix and recent suffix overlap, compaction is skipped.

`summarizeWithModel()` uses the ambient `LanguageModel`. Pass a closed `model` Layer, as above, to route summary calls to a dedicated model. It is the only built-in summarizer that calls a model; truncate-only layers are model-free.

## Strategy contract

```ts
import { Effect, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Compaction } from "generalist"

const mine = Compaction.make({
  shouldCompact: ({ tokens, contextWindow }) => tokens > contextWindow * 0.75,
  cut: (prompt, keepRecentTokens) => {
    const split = Math.max(1, prompt.content.length - keepRecentTokens)
    if (split >= prompt.content.length) return Option.none()
    return Option.some({
      keep: Prompt.empty,
      compact: Prompt.fromMessages(prompt.content.slice(0, split)),
      recent: Prompt.fromMessages(prompt.content.slice(split)),
    })
  },
  summarize: (plan) => Effect.succeed(`Replaced ${plan.compact.content.length} messages.`),
  media: "elide",
})
```

`Compaction.make(strategy, options?)` constructs the process-local service. `Compaction.layer(strategy)` provides it as a Layer. `Compaction.layer(options)` uses `defaultStrategy(options)`; pass `{ strategy, ...options }` when a custom strategy also needs Layer options.

Every `Strategy` field has one owner:

- `shouldCompact({ tokens, contextWindow })` is the proactive decision. `contextWindow` already excludes reserved response headroom. Reactive provider overflow always forces an attempt, regardless of this result.
- `cut(prompt, keepRecentTokens)` receives the current Session projection and returns `Option.none()` when there is no useful cut. A `Plan` contains `keep` (verbatim prefix), `compact` (summary input), and `recent` (verbatim suffix), all as Effect AI `Prompt` values.
- `summarize(plan, request)` returns checkpoint text. It receives the full request, including IDs, turn, normalized usage, overflow state, current history and input prompt, and any tool-output byte bound. Failures remain typed as `CompactionError`; the Effect requires `LanguageModel` only when the implementation uses one.
- `toolOutputMaxBytes`, when set, bounds successful tool results before semantic compaction. The service can return after this lossless step when the prompt fits.
- `keepRecentTokens`, when set, overrides the Layer/default suffix target passed to `cut`.
- `media` chooses reference handling during a compaction pass. `"elide"` (the default) replaces each file marker with one line containing its ref, `"keep"` preserves the marker, and `"describe"` preserves it while adding a one-line description request.

`Compaction.strategy(parts, base?)` overlays ordered `StrategyPart` values on a complete strategy. The built-in parts are `toolOutputBound`, `keepRecent`, and `structuredSummary`. Later parts win.

## Built-ins

| Strategy family                                 | Prefix                                           | Middle     | Recent tail                               | Model requirement                                                                                   |
| ----------------------------------------------- | ------------------------------------------------ | ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `defaultStrategy` / `Compaction.layer(options)` | System messages                                  | Summarized | Token-denominated, tool-safe              | Ambient `LanguageModel`, or `summaryModel` Layer                                                    |
| `cacheAware`                                    | Instructions plus oldest N turns, byte-identical | Summarized | Token-denominated, tool-safe and verbatim | Chosen by its `summarize` function                                                                  |
| Truncate-only                                   | None                                             | Dropped    | Newest context                            | `layerTruncate` requires `Tokenizer`; `layerTruncateEstimated` requires neither tokenizer nor model |

Exact truncation delegates to `Tokenizer.truncate`. Estimated truncation drops oldest messages using Generalist's bounded prompt estimator. Neither writes a semantic summary.

## When it runs

Before each model call, Generalist measures the projected history plus current input. Proactive compaction runs when `shouldCompact` returns true. A provider context-overflow response triggers one reactive attempt even when the proactive decision was false. An unchanged threshold attempt is suppressed until the context changes; overflow attempts are never suppressed.

Changed Session-backed results are committed as one `Compaction` checkpoint containing the exact projected prompt, optional summary, telemetry outbox, and before/after measurements. Hosts observe `CompactionStarted`, then exactly one terminal `CompactionSkipped`, `CompactionApplied`, or `CompactionFailed` event. `CompactionApplied.commit` carries token and entry counts before and after, while `kind` identifies semantic summarization versus tool-output microcompaction.

The checkpoint and intercepted compaction result are journaled before execution advances. Replay restores that recorded projection and replays the recorded `CompactionApplied` event; it does not call `cut` or `summarize` again.

## Invariants

- `Session` remains the lossless authority; compaction changes only its active projection.
- Verbatim regions retain Effect AI prompt messages and provider options without re-encoding through a parallel payload format.
- Tool calls are never separated from their results at the recent-tail boundary.
- Prompt-cache markers are derived only at provider send time and are not persisted by compaction.
- Summary calls use the ordinary model telemetry path with purpose `compaction-summary` and the enclosing `compactionId`.
- Media compaction operates on references and never loads blob bytes.
