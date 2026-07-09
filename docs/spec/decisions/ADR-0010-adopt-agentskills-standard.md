# ADR-0010 — Adopt the agentskills.io Skill Format

## Status

Accepted.

## Context

Modern agent harnesses converge on directory-local `SKILL.md` files with frontmatter plus Markdown bodies. Baton needs the same interoperability while keeping core free of filesystem and durable-runtime dependencies.

## Decision

Adopt the agentskills.io `SKILL.md` format rather than inventing a Baton-specific format. Model skill discovery in core as a pure `SkillSource` seam, and put filesystem loading in `@batonfx/skills` using Effect platform services exported by `effect`.

Use `docs/spec/07-skills.md` and ADR-0010 because earlier issues already allocated spec documents 05/06 and ADR-0008/0009.

## Consequences

- `@batonfx/core` remains `effect`-only and filesystem-free.
- `@batonfx/skills` owns `SKILL.md` and instruction-file discovery.
- The parser supports the flat frontmatter subset Baton needs without a YAML dependency.
- The required standard fields and constraints are enforced: `name`, directory-name equality, description length, and space-separated `allowed-tools`. Additional parsed metadata is labeled as a Baton/host compatibility extension.
- Activation uses Baton's built-in `activate_skill` tool over `SkillSource.Interface`; context forks, shell templating, and hosted skill distribution are deferred.
