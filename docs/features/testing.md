# Testing adapters

`generalist/testing` gives adapter authors the same conformance suites and deterministic fault injection used by Generalist itself. It also exports `TestModel`, the scripted Effect AI model fixture. The old `generalist/test` subpath does not exist.

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
    runTree: { claim },
  },
})
```

Memory and permission rule stores have smaller service contracts:

```ts
import { Testing } from "generalist/testing"
import { MyMemory, MyRuleStore } from "my-generalist-driver"

Testing.memory({ layer: MyMemory.layerTest })
Testing.ruleStore({ layer: MyRuleStore.layerTest })
```

`memory` checks remember/recall, key isolation, whole-key deletion, and deletion by implementation-owned item id. `ruleStore` checks concurrent retention and replacement of an existing pattern. Each test gets a fresh Layer build.

Sandbox leaves declare their factual isolation label and run supported and unsupported operations through the same suite:

```ts
Testing.sandbox({
  name: "My Sandbox",
  isolation: "container",
  layer: MySandbox.layer,
})
```

The suite checks command round-trip and streaming, files, pause/resume retention, snapshot/fork isolation, limit enforcement, and typed `Unsupported` failures. It never treats an absent capability as a skipped test.

## Inject deterministic failures

The chaos Layers count only the boundary named by the helper. Invalid counts fail immediately with `TypeError`.

```ts
import { Effect, Layer } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Testing } from "generalist/testing"
import { RunClient } from "generalist/transport"
import { MyDriver } from "my-generalist-driver"

// Interrupt the active run after its third operation has been durably journaled.
const interruptedRuntime = MyDriver.testLayer.pipe(Layer.provide(Testing.chaos.interruptAfter(3)))

// Force RunClient's reconnect path after its second admitted event.
const reconnectingClient = RunClient.layerWebSocket.pipe(Layer.provide(Testing.chaos.dropConnection(2)))

// The deterministic provider succeeds twice, fails the third request, then repeats.
const modelProgram = LanguageModel.generateText({ prompt: "test" }).pipe(
  Effect.provide(Testing.chaos.flakyModel({ failEvery: 3 })),
)
```

`interruptAfter` fires after persistence and before the Runtime advances its in-memory completion state. `dropConnection` advances the replay cursor for the Nth event before producing a retryable socket failure. `flakyModel` shares one counter across text, object, and streaming requests.

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

## Scripted model fixtures

```ts
import { TestModel } from "generalist/testing"

const model = TestModel.layer([
  TestModel.toolCall("lookup", { orderId: "42" }, { id: "call-1" }),
  TestModel.text("Order 42 shipped."),
])
```

One fixture owns one atomic FIFO cursor shared by streaming and non-streaming calls. It captures normalized requests before delay or failure and exposes direct and `ModelRegistry` Layers.
