# Testing

Test agent behavior with scripted model responses instead of calling a paid API. You can check your prompts, tool handlers, and output handling with predictable results.

## Test an agent without an API key

Save this as `agent-check.ts` and run `bun agent-check.ts` in a project with Generalist and Effect installed:

```ts
import { Console, Effect } from "effect"
import { Agent } from "generalist"
import { layer as testModel, text } from "generalist/testing/model"

const assistant = Agent.make({ name: "assistant" })

await Effect.gen(function* () {
  const answer = yield* Agent.run(assistant, "Say hello.")
  if (answer !== "Hello!") return yield* Effect.fail("Unexpected answer")
  yield* Console.log("Agent check passed")
}).pipe(Effect.provide(testModel([text("Hello!")])), Effect.runPromise)
```

The program prints `Agent check passed`. The model returns the scripted response regardless of the prompt, so this checks your application's handling of the response—not whether a real model follows instructions. Use [evals](../guides/testing-evals.md) to measure behavior with real models.

For tool-calling tests, script a `toolCall(...)` followed by the final `text(...)`, and provide the toolkit's handler Layer and authorization policy. The [offline quickstart](../start/quickstart.md) shows a complete example.

## Test a custom adapter

If you are implementing a Runtime driver, memory store, or sandbox adapter, `generalist/testing` provides the shared conformance suites used by Generalist itself. The `generalist/testing/model` subpath is independent of Vitest; the conformance suites use `@effect/vitest`.

### Register conformance suites

An out-of-repo Runtime driver advertises only capabilities it implements. Capability values carry the driver-specific operations needed by the shared expectations.

```ts
import { Effect } from "effect"
import { Testing } from "generalist/testing"
import type { ClaimExecution } from "generalist/testing/runtime-driver"
import { MyDriver } from "my-generalist-driver"

const claim: ClaimExecution = ({ store }, { runId, workerId }) =>
  store.claimExecution({ runId, ownerId: workerId }).pipe(Effect.orDie)

Testing.runtimeDriver({
  name: "my-driver",
  address: MyDriver.testAddress,
  layer: MyDriver.testLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    "approval-suspend": { claim, recovery: "rebuild" },
    "host-sessions": { claim },
    "operator-explain": true,
    "operator-retry": { claim },
    "operator-resolve-unknown": { claim },
    "operator-scan": { claim },
    runTree: { claim },
  },
})
```

`approval-suspend` runs the shared durable human-approval scenario: notify, suspend, recover the same store, resolve by token, finish, and prove the tool dispatched once. Persistent drivers use `recovery: "rebuild"`; process-memory drivers use `"reclaim"` to exercise the same owner handoff without pretending their store survives process exit.

The four `operator-*` capabilities check journal-derived explanations and verification, explicit replay of safe operations, human resolution of unknown outcomes, persisted operator identity, illegal-action rejection, and store-wide obligation scans. Advertise only the actions the driver implements.

Memory and permission rule stores have smaller service contracts:

```ts
import { Testing } from "generalist/testing"
import { MyBlobStore, MyMemory, MyRuleStore } from "my-generalist-driver"

Testing.memory({ layer: MyMemory.layerTest })
Testing.ruleStore({ layer: MyRuleStore.layerTest })
Testing.blobStore({ layer: MyBlobStore.layerTest, maxBytes: 1024, persistent: true })
```

The Runtime `host-sessions` capability checks product Session metadata, root Run membership, and strict replay-then-live Session cursors. `memory` checks remember/recall, key isolation, whole-key deletion, and deletion by implementation-owned item id. `ruleStore` checks concurrent retention and replacement of an existing pattern. `blobStore` checks content hashes, byte round-trips, canonical deduplication, missing refs, upload limits, and, when `persistent: true`, a fresh-Layer close/reopen boundary. Each test gets a fresh Layer build.

Sandbox leaves declare their factual isolation label and run supported and unsupported operations through the same suite:

```ts
Testing.sandbox({
  name: "My Sandbox",
  isolation: "container",
  layer: MySandbox.layer,
})
```

The suite checks command round-trip and streaming, files, pause/resume retention, snapshot/fork isolation, limit enforcement, and typed `Unsupported` failures. It never treats an absent capability as a skipped test.

## Write certification evidence

Suites record themselves only when a test body runs; skipped suites are absent. `write` creates the parent directory and writes stable, schema-encoded JSON through Effect `FileSystem`.

```ts
import { Effect } from "effect"
import { Testing } from "generalist/testing"

const writeCertification = Testing.report.write({
  path: "reports/certification.json",
})

// Provide the host's FileSystem and Path Layers at the test-runner boundary.
Effect.runPromise(writeCertification.pipe(Effect.provide(MyDriver.platformLayer)))
```

The report has `schemaVersion: 1` and sorted `{ name, capabilities }` entries. Runtime entries use `runtimeDriver:<driver-name>`; Sandbox entries use `sandbox:<provider-name>`; service suites use `blobStore`, `memory`, and `ruleStore`.

The repository's Vitest reporter writes passing runtime-driver suites to the committed `docs/features/hosts-report.json`, preserving prior evidence for database suites skipped because their URL is unset. `scripts/render-hosts.ts` turns that report into `docs/features/hosts.md`; `bun run test` fails when the generated page has drifted.

## Scripted model fixtures

```ts
import { layer as testModel, text, toolCall } from "generalist/testing/model"

const model = testModel([toolCall("lookup", { orderId: "42" }, { id: "call-1" }), text("Order 42 shipped.")])
```

The model subpath depends on Effect but not `@effect/vitest` or `vitest`. One fixture owns one atomic FIFO cursor shared by streaming and non-streaming calls. It captures normalized requests before delay or failure and exposes direct and `ModelRegistry` Layers.

Test: [`testing/runtime-driver/index.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/testing/runtime-driver/index.test.ts)
