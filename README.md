# BatonFX

BatonFX is a standalone, **non-durable**, Effect-native agent framework — a model-turn loop built directly on `effect/unstable/ai`. Baton is the agent; a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it behind a durable runtime when you need suspend/resume durability. Baton depends on `effect` only.

## What Baton is

Baton owns the model-turn loop and nothing durable:

- **`Agent`** — an agent definition value (`Agent.make`) with `Agent.stream` (the loop primitive) and `Agent.generate` (derived). Builds an `Ai.Chat`, streams model output with `disableToolCallResolution: true`, folds stream parts, executes tool calls, re-feeds tool results, and repeats per policy.
- **`TurnPolicy`** — a plain, `Schedule`-inspired value deciding whether to run another turn when tool results are pending (`recurs`, `untilToolCall`, `both`, `make`; default `recurs(8)`).
- **`ToolExecutor`** — the tool-call execution seam (`Success | Failure | Suspend`). Default `fromToolkit` runs the toolkit's handlers in-process.
- **`Approvals`** — the enforcement point for `Ai.Tool.needsApproval` (`Approved | Denied | Pending`); `Pending` suspends the run.
- **`ModelRegistry`** — provider-agnostic `LanguageModel` layer registration and selection; missing registrations fail typed.
- **`ModelMiddleware`** — the interceptor seam for model input/output (PII scrubbing, injection screening, output filtering, logging); ships an identity default only.
- **Chat persistence seam** — `RunOptions.persistence` runs the loop on a persisted `Ai.Chat`, delegating all storage to `effect/unstable/ai`'s `Chat.Persistence`.

Suspension is a typed error (`AgentSuspended`) on the stream's error channel, re-entered via `RunOptions.resume` — the seam designed to be backed by durable runtimes like Relay. Every export is `@experimental` while `effect/unstable/ai` is itself unstable.

The full contract is in [`docs/spec/01-baton-agent-framework.md`](docs/spec/01-baton-agent-framework.md); the vocabulary is in [`CONTEXT.md`](CONTEXT.md).

## Install

```bash
bun add @batonfx/core
# optional: MCP tool bridge
bun add @batonfx/mcp
```

`effect` is a peer of your app; Baton is pinned to a single `effect` catalog entry so the two never drift.

## Usage

A persisted chat that carries conversation history across runs (memory-backed shown; swap `Persistence.layerBackingSql` for SQL):

```ts
import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent } from "@batonfx/core"

const persistenceLayer = Ai.Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const agent = Agent.make({ name: "assistant", instructions: "You are a helpful assistant." })

// Run 1 and run 2 share the same chatId, so run 2 sees run 1's history.
const program = Effect.gen(function* () {
  const first = yield* Agent.generate(agent, {
    prompt: "My name is Ada.",
    persistence: { chatId: "user-42" },
  })
  const second = yield* Agent.generate(agent, {
    prompt: "What is my name?",
    persistence: { chatId: "user-42" },
  })
  return [first.text, second.text]
}).pipe(Effect.provide(persistenceLayer))
```

Provide a `LanguageModel` layer (via `ModelRegistry` or an `@effect/ai-*` provider) plus the `ToolExecutor`, `Approvals`, and `ModelMiddleware` seams — `fromToolkit`, `autoApprove`/`denyAll`, and `identityLayer` are the built-in defaults. See the package README and tests under `packages/core` for more.

## MCP tools

`@batonfx/mcp` connects to an MCP server, discovers its tools, and exposes them two ways: as an `Ai.Toolkit` Baton consumes as-is, and as a Baton `ToolExecutor` layer (`@batonfx/mcp/baton`) that proxies calls to the server. The MCP SDK dependency lives entirely in `@batonfx/mcp`; core keeps its `effect`-only rule.

## Repository layout

| Path                     | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `packages/core`          | `@batonfx/core` — the Effect-native agent loop.                |
| `packages/mcp`           | `@batonfx/mcp` — the MCP client bridge and Baton adapter.      |
| `docs/spec/`             | Specification tree (feature docs and ADRs).                    |
| `ast-grep/`              | Structural lint rules (including the `@relayfx/*` import ban). |
| `SPEC.md` / `CONTEXT.md` | Specification index and canonical vocabulary.                  |
| `AGENTS.md`              | Conventions for AI agents working in this repo.                |

## Verification

```bash
bun install
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

## Provenance

Baton was developed by [In Time Tec](https://intimetec.com) and is composed inside [Relay](https://github.com/In-Time-Tec/relayfx) (the `@relayfx` durable runtime). BatonFX is the standalone home of the framework; the durable-composition half lives in the relayfx repository.
