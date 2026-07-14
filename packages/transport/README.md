# `@batonfx/transport`

Replayable SSE, WebSocket, wire, and session transport primitives for Baton.

See the [Baton documentation](https://github.com/In-Time-Tec/batonfx#readme) for installation, examples, and API guidance.

## Imports and migration

Import transport namespaces from the package root:

```ts
import { Client, SessionRegistry, Sse, Wire, Ws } from "@batonfx/transport"

const registry = SessionRegistry.layerMemory({ agent })
```

Established subpaths remain supported compatibility imports exposing the same module surfaces. They will not be removed before 1.0.0 and only in a separately planned major release.

| Compatibility subpath                 | Canonical root namespace |
| ------------------------------------- | ------------------------ |
| `@batonfx/transport/client`           | `Client`                 |
| `@batonfx/transport/errors`           | `Errors`                 |
| `@batonfx/transport/sse`              | `Sse`                    |
| `@batonfx/transport/ws`               | `Ws`                     |
| `@batonfx/transport/wire`             | `Wire`                   |
| `@batonfx/transport/session-registry` | `SessionRegistry`        |
