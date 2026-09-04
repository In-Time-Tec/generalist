---
title: "generalist/testing"
description: "Scripted Effect AI model fixtures and normalized request capture for deterministic agent tests."
---

generalist/testing runs the real Generalist loop against scripted Effect AI responses and exports public adapter conformance suites, deterministic chaos helpers, and certification reporting.

**Install**

```bash
bun add -d effect@4.0.0-rc.112 generalist @effect/vitest@4.0.0-rc.112 vitest@4.1.11
```

`generalist/testing` is an import subpath, not a package.

## Script responses

| API                                          | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `TestModel.text(text)`                       | One text response part; a top-level part is one model invocation |
| `TestModel.toolCall(name, params, options?)` | One tool call with deterministic or explicit id                  |
| `TestModel.turn(parts, options?)`            | Group parts and set finish reason, usage, or Effect delay        |
| `TestModel.object(value, options?)`          | One schema-decoded generateObject response                       |
| `TestModel.failure(error, options?)`         | One typed Effect AI failure slot                                 |

## Stateful fixtures

`TestModel.make(script, options?)` returns a fixture whose cursor survives layer rebuilds. It exposes `layer`, `selection`, `registration`, `registryLayer`, `requests`, `prompts`, `remaining`, and `awaitRequests(count)`. Request capture is atomic and includes the normalized prompt, tools, tool choice, response format, and operation without exposing tracing spans.

`TestModel.layer(script)` is the concise direct-model convenience. Use `make` when assertions need capture state or several top-level runs share one script.

## Guide

See [How to test agents and run evals in CI](/guides/testing-evals).
