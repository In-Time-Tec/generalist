# Five minutes

See the same agent run locally and recover through SQLite after its Runtime closes and reopens. This example uses a scripted model, so no API key is needed.

For a first agent without a database, start with the [offline quickstart](../../docs/start/quickstart.md).

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/five-minutes start
```
