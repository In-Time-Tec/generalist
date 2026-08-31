# Instructions and skills

`generalist/instructions` is the instructions family: system instructions from ordered providers, user instruction files, the versioned guidance engine, and skills as lazy instructions.

System instructions are ordered instruction providers rendered once into the run's system-message baseline. Generalist does not inject dynamic instruction updates. `load` discovers AGENTS.md / CLAUDE.md user instruction files from global and ancestor paths. The versioned guidance engine (entries, refinements, rollback, snapshots) lives in the same module; see [instruction-guidance.md](instruction-guidance.md).

Skills are lazy instructions. `SkillCatalog` follows the Agent Skills `SKILL.md` format. Its `Skill` values directly carry flattened name, description, flags, lazy instructions, tools, and optional location; there are no nested frontmatter or listing fields. Startup context advertises selected names and descriptions; instructions load only through `activate_skill`. Filesystem and hosted manifest adapters live in `generalist/instructions/skills`. Hosted HTTP, S3, and GitHub manifests are Generalist integration formats, not part of the Agent Skills standard.

Skill activation validates the complete next tool set before publishing it. Without `SkillCatalog`, the loop advertises neither skills nor the activation tool.
