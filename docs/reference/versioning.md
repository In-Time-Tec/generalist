---
title: "Versioning and releases"
description: "The 0.61.0 package, experimental policy, Effect compatibility, and release train."
---

Generalist publishes to npm as one package; every adapter is a subpath export at the same version.

## Published package

| Package      | Version  | Subpath exports                                                                                                                                                                                                                                                                                                          |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generalist` | `0.61.0` | 67 explicit subpath exports for Core, Runtime, exact AI leaves, MCP, memory, instructions and skills, test hosts, transport, integrations, and the `./pg`, `./mysql`, `./unstable/cloudflare/workers`, `./unstable/cloudflare/durable-objects`, `./unstable/cloudflare/dynamic-workers`, and `./unstable/rivet` adapters |

## The @experimental policy

Every public export remains `@experimental` while `effect/unstable/ai` is unstable. APIs may change in any 0.x release.

## Effect compatibility

| Generalist | effect         | Notes                                               |
| ---------- | -------------- | --------------------------------------------------- |
| `0.61.0`   | `4.0.0-rc.112` | The exact peer and tested workspace catalog version |

## The release train

Every release builds and publishes from one committed version:

`generalist`

The tag workflow builds once, verifies the unchanged tarball in clean minimum-dependency consumers, emits checksums and release evidence, attaches those three assets to GitHub, and publishes the exact tarball to npm. A manual run only reconciles an existing immutable tag and commit.

For install commands and adapter peers, see [Installation](/start/installation).
