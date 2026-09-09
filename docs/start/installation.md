---
title: "Installation"
description: "Install Generalist and the dependencies for your model provider or storage adapter."
---

Start with `generalist` and its matching `effect` version. Add provider or storage dependencies only when you use those integrations.

<Warning>
These instructions target Generalist 0.65.1. Use the [repository examples](/start/examples) to run directly from a checkout. Do not substitute an older release and assume the same APIs.
</Warning>

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist@0.65.1
```

With npm or pnpm:

**Terminal**

```bash
npm install effect@4.0.0-rc.112 generalist@0.65.1
pnpm add effect@4.0.0-rc.112 generalist@0.65.1
```

<Warning title="Pin the Effect release candidate">
Generalist 0.65.1 targets `effect@4.0.0-rc.112`. Effect AI APIs can change between release candidates. Use the documented version, and install optional `@effect/ai-*` and platform packages at the matching version.
</Warning>

## One package

Adapters ship in the `generalist` package. For example, install `generalist` and import `generalist/durability/s3`; do not install that subpath as a separate package. S3 and native R2 share one durability engine; compute hosts do not select a different storage backend.

| Package      | Version | Runtime and role                                                                                                       |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `generalist` | 0.65.1  | Node 22+ and Bun 1.4+: agent loop, object-backed Runtime, exact feature imports, and Cloudflare/Rivet compute adapters |

## Import subpaths and peers

`generalist/runtime`, `generalist/server`, `generalist/memory`, `generalist/instructions/skills`, and `generalist/providers/deterministic` are imports from generalist, never package-manager arguments. Core, generic Runtime, and the deterministic leaf need no optional peer.

| Import profile                                             | Additional dependency                                                                       | Runtime                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `generalist/durability/s3`                                 | `@aws-sdk/client-s3@3.1124.0` and `@smithy/fetch-http-handler@5.7.2`                        | Node and Bun; explicit credentials                           |
| `generalist/durability/r2`                                 | None beyond effect                                                                          | Cloudflare native R2 binding                                 |
| `generalist/unstable/cloudflare/workers`                   | None beyond effect                                                                          | Cloudflare Workers                                           |
| `generalist/unstable/cloudflare/durable-objects`           | None beyond effect; application supplies R2 and Crypto                                      | Cloudflare Workers                                           |
| `generalist/unstable/cloudflare/dynamic-workers`           | `es-module-lexer@2.3.2`                                                                     | Cloudflare Workers                                           |
| `generalist/unstable/rivet`                                | `rivetkit@2.3.15` and `@standard-schema/spec@1.1.0`, plus the chosen object transport peers | Node and Bun                                                 |
| `generalist/unstable/mcp/*`                                | `@modelcontextprotocol/sdk@1.29.0`                                                          | Node, Bun; HTTP is Worker-safe                               |
| `generalist/unstable/foldkit`                              | `foldkit@0.148.2`                                                                           | Node and Bun                                                 |
| `generalist/unstable/a2a`                                  | `@a2a-js/sdk@1.0.1`                                                                         | Node and Bun                                                 |
| `generalist/unstable/ag-ui`                                | `@ag-ui/core@0.0.57`                                                                        | Node and Bun                                                 |
| `generalist/providers/<provider>`                          | The exact @effect/ai peer named by that provider; Bedrock uses its three AWS/Smithy peers   | Node and Bun, except Bedrock's Node credential-chain profile |
| `generalist/testing` / `generalist/testing/runtime-driver` | `@effect/vitest@4.0.0-rc.112` and `vitest@4.1.11`                                           | Test host                                                    |

## Effect compatibility

| Generalist release | Tested Effect version |
| ------------------ | --------------------- |
| `0.65.1`           | `effect@4.0.0-rc.112` |

`generalist/unstable/foldkit` declares the exact tested optional peer `foldkit@0.148.2`.

## API stability

<Note title="Every export is @experimental">
While `effect/unstable/ai` remains unstable, every public Generalist export carries the `@experimental` tag: APIs can change in any 0.x release. There is one package and one version to track.
</Note>

Installed? [The offline quickstart](/start/quickstart) builds a tool-calling agent without an API key, or [Getting started](/getting-started) connects a real model.
