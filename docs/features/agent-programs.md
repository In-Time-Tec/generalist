# Agent programs

An Agent Program pins model-authored JavaScript to exact schemas, sandbox identity, capabilities, and budgets. `AgentProgram.run` crosses only encoded boundaries; `ProgramRunner` owns admission and host policy.

## Usage

Given host-owned `toolPin`, `budget`, `executor`, and matching `handlers`:

```ts
const program = AgentProgram.make({
  name: "increment-program",
  source: `export default (input, capabilities) => capabilities.call("callTool",
    { operation: "add", tool: "increment", input: input.value })`,
  sandbox: Pins.makeCapability({ sandbox: "worker-loader-v1" }),
  input: Schema.Struct({ value: Schema.Finite }),
  inputPin: Pins.makeCapability({ codec: "input-v1" }),
  output: Schema.Finite,
  outputPin: Pins.makeCapability({ codec: "number-v1" }),
  tools: [{ name: "increment", pin: toolPin }],
  agents: [],
  steps: [],
  budget,
})
const layer = ProgramRunner.layerDirect({ executor, handlers })
const result = AgentProgram.run(program, { value: 41 }).pipe(Effect.provide(layer))
```

`executor` is a production `CodeExecutor`; Generalist's shipped implementation is Cloudflare Worker Loader at `generalist/cloudflare/dynamic-workers`. Test-only examples may use `CodeExecutor.makeTest`.

## What runs

```text
AgentProgram.run(program, { value: 41 })
├── input codec encode -> { value: 41 }
└── ProgramRunner.execute()
    ├── verify Program pin and exact handler closure
    ├── build grants and budget counters
    └── CodeExecutor.execute(request)
        └── isolated program.js
            └── callTool({ operation: "add", input: 41 })
                ├── decode -> authorize -> execute(41)
                └── encode -> 42
        └── result envelope -> 42
    ├── validate output-byte budget
    └── output codec decode -> 42
```

The sandbox receives normalized source, its digest, encoded input, explicit limits, capability grants, and an interruption signal. It never receives credentials, stores, Runtime services, Layers, handlers, Agent values, or ambient host objects.

## Runtime code mode

An Agent with `ProgramAuthority` gets the Runtime-owned `code_mode` Effect AI tool. Its schema advertises only the authority's exact tool, step, and Agent selection IDs and budget maxima; a call may select a unique subset and smaller budgets.

```text
Agent tool call: code_mode({ tools: ["search"], ... })
└── validate source, selections, and budgets
    └── build exact Program manifest and child executable
        └── child Run ID = hash(parent Run ID, tool-call ID)
            └── suspend parent until terminal reconciliation
```

## Invariants

- The Program manifest protocol is version `1`; its pin covers source bytes, sandbox, input/output schemas, capability identities, budgets, and every reachable Agent.
- `ProgramRunner.layerDirect` rejects a changed Program pin, missing or mismatched handler pins, and handlers outside the manifest closure.
- `ProgramHandlers` owns live tool/step codecs and handlers, exact Agent executors, authorization, and replay policy; Program source owns none of those policies.
- Agent handlers decode to `Prompt.RawInput` and report text, turns, and input/output token usage; every Program, tool, step, and Agent boundary applies its pinned codec.
- Sandboxed source can use only manifest-scoped discovery/schema description, `callTool`, `callStep`, `runAgent`, `mapAgents`, `fanOutAgents`, and `log`; results cross the runner seam before decoding or persistence.
- Budgets cover tool calls, Agent runs, concurrency, tokens, log bytes, wall clock, and output bytes; maps and fan-outs use bounded structured concurrency.
- Operation names and fan-out member keys start with a letter, contain only letters, digits, `_`, or `-`, and are at most 64 characters.
- Map/fan-out member keys are unique, canonically sorted, and results use that order.
- A `CodeExecutor` has one schema-backed immutable, credential-free identity describing provider/runtime/template versions, isolation, persistence, network posture, enforced limits, and bounded known limitations.
- Executor admission fails before evaluation for absent/trusted isolation, non-fresh persistence, non-default-deny network, unenforced guarantees, or requested limits above an executor maximum.
- Result validation binds protocol version, request ID, source digest, and both codec identities; the executor evaluates only the normalized request while `ProgramRunner` remains authoritative for closure, codecs, and budgets.
- `sidecar-process-v8-isolate` means a native child-process sidecar owns the V8 isolate; it does not mean in-process execution, Wasm, a container, or a microVM.
- Generalist ships a production Cloudflare Worker Loader executor, but no AgentOS or E2B executor.
- `CodeExecutor.makeTest` and `layerTest` are trusted, unenforced fixtures rejected by production admission and provider conformance; conformance observes the boundary but cannot prove vendor physical isolation, and evidence must distinguish fixtures, local runtimes, and credentialed providers.
- `ProgramAuthority` pins one sandbox and input/output codecs, bounds source bytes/catalogs/budgets, and exposes no general dynamic-executable admission operation.
- Selection failures identify the catalog dimension, requested ID, and complete bounded allowed-ID catalog.
- A code-mode child retains the root Run ID, owns a child stream, and uses registrations narrowed to its executable closure; terminal reconciliation is repeatable across early completion and restart.
- Root cancellation reaches the child and sandbox interruption signal.
- Runtime resolves and attests tagged definitions in fresh scopes per host attempt, persists executable-neutral results/checkpoints, and commits child terminal state only after resolver/service finalization.
- Durable Agent runs/maps/fan-outs atomically reserve identity and budget, admit ordered child Runs, replay by joining persisted child IDs without redispatch, and enforce map concurrency.
- The terminal transaction settles fan-out membership, promotes queued members, closes the wait, releases the parent claim, and makes the parent schedulable; cancellation settles owned children, waits, operations, and slots before terminal state.
- Memory and SQL stores share fenced idempotent admission; Memory, SQLite, PostgreSQL, and MySQL preserve Program budgets, results, operations, fan-outs, and child ownership across reopen.
- SQLite reconstructs a reopened child only from its manifest and persisted registrations; the application resolver supplies matching codecs, executor, and handlers.
- Runtime records stable source-owned operation names before dispatch, replays matching results, rejects changed input as divergence, and leaves unknown non-idempotent outcomes `needs-resolution` unless cancelled; cancellation may settle the Run while preserving `unknown`.
- Structured logs are canonical Run events committed atomically with their operation result.
- Durable recording, replay, waits, recovery, cancellation, and durable budget state belong to Runtime, not Core; missing registrations and authority/source/capability/budget/admission violations remain typed failures.

## Related

- Source: `packages/generalist/src/core/program/`, `packages/generalist/src/runtime/code-mode.ts`, `packages/generalist/src/runtime/program/`, `packages/generalist/src/cloudflare/dynamic-workers/`
- Decisions/tradeoffs: [`agentos-code-executor-rejected.md`](../decisions/agentos-code-executor-rejected.md), [`e2b-program-executor-rejected.md`](../decisions/e2b-program-executor-rejected.md)
