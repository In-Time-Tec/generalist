import { callout, code, codeBlock, definePage, h2, lead, link, p, table } from "../../prose"
const bunInstall = `bun add effect@4.0.0-rc.109 tenetkit@0.14.0 tenetkit/ai@0.14.0`

const otherManagers = `npm install effect@4.0.0-rc.109 tenetkit@0.14.0 tenetkit/ai@0.14.0
pnpm add effect@4.0.0-rc.109 tenetkit@0.14.0 tenetkit/ai@0.14.0`

export const installation = definePage({
  path: "/docs/start/installation",
  title: "Installation",
  navTitle: "Installation",
  group: "Start",
  description: "Install tenetkit and tenetkit/ai with the pinned Effect beta, plus the eleven-package matrix.",
  content: [
    lead(
      "TenetKit ships a coordinated package train. Most projects start with the core loop and provider helpers, then add focused packages such as the deterministic test kit.",
    ),
    codeBlock({ label: "Terminal", language: "bash", source: bunInstall }),
    p("With npm or pnpm:"),
    codeBlock({ label: "Terminal", language: "bash", source: otherManagers }),
    callout(
      "warning",
      "Pin the Effect beta",
      "TenetKit 0.14.x is built and tested against ",
      code("effect@4.0.0-rc.109"),
      ". The ",
      code("effect/unstable/ai"),
      " modules TenetKit reuses change between betas, so install the pinned version rather than a floating range. That churn is TenetKit's problem, not yours: each release tracks one tested Effect version, and the release train absorbs upstream breaking changes before you see them.",
    ),
    h2("package-matrix", "Package matrix"),
    p("Add the packages your application composes; each one is installable on its own."),
    table(
      ["Package", "Version", "What it provides"],
      [
        [
          [code("tenetkit")],
          "0.14.0",
          "The agent loop: events, typed suspension, turn policy, tools, approvals, permissions, steering, compaction",
        ],
        [
          [code("tenetkit/ai")],
          "0.14.0",
          "Model registration for OpenAI, Anthropic, OpenRouter, and OpenAI-compatible APIs, plus the deterministic local model",
        ],
        [[code("tenetkit/runtime")], "0.14.0", "Addressable runs, replay, inspection, waits, and stores"],
        [[code("tenetkit/mcp")], "0.14.0", "MCP discovery and the TenetKit ToolExecutor adapter"],
        [[code("tenetkit/skills")], "0.14.0", "SKILL.md and instruction-file sources"],
        [[code("tenetkit/memory")], "0.14.0", "Working memory, vector store, semantic recall"],
        [[code("tenetkit/test")], "0.14.0", "Scripted model fixtures and normalized request capture"],
        [
          [code("tenetkit/transport")],
          "0.14.0",
          "Runtime wire codecs, snapshots, SSE and WebSocket serving, client adapters",
        ],
        [[code("tenetkit/foldkit")], "0.14.0", "FoldKit connection service and headless chat model"],
        [[code("tenetkit/a2a")], "0.14.0", "A2A v1 server projection over Runtime"],
        [[code("tenetkit/ag-ui")], "0.14.0", "AG-UI event projection over Runtime"],
      ],
    ),
    h2("effect-compatibility", "Effect compatibility"),
    table(["TenetKit release", "Tested Effect version"], [[[code("0.14.x")], [code("effect@4.0.0-rc.109")]]]),
    p(
      code("tenetkit/foldkit"),
      " additionally declares peer ranges ",
      code("effect >=4.0.0-beta.88 <4.0.1"),
      " and ",
      code("foldkit >=0.122.0 <1"),
      ".",
    ),
    h2("api-stability", "API stability"),
    callout(
      "info",
      "Every export is @experimental",
      "While ",
      code("effect/unstable/ai"),
      " remains unstable, every public TenetKit export carries the ",
      code("@experimental"),
      " tag: APIs can change in any 0.x release. The eleven packages release in lockstep, so keep them on the same version.",
    ),
    p(
      "Installed? ",
      link("/docs/start/quickstart", "The quickstart"),
      " builds a tool-calling agent and a CI eval with no API key.",
    ),
  ],
})
