# Package Exports

| Package              | Exports                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@batonfx/core`      | `.`                                                                                                                           |
| `@batonfx/providers` | `.`, `./catalog`, `./openai`, `./anthropic`, `./openrouter`, `./openai-compat`, `./deterministic`, `./presets`, `./embedding` |
| `@batonfx/mcp`       | `.`, `./baton`                                                                                                                |
| `@batonfx/skills`    | `.`                                                                                                                           |
| `@batonfx/memory`    | `.`                                                                                                                           |
| `@batonfx/transport` | `.`, `./client`, `./errors`, `./sse`, `./ws`, `./wire`, `./session-registry`                                                  |
| `@batonfx/foldkit`   | `.`                                                                                                                           |

Current packages export Bun-friendly TypeScript source paths. The 0.1.0 docs and examples intentionally target Bun.
