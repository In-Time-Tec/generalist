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

## The examples

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

`deep-research-agent` starts the server; run the web UI beside it with `bun --cwd examples/deep-research-agent web`. It uses canned search results and a scripted model until you set `EXA_API_KEY` and `OPENROUTER_API_KEY`. The tutorial that builds it from scratch is [Tutorial: a research agent](/start/research-agent).
