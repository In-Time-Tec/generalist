# Trajectories and evals

`generalist/trajectory` projects a durable Runtime journal into a stable, schema-backed training and evaluation record. `generalist/eval` scores that record with deterministic checks or a supplied Effect AI `LanguageModel`.

## Project a Run

```ts
import { Effect, Stream } from "effect"
import { Runtime } from "generalist/runtime"
import * as Trajectory from "generalist/trajectory"

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const trajectory = yield* Trajectory.fromJournal(runtime, "run_123")
  const jsonl: Stream.Stream<Uint8Array> = Trajectory.export(trajectory, { format: "jsonl" })
  return { trajectory, jsonl }
})
```

`fromJournal` uses only the Runtime's cross-driver read surface: `snapshot`, bounded `history`, `sessionEntry`, and `resolveModelResponse`. It does not read a driver or operation store directly. Each turn contains the exact Session projection before the model response, the resolved normalized response, framework tool calls and results, raw per-attempt usage, and the last compaction for that turn.

The input is the durable `Prompt` before the first model response. Runtime encodes typed Agent input into that prompt before admission, so an arbitrary pre-encoding JavaScript value cannot be reconstructed later. Output is the encoded terminal Agent output. Failed, cancelled, and nonterminal snapshots use `null` output and their Runtime status as the stop reason.

The optional `budget` currently records a non-empty Agent budget allocation from the executable manifest. It intentionally does not infer remaining spend from partial facts. The future journaled budget/spend projection can replace that optional field without changing drivers.

## JSON Lines schema

`Trajectory.export(trajectory, { format: "jsonl" })` emits one UTF-8 line followed by `\n`:

```ts
{
  schemaVersion: "1"
  trajectory: Trajectory.Trajectory
}
```

`Trajectory.JsonlRecord` is the authoritative `Schema` for decoding the line.

## Run a deterministic suite

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent } from "generalist"
import * as Eval from "generalist/eval"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"

const triage = Agent.make({ name: "triage" })

const program = Effect.gen(function* () {
  const model = yield* TestModel.make([TestModel.text("high"), TestModel.text("low")])
  const runtime = Runtime.layerMemory({ addresses: [] }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
  )

  return yield* Eval.runSuite(
    triage,
    ["classify incident A", "classify incident B"],
    [Eval.outputMatches(Schema.String), Eval.toolCalledAtMost("search", 0), Eval.usageUnder({ tokens: 100 })],
    { concurrency: 2 },
  ).pipe(Effect.provide(Layer.merge(runtime, model.layer)))
})
```

`runSuite` returns `Eval.SuiteResult`, prints a plain-text pass/fail table, and bounds concurrent Runs by the supplied positive integer. The docs app has HTML prose-table rendering but no reusable terminal table formatter, so the package owns this small plain-text rendering.

`Eval.judge({ rubric, model })` uses `LanguageModel.generateObject` and therefore keeps `LanguageModel.LanguageModel` in the Effect requirement channel. `model` is the stable judge label included in score output; provide the corresponding model Layer at the call boundary.

USD checks use a provided `ModelCatalog` when available and otherwise the bundled catalog. Since the current catalog has no `cost` operation, the scorer computes the same price components from catalog metadata. Missing model identity, model metadata, or a required price produces unknown cost and a failed USD score rather than treating unknown as zero.
