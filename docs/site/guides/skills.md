# Skills

`@batonfx/skills` loads agentskills-compatible `SKILL.md` files and instruction files without adding filesystem dependencies to core. Core owns the `SkillSource` seam; the package owns discovery.

Startup context should include selected listings only. Skill bodies are lazy and load only when the host activates a skill. This gives progressive disclosure without inventing a second prompt format.

The capstone includes a fixture skill at [`../../../examples/capstone-local-assistant/fixtures/.agents/skills/research/SKILL.md`](../../../examples/capstone-local-assistant/fixtures/.agents/skills/research/SKILL.md).
