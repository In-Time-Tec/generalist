# Instructions and skills

An `Instructions` layer renders the system baseline once at each run start. A `SkillCatalog` advertises small listings, then loads a selected `SKILL.md` body and tools only through `activate_skill`.

## Usage

```ts
import { BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Agent, Instructions } from "generalist"
import { FileSystemCatalog } from "generalist/instructions/skills"
const instructions = Instructions.layer([
  Instructions.fromText("persona", "You are a code reviewer."),
  Instructions.fromText("style", "Report risks before suggestions."),
])
const skills = FileSystemCatalog.layer({ cwd: "." }).pipe(Layer.provide(BunServices.layer))
const agent = Agent.make({ name: "reviewer", instructions: "Fallback." })
const program = Agent.run(agent, "Review this change.")
// Merge these with the runtime's model, executor, approval, and middleware layers.
const featureLayers = Layer.merge(instructions, skills)
const runnable = program.pipe(Effect.provide(featureLayers))
```

## What runs

```text
Agent.run("Review this change.")
└── run setup
    ├── Instructions.render({ agentName: "reviewer", turn: 0 })
    │   ├── persona.render() -> "You are a code reviewer."
    │   └── style.render() -> "Report risks before suggestions."
    ├── SkillCatalog.all -> listing only
    │   └── "- code-review: Review code before changing it."
    └── model request #1 (tools: activate_skill)
        └── activate_skill({ name: "code-review" })
            ├── SkillCatalog.get("code-review")
            ├── read and validate the full SKILL.md body
            ├── validate the complete next tool registry
            └── model request #2 (body + skill tools available)
```

Providers run in registration order. `Option.none()` results are omitted, and the remaining strings are joined with `"\n\n"`. An explicit run `system` or explicit history takes precedence; an empty rendered baseline falls back to `Agent.instructions`.

## Data flow

```text
.agents/skills/code-review/SKILL.md
{ name: "code-review", description: "Review code before changing it.",
  body: "# Checklist\nCheck error paths." }
        │ discover: parse frontmatter only
        ▼
startup system fragment
"- code-review: Review code before changing it."
        │ activate_skill({ name: "code-review" })
        ▼
tool success
{ name: "code-review", body: "# Checklist\nCheck error paths.",
  allowedTools: ["read", "grep"] }
```

`load({ cwd })` separately discovers user instruction files. It reads configured global files first, then walks root-to-`cwd`, selecting at most one file per directory: `AGENTS.md` before `CLAUDE.md` by default. Callers may replace the filename list and global paths.

Filesystem catalogs recursively search `.agents/skills`, `.claude/skills`, and `.pi/skills` by default. HTTP, S3, and GitHub adapters instead read a version `1` Generalist manifest; this manifest is not part of the Agent Skills standard.

## Failure paths

```text
activate_skill({ name: "missing" })
└── DomainFailure { reason: "not-found" }
activate_skill({ name: "user-only" })
└── DomainFailure { reason: "not-model-invocable" }
hosted body fetch
└── size / UTF-8 / SHA-256 / frontmatter check fails
    └── SkillCatalogError (body and tools are not published)
```

## Invariants

- Every provider receives the agent name and turn, and renders once per run in registration order.
- Empty provider results add neither text nor separators; providers do not inject later dynamic updates.
- Instruction-file discovery orders global files before root-to-`cwd` files.
- Instruction-file discovery chooses the first existing configured filename in each directory.
- `Skill` directly carries metadata, lazy `instructions`, `tools`, and optional `location`; it has no nested frontmatter or listing fields.
- Skill names are 1–64 lowercase alphanumeric or single-hyphen-separated characters; descriptions are 1–1,024 characters.
- Discovery and startup listing do not read skill instruction bodies.
- Skills with `disableModelInvocation: true` remain addressable but are not advertised or model-activatable.
- Startup listings contain selected names and descriptions within a 2,048-token budget.
- Filesystem frontmatter names must match their containing directory; nested `SKILL.md` files are valid.
- Later filesystem roots and later composed catalogs win duplicate names.
- Activation validates the complete next tool set before publishing the body and tools; new tools are available only on the following model request.
- Without a `SkillCatalog`, or with no selected listings, the loop advertises neither skills nor `activate_skill`.
- Hosted manifests and bodies have bounded sizes; paths are safe, beneath the manifest directory, and same-origin.
- Hosted bodies must match their manifest SHA-256 and frontmatter; GitHub catalogs require an immutable commit ID.

## Related

- Source: `packages/generalist/src/instructions/providers.ts`, `packages/generalist/src/instructions/files.ts`, `packages/generalist/src/instructions/skills/`, `packages/generalist/src/core/context/skill-catalog.ts`, `packages/generalist/src/core/agent/skill-tool.ts`
- Site: `/docs/guides/instructions`, `/docs/guides/skills`, `/docs/reference/skills`
- Feature: [Instruction guidance](instruction-guidance.md)
