---
title: "generalist/instructions/skills"
description: "Filesystem and manifest-backed HTTP, S3, and GitHub SKILL.md catalogs plus AGENTS.md/CLAUDE.md loading."
---

generalist/instructions/skills implements the core SkillCatalog seam through filesystem and manifest-backed HTTP, S3, and GitHub adapters. generalist/instructions loads AGENTS.md/CLAUDE.md instruction files.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

`generalist/instructions/skills` and `generalist/instructions` are import subpaths, not packages.

## Exports map

| Subpath                   | Contents                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `.`                       | Namespaces `FileSystemCatalog`, `HttpCatalog`, `S3Catalog`, `GitHubCatalog` |
| `generalist/instructions` | `File`, `Options`, and `load`                                               |

## FileSystemCatalog.layer

`FileSystemCatalog.layer({ cwd, ...options })` builds a `SkillCatalog.SkillCatalog` layer requiring `FileSystem` and `Path`, failing with `SkillCatalogError`. Roots are scanned in order; later roots override earlier ones by skill name.

| Option                | Default                                              | Notes                                               |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `roots`               | `[".agents/skills", ".claude/skills", ".pi/skills"]` | Absolute or resolved against cwd                    |
| `cwd`                 | `"."`                                                | Base directory for relative roots                   |
| `frontmatterMaxBytes` | `65536`                                              | Bytes read when parsing only the frontmatter header |

Discovery finds every `SKILL.md` under each root recursively. The required frontmatter name must match the immediate directory: a file at `web/search/SKILL.md` declares `name: search`. Bodies load lazily; listing skills reads only headers.

## Hosted catalogs

`HttpCatalog.make`, `S3Catalog.make`, and `GitHubCatalog.make` return composable `SkillCatalog.Service` effects over the ambient Effect `HttpClient` and `Crypto`. Their matching `layer` constructors provide one catalog directly. Shared hosted construction remains internal; custom transport policy is supplied through the ambient HttpClient.

| Provider        | Contract                                                             |
| --------------- | -------------------------------------------------------------------- |
| `HttpCatalog`   | Same-origin paths relative to one versioned Generalist manifest URL  |
| `S3Catalog`     | Virtual-hosted HTTPS manifest object; caller HttpClient owns signing |
| `GitHubCatalog` | GitHub Contents API raw reads pinned to a 40/64-hex commit id        |

The manifest carries complete listing frontmatter, a safe relative `skillPath`, and the lowercase SHA-256 of the full `SKILL.md`. Metadata loads at catalog construction; bodies stay lazy and are verified on activation. The manifest is a Generalist adapter contract, not part of the Agent Skills standard.

## The SKILL.md contract

A document is YAML-like frontmatter between `---` fences followed by the Markdown body. `name` and `description` are required; keys are matched ignoring case, hyphens, and underscores.

| Key                        | Type         | Notes                                            |
| -------------------------- | ------------ | ------------------------------------------------ |
| `name`                     | string       | Required standard name; must match the directory |
| `description`              | string       | Required standard description; 1-1024 characters |
| `when-to-use`              | string       | Optional usage hint                              |
| `allowed-tools`            | string       | Standard space-separated tool names              |
| `disable-model-invocation` | boolean      | Excluded from model-facing listings when true    |
| `user-invocable`           | boolean      | Optional flag                                    |
| `context-fork`             | boolean      | Optional flag                                    |
| `agent`                    | string       | Optional agent name                              |
| `model`                    | string       | Optional model hint                              |
| `paths`                    | string array | Optional related paths                           |

## Instruction files

`load(options?) from "generalist/instructions"` returns `ReadonlyArray<InstructionFile>` (`{ path, content }`), requiring `FileSystem` and `Path`. It reads `globalFiles` first, then walks from the filesystem root down to `cwd`, taking the first matching filename per directory.

| Option        | Default                      |
| ------------- | ---------------------------- |
| `filenames`   | `["AGENTS.md", "CLAUDE.md"]` |
| `cwd`         | `"."`                        |
| `globalFiles` | `[]`                         |

See [How to add skills](/guides/skills) and [How to compose instructions and instruction providers](/guides/instructions).
