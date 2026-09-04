# Generalist documentation

New to Generalist? Start with [Getting started](getting-started.md), or run the [offline quickstart](start/quickstart.md) without an API key.

## Find what you need

- [Installation](start/installation.md): supported runtimes, versions, and optional dependencies.
- [Examples](start/examples.md): runnable projects to build on.
- [Agent loop](learn/agent-loop.md): how model calls and tools fit together.
- [Tools](guides/define-tools.md), [providers](guides/providers.md), and [memory](guides/memory.md): add capabilities to your agent.
- [Durable Runtime](features/runtime.md): run work that can recover after a restart.
- [API reference](api/index.md): exported functions and types.

Feature reference pages describe detailed behavior and limits. [Decisions](decisions/typed-tool-boundaries.md) and [tradeoffs](tradeoffs/strict-tool-registry.md) explain design choices; you do not need to read them to get started.

## Work on the docs

The website uses Mintlify. Pages live in this directory; `docs.json` controls navigation. Write guides for the person trying to complete a task: state prerequisites, show a working example, explain the result, and link to detail rather than putting every caveat in the introduction.

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

Before submitting changes:

```sh
bun run docs:build
```

This validates Mintlify configuration and checks internal links. Run `bun run docs:api` when public APIs change to regenerate the API reference. Runnable guide examples live in `examples/docs-snippets`; `bun run verify-scripted-surfaces` runs the offline examples and reports any credential-dependent skips.

See [Deployment](deployment.md) for Mintlify hosting setup.
