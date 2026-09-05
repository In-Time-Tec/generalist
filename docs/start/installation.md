---
title: "Installation"
description: "Install Generalist and the dependencies for your model provider or storage adapter."
---

Start with `generalist` and its matching `effect` version. Add provider or storage dependencies only when you use those integrations.

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist@0.62.0
```

With npm or pnpm:

**Terminal**

```bash
npm install effect@4.0.0-rc.112 generalist@0.62.0
pnpm add effect@4.0.0-rc.112 generalist@0.62.0
```

<Warning title="Pin the Effect release candidate">
Generalist 0.62.0 targets `effect@4.0.0-rc.112`. Effect AI APIs can change between release candidates. Use the documented version, and install optional `@effect/ai-*` and platform packages at the matching version.
</Warning>

## One package

Adapters ship in the `generalist` package. For example, install `generalist` and import `generalist/pg`; do not try to install `generalist/pg` as a separate package.

| Package      | Version | Runtime and role                                                                                                                     |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `generalist` | 0.62.0  | Node 22+ and Bun 1.4+: agent loop, generic Runtime, exact feature import subpaths, and the pg, mysql, cloudflare, and rivet adapters |

## Import subpaths and peers

`generalist/runtime`, `generalist/server`, `generalist/memory`, `generalist/instructions/skills`, and `generalist/providers/deterministic` are imports from generalist, never package-manager arguments. Core, generic Runtime, and the deterministic leaf need no optional peer.

| Import profile                                             | Additional dependency                                                                     | Runtime                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `generalist/pg`                                            | `@effect/sql-pg@4.0.0-rc.112` and `pg@8.23.0`                                             | Node and Bun                                                 |
| `generalist/mysql`                                         | `@effect/sql-mysql2@4.0.0-rc.112`                                                         | Node and Bun                                                 |
| `generalist/unstable/cloudflare/workers`                   | None beyond effect                                                                        | Cloudflare Workers                                           |
| `generalist/unstable/cloudflare/durable-objects`           | `@effect/sql-sqlite-do@4.0.0-rc.112`                                                      | Cloudflare Workers                                           |
| `generalist/unstable/cloudflare/dynamic-workers`           | `es-module-lexer@2.3.2`                                                                   | Cloudflare Workers                                           |
| `generalist/unstable/rivet`                                | `rivetkit@2.3.15` and `@standard-schema/spec@1.1.0`                                       | Node and Bun                                                 |
| `generalist/runtime/sqlite-bun`                            | `@effect/sql-sqlite-bun@4.0.0-rc.112`                                                     | Bun only                                                     |
| `generalist/unstable/mcp/*`                                | `@modelcontextprotocol/sdk@1.29.0`                                                        | Node, Bun; HTTP is Worker-safe                               |
| `generalist/unstable/foldkit`                              | `foldkit@0.148.2`                                                                         | Node and Bun                                                 |
| `generalist/unstable/a2a`                                  | `@a2a-js/sdk@1.0.1`                                                                       | Node and Bun                                                 |
| `generalist/unstable/ag-ui`                                | `@ag-ui/core@0.0.57`                                                                      | Node and Bun                                                 |
| `generalist/providers/<provider>`                          | The exact @effect/ai peer named by that provider; Bedrock uses its three AWS/Smithy peers | Node and Bun, except Bedrock's Node credential-chain profile |
| `generalist/testing` / `generalist/testing/runtime-driver` | `@effect/vitest@4.0.0-rc.112` and `vitest@4.1.11`                                         | Test host                                                    |

## Effect compatibility

| Generalist release | Tested Effect version |
| ------------------ | --------------------- |
| `0.62.0`           | `effect@4.0.0-rc.112` |

`generalist/unstable/foldkit` declares the exact tested optional peer `foldkit@0.148.2`.

## API stability

<Note title="Every export is @experimental">
While `effect/unstable/ai` remains unstable, every public Generalist export carries the `@experimental` tag: APIs can change in any 0.x release. There is one package and one version to track.
</Note>

Installed? [The offline quickstart](/start/quickstart) builds a tool-calling agent without an API key, or [Getting started](/getting-started) connects a real model.
