import contextSources from "../../snippets/guides/instructions/context-sources.ts?raw"
import contextSourcesExpected from "../../snippets/guides/instructions/context-sources.expected.txt?raw"
import instructionFiles from "../../snippets/guides/instructions/instruction-files.ts?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const instructions = definePage({
  path: "/docs/guides/instructions",
  title: "How to compose instructions and context sources",
  navTitle: "Instructions",
  group: "Guides",
  description: "Register ordered baseline ContextSources with Instructions.layer and load AGENTS.md files as sources.",
  content: [
    p(
      "The ",
      code("Instructions"),
      " service replaces a single instruction string with an ordered registry of ",
      code("ContextSource"),
      " values. At run start the loop opens a context epoch and baseline sources render once into the system message. Persona, house style, and repository files compose as sources instead of string concatenation.",
    ),
    h2("register-sources", "1. Register ordered sources"),
    p(
      "Build baselines with ",
      code("Instructions.staticSource(id, text)"),
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
    h2("baseline-contract", "2. Keep Agent instructions in the baseline"),
    p(
      "Every source renders once at run start into the stable system-message baseline. This makes provider prompt caching effective. A source returning ",
      code("Option.none()"),
      " contributes nothing. Use ",
      code("staticSource"),
      ", provide it through ",
      code("Instructions.layer"),
      ", and let Agent open the epoch. TurnPolicy instruction overrides are independent: they prepend a system message once to the selected follow-up prompt, and that message remains in chat history.",
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
