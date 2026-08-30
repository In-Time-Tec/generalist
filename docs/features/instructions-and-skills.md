# Instructions and skills

Instructions are ordered instruction providers rendered once into the run's system-message baseline. TenetKit does not inject dynamic instruction updates.

`SkillCatalog` follows the Agent Skills `SKILL.md` format. Its `Skill` values directly carry flattened name, description, flags, lazy instructions, tools, and optional location; there are no nested frontmatter or listing fields. Startup context advertises selected names and descriptions; instructions load only through `activate_skill`. Filesystem and hosted manifest adapters live in `tenetkit/skills`. Hosted HTTP, S3, and GitHub manifests are TenetKit integration formats, not part of the Agent Skills standard.

Skill activation validates the complete next tool set before publishing it. Without `SkillCatalog`, the loop advertises neither skills nor the activation tool.
