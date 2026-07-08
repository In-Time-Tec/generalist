import activateSkill from "../../snippets/guides/skills/activate-skill.ts?raw"
import activateSkillExpected from "../../snippets/guides/skills/activate-skill.expected.txt?raw"
import skillLoader from "../../snippets/guides/skills/skill-loader.ts?raw"
import skillMd from "../../snippets/guides/skills/SKILL.md?raw"
import * as Prose from "../../prose"

export const skills = Prose.definePage({
  path: "/docs/guides/skills",
  title: "How to add skills",
  navTitle: "Skills",
  group: "Guides",
  description:
    "Provide a SkillSource, let the loop advertise listings and the activate_skill tool, and load SKILL.md directories from the filesystem.",
  content: [
    Prose.p(
      "A skill is reusable instruction material the agent loads on demand: startup context carries only one-line listings, and the model calls the built-in ",
      Prose.code("activate_skill"),
      " tool to pull in a skill's full body when the task matches. Provide a ",
      Prose.code("SkillSource"),
      " layer and the loop handles the rest — listing injection, the activation tool, and lazy body loading.",
    ),
    Prose.h2("write-a-skill", "1. Write a SKILL.md"),
    Prose.p(
      "Skills follow the agentskills ",
      Prose.code("SKILL.md"),
      " format: a directory holding a ",
      Prose.code("SKILL.md"),
      " with YAML-style frontmatter and a Markdown body. Only ",
      Prose.code("description"),
      " is required; ",
      Prose.code("name"),
      " defaults to the directory name:",
    ),
    Prose.codeBlock({ label: "release-notes/SKILL.md", language: "markdown", source: skillMd }),
    Prose.h2("provide-a-source", "2. Provide a source and watch activation"),
    Prose.p(
      "For skills defined in code, build ",
      Prose.code("SkillSource.Skill"),
      " values and provide ",
      Prose.code("SkillSource.fromSkills"),
      ". The loop appends the listings to the system message, advertises ",
      Prose.code("activate_skill"),
      ", handles the activation call itself — it never reaches your executor — and returns ",
      Prose.code("{ name, body, allowedTools }"),
      " to the model as an ordinary tool result:",
    ),
    Prose.codeBlock({ label: "activate-skill.ts", source: activateSkill, expectedOutput: activateSkillExpected }),
    Prose.callout(
      "info",
      "Bodies are lazy",
      Prose.code("Skill.body"),
      " is an Effect evaluated only on activation, and each body loads once per run. Non-activated skills cost one listing line each.",
    ),
    Prose.h2("load-from-the-filesystem", "3. Load skill directories from the filesystem"),
    Prose.p(
      Prose.code("SkillLoader.layer"),
      " from ",
      Prose.code("@batonfx/skills"),
      " discovers ",
      Prose.code("SKILL.md"),
      " files under your roots (defaults: ",
      Prose.code(".agents/skills"),
      ", ",
      Prose.code(".claude/skills"),
      ", ",
      Prose.code(".pi/skills"),
      "), namespaces nested directories as ",
      Prose.code("parent:child"),
      ", and reads only frontmatter up front:",
    ),
    Prose.codeBlock({ label: "skill-loader.ts", source: skillLoader }),
    Prose.p(
      "Provide ",
      Prose.code("FileSystem"),
      " and ",
      Prose.code("Path"),
      " from your platform runtime. Later roots win on name collisions.",
    ),
    Prose.h2("mind-the-budget", "4. Mind the listing budget"),
    Prose.p(
      "The loop selects listings under a fixed 2,048-token budget with ",
      Prose.code("SkillSource.selectListings"),
      ": skills marked ",
      Prose.code("disableModelInvocation"),
      " are excluded, and least-recently-used listings drop first when over budget. Descriptions are capped at ",
      Prose.code("DESCRIPTION_CAP"),
      " (1,536 characters) — front-load the sentence that tells the model when to activate.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Compose skills with the rest of the system message — ",
        Prose.link("/docs/guides/instructions", "How to compose instructions and context sources"),
        ".",
      ],
      [
        "Remember facts across runs instead of re-teaching them — ",
        Prose.link("/docs/guides/memory", "How to add memory"),
        ".",
      ],
    ),
  ],
})
