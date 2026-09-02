# Generalist

Generalist is an Effect-native TypeScript agent framework with a portable durable Runtime for specialized or general agents. It is for teams that want typed agent behavior inside an Effect application while keeping ownership of models, tools, storage, interfaces, and deployment. Compaction, approvals, memory, sandboxes, and multi-agent execution are swappable Layers, typed budgets travel with durable Runs, and the same Agent runs process-locally or on a recoverable host instead of becoming a separate agent product.

## Five-minute path

Install Generalist, the Effect version it currently targets, and the testing, Bun platform, and SQLite peers used by this example:

```bash
bun add generalist effect@4.0.0-rc.112 @effect/platform-bun@4.0.0-rc.112 @effect/sql-sqlite-bun@4.0.0-rc.112 @effect/vitest@4.0.0-rc.112
```

Save this as `index.ts`, then run `bun index.ts`. The scripted model is a real `LanguageModel` Layer that needs no credentials, so this path also runs unchanged in CI.

```ts
/* oxlint-disable effecttsgo/strict-effect-provide -- this example provides the Bun platform at its entry point. */
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { Agent } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
import { TestModel } from "generalist/testing"

const assistant = Agent.make({
  name: "five-minute-assistant",
  input: Schema.Struct({ topic: Schema.String }),
  output: Schema.Struct({ summary: Schema.String }),
  instructions: "Summarize the topic in one sentence.",
})

const input = { topic: "durable agents" }
const startOptions = {
  sessionId: "session:five-minutes",
  idempotencyKey: "summary:durable-agents",
}
const expected = "A durable agent can continue an accepted run after its host restarts."

const model = TestModel.layer([
  TestModel.text("Preparing a summary."),
  TestModel.object({ output: { summary: expected } }),
])

const program = Effect.gen(function* () {
  const local = yield* Effect.scoped(
    Layer.build(model).pipe(Effect.flatMap((context) => Agent.run(assistant, input).pipe(Effect.provide(context)))),
  )
  yield* Console.log(`Local: ${local.summary}`)

  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-five-minutes-" })
  const filename = path.join(directory, "runs.sqlite")
  const runtimeLayer = () =>
    Layer.merge(
      SqliteRuntime.layerSqlite({ filename, addresses: [] }).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      model,
    )
  const start = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    yield* runtime.register(assistant)
    return yield* runtime.start(assistant, input, startOptions)
  })

  const firstRunId = yield* Effect.scoped(
    Layer.build(runtimeLayer()).pipe(
      Effect.flatMap((context) =>
        start.pipe(
          Effect.provide(context),
          Effect.map((handle) => handle.runId),
        ),
      ),
    ),
  )

  const recovered = yield* Effect.scoped(
    Layer.build(runtimeLayer()).pipe(
      Effect.flatMap((context) =>
        Effect.gen(function* () {
          const handle = yield* start
          return { runId: handle.runId, output: yield* handle.await }
        }).pipe(Effect.provide(context)),
      ),
    ),
  )

  if (recovered.runId !== firstRunId) return yield* Effect.fail("SQLite did not recover the same Run")
  if (recovered.output.summary !== expected) return yield* Effect.fail("SQLite recovered an unexpected result")
  yield* Console.log(`Recovered ${recovered.runId}: ${recovered.output.summary}`)
})

await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(bunServices)))
```

`Agent.run` returns the Schema-decoded output; `Agent.stream` exposes the same loop as typed events. The first scoped SQLite Layer calls `runtime.start` and closes before the code awaits the Run. The fresh Layer registers the same Agent, reuses the same `{ sessionId, idempotencyKey }`, receives the same `runId`, and awaits the recovered output. The runnable copy is [`examples/five-minutes`](examples/five-minutes).

## Choose your batteries

No global setup chooses these policies for you. Provide the Layers needed by one Agent or host and swap them without changing the Agent definition.

| Seam                    | Default Layer or behavior                                            | Adapters                                                                    | Current contract                                                    |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Model                   | caller-provided `LanguageModel`; `TestModel.layer` for offline tests | OpenAI, Anthropic, OpenRouter, Bedrock, OpenAI-compatible, deterministic    | [Providers](docs/features/providers.md)                             |
| Tools and authorization | `ToolExecutor.layerToolkit`; allow-all and auto-approve run defaults | routed/remote execution, fail-closed rules, console or durable approvals    | [Tools and authorization](docs/features/tools-and-authorization.md) |
| Memory                  | off; `Memory.layerNoop` when an explicit Layer is useful             | working memory, semantic recall, pgvector, Supermemory                      | [Memory](docs/features/memory.md)                                   |
| Compaction              | off                                                                  | summary, cache-aware, exact or estimated truncation                         | [Compaction](docs/features/compaction.md)                           |
| Budgets                 | no limit; `RunBudget` is attached to a durable Run                   | token, cost, time, tool-call, and child limits                              | [Budgets](docs/features/budget.md)                                  |
| Multi-agent             | process-local `Agent.fanOut` with inherited services                 | typed child tools, durable children, handoffs                               | [Multi-agent](docs/features/multi-agent.md)                         |
| Sandbox                 | none                                                                 | trusted Bun/worktree Layers; hosted providers under `generalist/unstable/*` | [Sandboxes](docs/features/sandbox.md)                               |
| Runtime                 | optional; `Runtime.layerMemory`                                      | Bun SQLite, PostgreSQL, MySQL, Cloudflare, Rivet                            | [Runtime](docs/features/runtime.md)                                 |
| Testing                 | `TestModel.layer` and `layerTest`/`layerMemory` seams                | Runtime, memory, rule-store, and sandbox conformance kits                   | [Testing](docs/features/testing.md)                                 |

## Hosts

The Runtime contract stays the same while the host and storage Layer change. The [generated host matrix](docs/features/hosts.md) is the authority for current certification evidence and exact capabilities.

| Need                                   | Host                                | Tier                        |
| -------------------------------------- | ----------------------------------- | --------------------------- |
| Process-local execution                | `Runtime.layerMemory`               | stable, not restart-durable |
| One Bun process with restart recovery  | `generalist/runtime/sqlite-bun`     | stable                      |
| Shared workers                         | `generalist/pg`, `generalist/mysql` | stable                      |
| Cloudflare Workers and Durable Objects | `generalist/unstable/cloudflare/*`  | unstable                    |
| Rivet actors                           | `generalist/unstable/rivet`         | unstable                    |

Use [`Generalist.create()`](docs/features/host.md) from `generalist/host` for product-facing Sessions and Runs. Mount that Host through [`generalist/server`](docs/features/server.md) when an application needs the schema-first HTTP, SSE, or WebSocket boundary.

## How it compares

[effect-agent](https://effect-agent.com) is the closest alternative for an Effect-native harness and includes typed agent I/O, budgets, testing, and durable Node/SQLite and Cloudflare hosts; Generalist differs by using one Runtime driver contract across process memory, SQLite, PostgreSQL, MySQL, Cloudflare, and Rivet, with typed recovery/operator surfaces and reusable conformance kits. [Pi](https://github.com/badlogic/pi-mono) is strong as a small, extensible coding-agent harness and also publishes lower-level model, agent-loop, and TUI packages. [OpenCode](https://opencode.ai) is a ready-to-use coding agent for terminal, IDE, and desktop workflows with broad model support. [Vercel AI SDK](https://ai-sdk.dev) is a provider-neutral toolkit for AI applications and agents, especially web UI and streaming integrations; Generalist is the Effect-native choice when the application wants dependencies, failures, interruption, durable recovery, and test implementations expressed as Effects and Layers.

## Stability and versions

Generalist is pre-1.0 and has no compatibility promise yet. Every public export is marked `@experimental` while `effect/unstable/ai` is unstable, and Generalist currently targets exactly `effect@4.0.0-rc.112`. Supported subpaths such as `generalist`, `generalist/runtime`, `generalist/host`, `generalist/server`, and `generalist/testing` are the v1 candidates; `generalist/unstable/*` subpaths may change or disappear faster. Keep Generalist, Effect, and imported optional peers on compatible exact versions, and expect deliberate breaking changes to replace old contracts rather than add compatibility shims.

Generalist requires Node 22+ or Bun 1.4+, is available under the [MIT License](LICENSE), and was developed by [In Time Tec](https://intimetec.com). See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) for contribution and vulnerability-reporting guidance.
