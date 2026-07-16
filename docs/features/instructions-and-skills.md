# Instructions and skills

Instructions are ordered context sources rendered once into the run's system-message baseline. Baton does not inject dynamic instruction updates.

`SkillSource` follows the Agent Skills `SKILL.md` format. Startup context advertises selected listings; bodies load only through `activate_skill`. Filesystem and hosted manifest adapters live in `@batonfx/skills`. Hosted HTTP, S3, and GitHub manifests are Baton integration formats, not part of the Agent Skills standard.

Skill activation validates the complete next tool set before publishing it. Without `SkillSource`, the loop advertises neither skills nor the activation tool.
