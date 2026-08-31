# Generalist

Generalist is a TypeScript framework for building AI agents on [Effect](https://effect.website). An agent is a plain value — a name, instructions, tools, and a turn policy — and running one produces a typed event stream. Models, approvals, permissions, memory, skills, and every other capability are Effect services you can swap, each with a deterministic test layer, so agents run in CI with no API keys.

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, ModelRegistry, Tool, Toolkit } from "generalist"
import { layer as deterministicLayer } from "generalist/ai/deterministic"

const searchTool = Tool.make("search_docs", {
  description: "Search local docs",
  parameters: { query: Schema.String },
  success: Schema.Array(Schema.String),
})

const toolkit = Toolkit.make(searchTool)
const agent = Agent.make({ name: "assistant", instructions: "Be concise.", toolkit })

const program = ModelRegistry.withModel(
  { provider: "deterministic", model: "local" },
  Agent.generate(agent, { prompt: "Explain Generalist in one sentence." }),
).pipe(
  Effect.provide(
    Layer.mergeAll(
      deterministicLayer({ model: "local" }),
      toolkit.toLayer({ search_docs: () => Effect.succeed(["Getting started"]) }),
    ),
  ),
)
```

Use `generalist` for process-local agents and chat streaming. Add `generalist/runtime` when runs need stable addresses, replayable events, durable waits, cancellation, or restart recovery.

## Install

```bash
bun add effect@4.0.0-rc.112 generalist@0.45.1
# plus the peer for the provider you select, for example:
bun add @effect/ai-openrouter@4.0.0-rc.112
```

Requires Node 22+ or Bun 1.4+. Everything ships as the single `generalist` package: names like `generalist/runtime` or `generalist/pg` are import subpaths, not separate packages, and each adapter's host dependencies are optional peers, so you install only what you import. Every export is `@experimental` while `effect/unstable/ai` is unstable.

## Documentation

Full documentation lives at [generalist-docs-production.up.railway.app](https://generalist-docs-production.up.railway.app), organized in [Diátaxis](https://diataxis.fr) style:

- **Tutorials** ([Start](https://generalist-docs-production.up.railway.app/docs/start/introduction)) — introduction, a five-minute quickstart, and two full app walkthroughs.
- **How-to guides** ([Guides](https://generalist-docs-production.up.railway.app/docs/guides/define-tools)) — tools, providers, approvals, memory, MCP, transport, testing, and more.
- **Explanation** ([Learn](https://generalist-docs-production.up.railway.app/docs/learn/agent-loop)) — how the agent loop, sessions, suspension, and the durable Runtime work, and why.
- **Reference** ([Reference](https://generalist-docs-production.up.railway.app/docs/reference/core-agent)) — every public entrypoint and its contract.

Runnable examples live in [`examples/`](examples/), one README each.

## Capabilities at a glance

| Area                                         | Import                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Agent loop, typed tools, approvals, steering | `generalist`                                                                              |
| Durable, addressable, replayable runs        | `generalist/runtime`                                                                      |
| Model providers and a deterministic model    | `generalist/ai/*`                                                                         |
| Memory, skills, versioned instructions       | `generalist/memory`, `generalist/instructions`                                            |
| MCP, A2A, and AG-UI integrations             | `generalist/mcp`, `generalist/a2a`, `generalist/ag-ui`                                    |
| SSE/WebSocket transport and FoldKit chat     | `generalist/transport`, `generalist/foldkit`                                              |
| Durable stores                               | `generalist/pg`, `generalist/mysql`, `generalist/cloudflare/*`, `generalist/rivet/actors` |
| Scripted models for tests                    | `generalist/test`                                                                         |

## Repository layout

| Path                                         | Purpose                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| [`packages/generalist`](packages/generalist) | The framework: core agent loop, Runtime, feature entries, adapters. |
| [`apps/docs`](apps/docs)                     | The documentation site.                                             |
| [`docs/`](docs/README.md)                    | Contributor-facing behavior records, decisions, and tradeoffs.      |
| [`examples/`](examples)                      | Runnable Bun examples, typechecked in CI.                           |

## Verification

```bash
bun install
bun run check
bun run test
```

`bun run package` additionally builds the published tarball and verifies it in fresh Bun and npm consumers. Tag pushes named `v<version>` publish to npm after checksum and provenance verification.

## License and contributions

Generalist is available under the [MIT License](LICENSE) and was developed by [In Time Tec](https://intimetec.com). The npm package is public; this repository is private. See [CONTRIBUTING.md](CONTRIBUTING.md) for access and review expectations, and [SECURITY.md](SECURITY.md) for private vulnerability disclosure.
