import contextSources from "../../snippets/guides/instructions/context-sources.ts?raw"
import contextSourcesExpected from "../../snippets/guides/instructions/context-sources.expected.txt?raw"
import instructionFiles from "../../snippets/guides/instructions/instruction-files.ts?raw"
import * as Prose from "../../prose"

export const instructions = Prose.definePage({
  path: "/docs/guides/instructions",
  title: "How to compose instructions and context sources",
  navTitle: "Instructions",
  group: "Guides",
  description:
    "Register ordered ContextSources with Instructions.layer, mix static baselines with dynamic sources, and load AGENTS.md files as sources.",
  content: [
    Prose.p(
      "The ",
      Prose.code("Instructions"),
      " service replaces a single instruction string with an ordered registry of ",
      Prose.code("ContextSource"),
      " values. At run start the loop opens a context epoch: baseline sources render once into the system message, dynamic sources are frozen for later update rendering. Persona, house style, repository files, and host state compose as sources instead of string concatenation.",
    ),
    Prose.h2("register-sources", "1. Register ordered sources"),
    Prose.p(
      "Build baselines with ",
      Prose.code("Instructions.staticSource(id, text)"),
      " and write dynamic sources as plain objects with ",
      Prose.code('cache: "dynamic"'),
      ". Provide them in order with ",
      Prose.code("Instructions.layer"),
      ". When the registry produces a non-empty baseline, it replaces ",
      Prose.code("agent.instructions"),
      ", and rendered fragments join with one blank line:",
    ),
    Prose.codeBlock({ label: "context-sources.ts", source: contextSources, expectedOutput: contextSourcesExpected }),
    Prose.callout(
      "info",
      "Precedence",
      "An explicit ",
      Prose.code("RunOptions.system"),
      " wins over the registry, and a ",
      Prose.code("RunOptions.history"),
      " transcript is used verbatim. Both skip epoch rendering entirely.",
    ),
    Prose.h2("baseline-vs-dynamic", "2. Choose baseline or dynamic per source"),
    Prose.table(
      ["Cache class", "Rendered", "Use for"],
      [
        [
          [Prose.code('"baseline"')],
          ["Once, at run start, into the system message"],
          ["Persona, style rules, repository instructions"],
        ],
        [
          [Prose.code('"dynamic"')],
          ["On demand via ", Prose.code("Instructions.renderUpdate"), " for incremental context updates"],
          ["Workspace state, clocks, anything that changes mid-session"],
        ],
      ],
    ),
    Prose.p(
      "Keeping the baseline stable is what makes provider prompt caching effective; dynamic text stays out of it by construction. A source returning ",
      Prose.code("Option.none()"),
      " contributes nothing.",
    ),
    Prose.h2("load-instruction-files", "3. Load AGENTS.md files as sources"),
    Prose.p(
      Prose.code("InstructionFiles.loadInstructionFiles"),
      " from ",
      Prose.code("@batonfx/skills"),
      " walks ancestor directories for ",
      Prose.code("AGENTS.md"),
      " or ",
      Prose.code("CLAUDE.md"),
      " (root first, nearest last), plus any ",
      Prose.code("globalFiles"),
      " you list. Map the results into static sources:",
    ),
    Prose.codeBlock({ label: "instruction-files.ts", source: instructionFiles }),
    Prose.p(
      "The effect requires ",
      Prose.code("FileSystem"),
      " and ",
      Prose.code("Path"),
      "; provide them from your platform runtime. Core never reads the filesystem itself.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Add lazily-loaded skills next to the baseline listing: ",
        Prose.link("/docs/guides/skills", "How to add skills"),
        ".",
      ],
      [
        "See how epochs interact with summarized history: ",
        Prose.link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
    ),
  ],
})
