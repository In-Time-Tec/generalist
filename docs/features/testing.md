# Testing adapters

`generalist/testing` gives adapter authors the same conformance suites used by Generalist itself and exports the scripted Effect AI model fixture as `TestModel`. Import its named members from `generalist/testing/model` when no test runner is installed. The old `generalist/test` subpath does not exist.

## Register conformance suites

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
import { MyMemory, MyRuleStore } from "my-generalist-driver"

Testing.memory({ layer: MyMemory.layerTest })
Testing.ruleStore({ layer: MyRuleStore.layerTest })
```

The Runtime `host-sessions` capability checks product Session metadata, root Run membership, and strict replay-then-live Session cursors. `memory` checks remember/recall, key isolation, whole-key deletion, and deletion by implementation-owned item id. `ruleStore` checks concurrent retention and replacement of an existing pattern. Each test gets a fresh Layer build.

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

The report has `schemaVersion: 1` and sorted `{ name, capabilities }` entries. Runtime entries use `runtimeDriver:<driver-name>`; Sandbox entries use `sandbox:<provider-name>`; memory and rule-store entries use `memory` and `ruleStore`.

The repository's Vitest reporter writes passing runtime-driver suites to the committed `docs/features/hosts-report.json`, preserving prior evidence for database suites skipped because their URL is unset. `scripts/render-hosts.ts` turns that report into `docs/features/hosts.md`; `bun run test` fails when the generated page has drifted.

## Scripted model fixtures

```ts
import { layer as testModel, text, toolCall } from "generalist/testing/model"

const model = testModel([toolCall("lookup", { orderId: "42" }, { id: "call-1" }), text("Order 42 shipped.")])
```

The model subpath depends on Effect but not `@effect/vitest` or `vitest`. One fixture owns one atomic FIFO cursor shared by streaming and non-streaming calls. It captures normalized requests before delay or failure and exposes direct and `ModelRegistry` Layers.
