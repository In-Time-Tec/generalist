import instructionProviders from "virtual:source/src/snippets/guides/agent/instructions/instruction-providers.ts"
import instructionProvidersExpected from "virtual:source/src/snippets/guides/agent/instructions/instruction-providers.expected.txt"
import instructionFiles from "virtual:source/src/snippets/guides/agent/instructions/instruction-files.ts"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../../prose"
export const instructions = definePage({
  path: "/docs/guides/instructions",
  title: "How to compose instructions and instruction providers",
  navTitle: "Instructions",
  group: "Guides",
  description: "Register ordered instruction providers with Instructions.layer and load AGENTS.md files as providers.",
  content: [
    p(
      "The ",
      code("Instructions"),
      " service replaces a single instruction string with an ordered registry of ",
      code("Provider"),
      " values. At run start the loop renders instruction providers once into the system message. Persona, house style, and repository files compose as providers instead of string concatenation.",
    ),
    h2("register-providers", "1. Register ordered providers"),
    p(
      "Build baselines with ",
      code("Instructions.fromText(id, text)"),
      ". Provide them in order with ",
      code("Instructions.layer"),
      ". When the registry produces a non-empty baseline, it replaces ",
      code("agent.instructions"),
      ", and rendered fragments join with one blank line:",
    ),
    codeBlock({
      label: "instruction-providers.ts",
      source: instructionProviders,
      expectedOutput: instructionProvidersExpected,
    }),
    callout(
      "info",
      "Precedence",
      "An explicit ",
      code("RunOptions.system"),
      " wins over the registry, and a ",
      code("RunOptions.history"),
      " transcript is used verbatim. Both skip provider rendering entirely.",
    ),
    h2("baseline-contract", "2. Keep Agent instructions in the baseline"),
    p(
      "Every provider renders once at run start into the stable system-message baseline. This makes model-provider prompt caching effective. A provider returning ",
      code("Option.none()"),
      " contributes nothing. Use ",
      code("fromText"),
      ", provide it through ",
      code("Instructions.layer"),
      ", and let Agent render the providers. Policy instruction overrides are independent: they prepend a system message once to the selected follow-up prompt, and that message remains in chat history.",
    ),
    h2("load-instruction-files", "3. Load AGENTS.md files as providers"),
    p(
      code("load"),
      " from ",
      code("tenetkit/instructions"),
      " walks ancestor directories for ",
      code("AGENTS.md"),
      " or ",
      code("CLAUDE.md"),
      " (root first, nearest last), plus any ",
      code("globalFiles"),
      " you list. Map the results into text providers:",
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
