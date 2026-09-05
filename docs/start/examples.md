---
title: "Examples"
description: "Choose a runnable example to build on."
---

These examples cover common starting points. They use scripted models by default; the research agent can also connect to live providers.

**Terminal**

```bash
git clone https://github.com/In-Time-Tec/generalist
cd generalist
bun install --frozen-lockfile
bun run build
```

## Local and SQLite in five minutes

Start with [examples/five-minutes](https://github.com/In-Time-Tec/generalist/tree/main/examples/five-minutes). After the setup above:

```bash
bun run --cwd examples/five-minutes start
```

It prints `Local: A durable agent can continue an accepted run after its host restarts.` and then `Recovered <runId>:` with the same summary. It closes the first SQLite Runtime scope, opens a fresh Layer on the same file, and starts with the same Session and idempotency key. The example asserts that the Run ID and output match. The temporary database is removed when the example exits; this is a reopen demonstration, not a database deployment recipe.

## More examples

| Example                    | What it shows                                                                                                                                      | Run                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `tool-calling-chatbot`     | An offline agent that emits a tool call, executes it through a ToolExecutor, and returns a final answer                                            | `bun --cwd examples/tool-calling-chatbot start`     |
| `eval-in-ci`               | A deterministic no-credential smoke eval over `Agent.run` using the ModelRegistry.withModel pattern                                                | `bun --cwd examples/eval-in-ci start`               |
| `structured-extraction`    | An offline `Agent.run` call that validates terminal model output with Effect Schema                                                                | `bun --cwd examples/structured-extraction start`    |
| `hitl-over-sse`            | An approval suspension captured as canonical RunEvents from Runtime.layerMemory and encoded for SSE                                                | `bun --cwd examples/hitl-over-sse start`            |
| `multi-agent`              | Typed `Agent.fanOut` with two child agents and the deterministic provider                                                                          | `bun --cwd examples/multi-agent start`              |
| `memory-chat`              | Two local turns with the same memory key; the second turn receives working-memory recall                                                           | `bun --cwd examples/memory-chat start`              |
| `mcp-agent`                | An agent over a fake in-memory MCP client using the `generalist/unstable/mcp/tools` adapter shape of a real connection                             | `bun --cwd examples/mcp-agent start`                |
| `capstone-local-assistant` | The runtime packages composed in one offline program: core loop, deterministic provider, skills, memory, wire frames, and the headless chat update | `bun --cwd examples/capstone-local-assistant start` |
| `deep-research-agent`      | The full server-plus-browser app: a web_search tool, SSE and WebSocket transport, and a styled FoldKit chat UI                                     | `bun --cwd examples/deep-research-agent start`      |

`deep-research-agent` starts the server; run the web UI beside it with `bun --cwd examples/deep-research-agent web`. `EXA_API_KEY` enables live Exa search; `OPENROUTER_API_KEY` independently enables a live model. With neither key, both are scripted/canned. The [research tutorial](/start/research-agent) is a smaller unstyled scaffold: it only implements canned search, even with a live model key. Its pass-through authentication is not suitable for public hosting.
