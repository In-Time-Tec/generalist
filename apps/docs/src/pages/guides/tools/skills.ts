import activateSkill from "virtual:source/src/snippets/guides/tools/skills/activate-skill.ts"
import activateSkillExpected from "virtual:source/src/snippets/guides/tools/skills/activate-skill.expected.txt"
import fileSystemCatalog from "virtual:source/src/snippets/guides/tools/skills/file-system-catalog.ts"
import hostedSkills from "virtual:source/src/snippets/guides/tools/skills/hosted-skills.ts"
import skillMd from "virtual:source/src/snippets/guides/tools/skills/skill.md"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../../prose"
export const skills = definePage({
  path: "/docs/guides/skills",
  title: "How to add skills",
  navTitle: "Skills",
  group: "Guides",
  description:
    "Provide a SkillCatalog, let the loop advertise skills and the activate_skill tool, and load SKILL.md directories from the filesystem.",
  content: [
    p(
      "A skill is reusable instruction material the agent loads on demand: startup context carries only its name and description, and the model calls the built-in ",
      code("activate_skill"),
      " tool to pull in a skill's full body when the task matches. Provide a ",
      code("SkillCatalog"),
      " layer and the loop handles the rest: startup advertisement, the activation tool, and lazy instruction loading.",
    ),
    h2("write-a-skill", "1. Write a SKILL.md"),
    p(
      "Skills follow the agentskills ",
      code("SKILL.md"),
      " format: a directory holding a ",
      code("SKILL.md"),
      " with YAML-style frontmatter and a Markdown body. ",
      code("name"),
      " and ",
      code("description"),
      " are required, and the name must match the directory:",
    ),
    codeBlock({ label: "release-notes/SKILL.md", language: "markdown", source: skillMd }),
    h2("provide-a-catalog", "2. Provide a catalog and watch activation"),
    p(
      "For skills defined in code, build ",
      code("SkillCatalog.Skill"),
      " values and provide ",
      code("SkillCatalog.layerSkills"),
      ". Each value directly carries its flattened name, description, flags, instructions, tools, and optional location. The loop appends the advertised skills to the system message, advertises ",
      code("activate_skill"),
      ", handles the activation call itself (it never reaches your executor), and returns ",
      code("{ name, instructions, allowedTools }"),
      " to the model as an ordinary tool result:",
    ),
    codeBlock({ label: "activate-skill.ts", source: activateSkill, expectedOutput: activateSkillExpected }),
    callout(
      "info",
      "Instructions are lazy",
      code("Skill.instructions"),
      " is an Effect evaluated only on activation, and each instruction body loads once per run. Non-activated skills cost one advertised line each.",
    ),
    h2("load-from-the-filesystem", "3. Load skill directories from the filesystem"),
    p(
      code("FileSystemCatalog.layer"),
      " from ",
      code("generalist/instructions/skills"),
      " discovers ",
      code("SKILL.md"),
      " files under your roots (defaults: ",
      code(".agents/skills"),
      ", ",
      code(".claude/skills"),
      ", ",
      code(".pi/skills"),
      "), validates each standard name against its immediate directory, and reads only frontmatter up front:",
    ),
    codeBlock({ label: "file-system-catalog.ts", source: fileSystemCatalog }),
    p(
      "Provide ",
      code("FileSystem"),
      " and ",
      code("Path"),
      " from your platform runtime. Later roots win on name collisions.",
    ),
    h2("compose-hosted-catalogs", "4. Compose hosted catalogs"),
    p(
      code("SkillCatalog.layer"),
      " composes catalogs with later catalogs winning duplicate names. Hosted adapters load one bounded manifest snapshot through Effect HTTP and fetch SHA-256-verified bodies only on activation:",
    ),
    codeBlock({ label: "hosted-skills.ts", source: hostedSkills }),
    callout(
      "warning",
      "Hosted distribution is adapter-owned",
      "The Agent Skills standard defines directory contents, not catalogs. Generalist uses its own versioned manifest; authenticate or sign requests by decorating the provided HttpClient. S3 does not list buckets, and GitHub requires an immutable commit ref.",
    ),
    h2("mind-the-budget", "5. Mind the listing budget"),
    p(
      "The loop selects listings under a fixed 2,048-token budget with ",
      code("SkillCatalog.selectListings"),
      ": skills marked ",
      code("disableModelInvocation"),
      " are excluded, and least-recently-used listings drop first when over budget. Descriptions are capped at ",
      code("descriptionLimit"),
      " (1,024 characters), matching the Agent Skills description limit, so front-load the sentence that tells the model when to activate.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Compose skills with the rest of the system message: ",
        link("/docs/guides/instructions", "How to compose instructions and instruction providers"),
        ".",
      ],
      [
        "Remember facts across runs instead of re-teaching them: ",
        link("/docs/guides/memory", "How to add memory"),
        ".",
      ],
    ),
  ],
})
