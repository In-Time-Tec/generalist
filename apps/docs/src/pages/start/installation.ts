import * as Prose from "../../prose"

const bunInstall = `bun add effect@4.0.0-beta.93 @batonfx/core @batonfx/providers`

const otherManagers = `npm install effect@4.0.0-beta.93 @batonfx/core @batonfx/providers
pnpm add effect@4.0.0-beta.93 @batonfx/core @batonfx/providers`

export const installation = Prose.definePage({
  path: "/docs/start/installation",
  title: "Installation",
  navTitle: "Installation",
  group: "Start",
  description:
    "Install @batonfx/core and @batonfx/providers with the pinned Effect beta, plus the package matrix for all seven published packages at 0.1.1.",
  content: [
    Prose.lead(
      "Batonfx ships as seven packages on npm, all at 0.1.1. Most projects start with the core loop and the provider helpers.",
    ),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: bunInstall }),
    Prose.p("With npm or pnpm:"),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: otherManagers }),
    Prose.callout(
      "warning",
      "Pin the Effect beta",
      "Batonfx 0.1.x is built and tested against ",
      Prose.code("effect@4.0.0-beta.93"),
      ". The ",
      Prose.code("effect/unstable/ai"),
      " modules Batonfx reuses change between betas, so install the pinned version rather than a floating range.",
    ),
    Prose.h2("package-matrix", "Package matrix"),
    Prose.p("Add the packages your application composes; each one is installable on its own."),
    Prose.table(
      ["Package", "Version", "What it provides"],
      [
        [
          [Prose.code("@batonfx/core")],
          "0.1.1",
          "The agent loop: events, typed suspension, turn policy, tools, approvals, permissions, steering, compaction",
        ],
        [
          [Prose.code("@batonfx/providers")],
          "0.1.1",
          "Model registration for OpenAI, Anthropic, OpenRouter, and OpenAI-compatible APIs, plus the deterministic local model",
        ],
        [[Prose.code("@batonfx/mcp")], "0.1.1", "MCP discovery and the Baton ToolExecutor adapter"],
        [[Prose.code("@batonfx/skills")], "0.1.1", "SKILL.md and instruction-file sources"],
        [[Prose.code("@batonfx/memory")], "0.1.1", "Working memory, vector store, semantic recall"],
        [
          [Prose.code("@batonfx/transport")],
          "0.1.1",
          "Wire frames, in-memory session registry, SSE and WebSocket serving, client adapters",
        ],
        [[Prose.code("@batonfx/foldkit")], "0.1.1", "FoldKit connection service and headless chat model"],
      ],
    ),
    Prose.h2("effect-compatibility", "Effect compatibility"),
    Prose.table(
      ["Batonfx release", "Tested Effect version"],
      [[[Prose.code("0.1.x")], [Prose.code("effect@4.0.0-beta.93")]]],
    ),
    Prose.p(
      Prose.code("@batonfx/foldkit"),
      " additionally declares peer ranges ",
      Prose.code("effect >=4.0.0-beta.88 <4.0.1"),
      " and ",
      Prose.code("foldkit >=0.122.0 <1"),
      ".",
    ),
    Prose.h2("api-stability", "API stability"),
    Prose.callout(
      "info",
      "Every export is @experimental",
      "While ",
      Prose.code("effect/unstable/ai"),
      " remains unstable, every public Batonfx export carries the ",
      Prose.code("@experimental"),
      " tag: APIs can change in any 0.x release. The seven packages release in lockstep, so keep them on the same version.",
    ),
    Prose.p(
      "Installed? ",
      Prose.link("/docs/start/quickstart", "The quickstart"),
      " builds a tool-calling agent and a CI eval with no API key.",
    ),
  ],
})
