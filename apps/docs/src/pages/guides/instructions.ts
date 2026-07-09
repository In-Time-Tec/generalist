import contextSources from "../../snippets/guides/instructions/context-sources.ts?raw"
import contextSourcesExpected from "../../snippets/guides/instructions/context-sources.expected.txt?raw"
import instructionFiles from "../../snippets/guides/instructions/instruction-files.ts?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../prose"
export const instructions = definePage({
  path: "/docs/guides/instructions",
  title: "How to compose instructions and context sources",
  navTitle: "Instructions",
  group: "Guides",
  description:
    "Register ordered ContextSources with Instructions.layer, mix static baselines with dynamic sources, and load AGENTS.md files as sources.",
  content: [
    p(
      "The ",
      code("Instructions"),
      " service replaces a single instruction string with an ordered registry of ",
      code("ContextSource"),
      " values. At run start the loop opens a context epoch: baseline sources render once into the system message, dynamic sources are frozen for later update rendering. Persona, house style, repository files, and host state compose as sources instead of string concatenation.",
    ),
    h2("register-sources", "1. Register ordered sources"),
    p(
      "Build baselines with ",
      code("Instructions.staticSource(id, text)"),
      " and write dynamic sources as plain objects with ",
      code('cache: "dynamic"'),
      ". Provide them in order with ",
      code("Instructions.layer"),
      ". When the registry produces a non-empty baseline, it replaces ",
      code("agent.instructions"),
      ", and rendered fragments join with one blank line:",
    ),
    codeBlock({ label: "context-sources.ts", source: contextSources, expectedOutput: contextSourcesExpected }),
    callout(
      "info",
      "Precedence",
      "An explicit ",
      code("RunOptions.system"),
      " wins over the registry, and a ",
      code("RunOptions.history"),
      " transcript is used verbatim. Both skip epoch rendering entirely.",
    ),
    h2("baseline-vs-dynamic", "2. Choose baseline or dynamic per source"),
    table(
      ["Cache class", "Rendered", "Use for"],
      [
        [
          [code('"baseline"')],
          ["Once, at run start, into the system message"],
          ["Persona, style rules, repository instructions"],
        ],
        [
          [code('"dynamic"')],
          ["On demand via ", code("Instructions.renderUpdate"), " for incremental context updates"],
          ["Workspace state, clocks, anything that changes mid-session"],
        ],
      ],
    ),
    p(
      "Keeping the baseline stable is what makes provider prompt caching effective; dynamic text stays out of it by construction. A source returning ",
      code("Option.none()"),
      " contributes nothing.",
    ),
    h2("load-instruction-files", "3. Load AGENTS.md files as sources"),
    p(
      code("InstructionFiles.loadInstructionFiles"),
      " from ",
      code("@batonfx/skills"),
      " walks ancestor directories for ",
      code("AGENTS.md"),
      " or ",
      code("CLAUDE.md"),
      " (root first, nearest last), plus any ",
      code("globalFiles"),
      " you list. Map the results into static sources:",
    ),
    codeBlock({ label: "instruction-files.ts", source: instructionFiles }),
    p(
      "The effect requires ",
      code("FileSystem"),
      " and ",
      code("Path"),
      "; provide them from your platform runtime. Core never reads the filesystem itself.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Add lazily-loaded skills next to the baseline listing: ",
        link("/docs/guides/skills", "How to add skills"),
        ".",
      ],
      [
        "See how epochs interact with summarized history: ",
        link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
    ),
  ],
})
