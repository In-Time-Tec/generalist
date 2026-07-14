# `@batonfx/providers`

Effect AI provider registration helpers and model metadata for Baton.

See the [Baton documentation](https://github.com/In-Time-Tec/batonfx#readme) for installation, examples, and API guidance.

## Imports and migration

Import provider namespaces from the package root:

```ts
import { Anthropic, Catalog, OpenAi } from "@batonfx/providers"
```

Established subpaths remain supported compatibility imports exposing the same module surfaces. They will not be removed before 1.0.0 and only in a separately planned major release.

| Compatibility subpath              | Canonical root namespace |
| ---------------------------------- | ------------------------ |
| `@batonfx/providers/catalog`       | `Catalog`                |
| `@batonfx/providers/openai`        | `OpenAi`                 |
| `@batonfx/providers/anthropic`     | `Anthropic`              |
| `@batonfx/providers/openrouter`    | `OpenRouter`             |
| `@batonfx/providers/openai-compat` | `OpenAiCompatible`       |
| `@batonfx/providers/deterministic` | `Deterministic`          |
| `@batonfx/providers/presets`       | `Presets`                |
| `@batonfx/providers/embedding`     | `Embedding`              |
