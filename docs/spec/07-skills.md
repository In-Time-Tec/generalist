# 07 — Skills

Baton skills follow the agentskills.io `SKILL.md` directory format: a skill is a directory containing a `SKILL.md` file with YAML-style frontmatter and a Markdown body. Baton models skills as pure context and tool assembly. Filesystem discovery lives outside core in `@batonfx/skills`.

## Scope

Baton owns:

- the core `SkillSource` seam;
- listing selection for progressive disclosure;
- loop integration for startup listing injection and `activate_skill` body loading;
- a filesystem-backed source package, `@batonfx/skills`;
- an instruction-file loader for `AGENTS.md` / `CLAUDE.md` files.

Baton does not own hosted skill distribution, durable skill registries, shell templating, or context-fork subagent execution in this milestone.

## Core seam

`@batonfx/core` exports `SkillSource` from `packages/core/src/skill-source.ts`. Core depends only on `effect`; it never reads the filesystem.

A `Skill` contains parsed frontmatter, a startup `listing`, a lazy `body` effect, and optional contributed `Ai.Tool` values. `SkillSource.all` returns discovered skills, and `SkillSource.get(name)` resolves one skill by name. `fromSkills`, `empty`, and `testLayer` provide memory/test layers.

Frontmatter fields are:

- `name`
- `description`
- `whenToUse`
- `allowedTools`
- `disableModelInvocation`
- `userInvocable`
- `contextFork`
- `agent`
- `model`
- `paths`

Only `description` is required by the filesystem loader. `name` defaults to the skill directory name after namespacing.

## Progressive disclosure

Startup context contains only selected listings: `- name: capped description`. The description cap is `DESCRIPTION_CAP = 1536` characters. `selectListings(skills, budgetTokens, recentlyUsed)` estimates listing cost with a stable approximation, excludes `disableModelInvocation` skills, and drops least-recently-used skills first when over budget while preserving source order among selected skills.

When `SkillSource` is present, `Agent.stream` appends selected listings to the system baseline and advertises the built-in `activate_skill` tool. The model activates a listed skill by calling `activate_skill` with `{ name }`. Baton handles that call through `SkillSource.get(name)`, evaluates the selected `Skill.body`, adds contributed `Skill.tools` to the active toolkit, and returns a normal successful tool result containing `{ name, body, allowedTools }`. Non-activated skill bodies are not read.

The Markdown body is loaded only by evaluating `Skill.body`. Supporting files are not loaded automatically in v1; consumers can expose read tools or package-specific loaders later.

## Filesystem loader

`@batonfx/skills` provides `SkillLoader.layer(options)` over `effect`'s `FileSystem` and `Path` services.

Default roots are searched in order relative to `cwd`:

1. `.agents/skills`
2. `.claude/skills`
3. `.pi/skills`

Missing roots are skipped. Later roots win name collisions. Nested skills are namespaced by relative directory path with `:` separators, for example `frontend/lint/SKILL.md` defaults to `frontend:lint`.

The parser supports a small flat frontmatter subset: scalar strings, booleans, inline string arrays, and block string arrays. Unknown keys are ignored. It deliberately does not support nested YAML, multiline scalars, anchors, tags, arbitrary expressions, or a heavy YAML dependency.

Discovery reads only enough text to parse frontmatter. The full `SKILL.md` body is read lazily through `Skill.body`.

## Instruction files

`@batonfx/skills` also exports `InstructionFiles.loadInstructionFiles(options)`.

Default filenames are `AGENTS.md` then `CLAUDE.md`. For each directory, the first existing filename wins, so `AGENTS.md` overrides `CLAUDE.md`. Ancestors are returned in root-to-cwd order so nearest-cwd instructions are last and highest priority. Explicit `globalFiles` are returned before ancestor files. File contents are returned verbatim for consumers to pass to the `Instructions` registry.

## Integration

Consumers provide `SkillSource` as an optional Effect service. Local filesystem discovery and Relay's durable pinned-snapshot registry both adapt to the same `SkillSource.Interface`, so the loop activation path is identical for standalone Baton and durable hosts. `contextFork`, `agent`, and `model` are parsed metadata only until multi-agent support lands.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/03-instructions-and-context-epoch.md`
- `docs/spec/decisions/ADR-0010-adopt-agentskills-standard.md`
