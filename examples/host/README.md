# Host

This tiny deterministic CLI builds a product-facing Host over the memory Runtime. It creates a Session, starts a typed Agent, runs a plugin tool, replays the Session event stream, and prints the result without credentials or network access.

```bash
bun run --cwd examples/host start
```

The memory Runtime keeps Sessions and Runs only for the process lifetime. Replace it with the SQLite, PostgreSQL, or MySQL Runtime Layer to retain them.
