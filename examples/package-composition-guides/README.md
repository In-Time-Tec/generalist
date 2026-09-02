# Package composition guides

These nine credential-free programs show the smallest useful composition for Generalist core, providers, instructions, skills, memory, MCP, transport, FoldKit, and testing. `start` runs every program in sequence.

```bash
bun --cwd examples/package-composition-guides start
```

Each file under `src/` also runs independently with `bun`, for example:

```bash
bun examples/package-composition-guides/src/memory.ts
```
