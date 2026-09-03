# Generalist documentation

Generalist is an Effect-native TypeScript framework for process-local and durable AI agents. The
[package README](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/README.md) owns installation,
the first runnable Agent, package status, and license information.

```sh
bun add generalist effect
```

## Catalog

- [Features](features/agent-loop.md) record current behavior and invariants, organized in navigation as Agents, Runtime,
  Batteries, Hosts, and Testing.
- [API reference](api/index.md) is generated from every public package export and searched by Mintlify.
- [Decisions](decisions/typed-tool-boundaries.md) record durable reasons behind important choices.
- [Tradeoffs](tradeoffs/strict-tool-registry.md) record meaningful gains and costs.

## Build locally

```sh
bun run docs:api
bun run docs:build
```

`docs:api` refreshes the committed TypeDoc artifact. `docs:build` reports feature pages still missing test links,
validates the current `docs.json`, and checks internal links, anchors, and redirects. Mintlify provides hosted search;
no separate search service is part of this repository.

The existing `apps/docs` deployment remains unchanged in this build-only change. The
[recorded recommendation](decisions/retire-docs-app-after-mintlify-cutover.md) is to retire it only after an owner
approves a deployed Mintlify cutover.
