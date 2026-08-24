import { callout, code, codeBlock, definePage, h2, lead, link, p, table } from "../../prose"
const bunInstall = `bun add effect@4.0.0-rc.111 tenetkit@0.38.0`

const otherManagers = `npm install effect@4.0.0-rc.111 tenetkit@0.38.0
pnpm add effect@4.0.0-rc.111 tenetkit@0.38.0`

export const installation = definePage({
  path: "/docs/start/installation",
  title: "Installation",
  navTitle: "Installation",
  group: "Start",
  description: "Install the TenetKit 0.38 release train with its exact Effect release candidate.",
  content: [
    lead(
      "TenetKit ships a coordinated package train. Most projects start with the core loop and provider helpers, then add focused packages such as the deterministic test kit.",
    ),
    codeBlock({ label: "Terminal", language: "bash", source: bunInstall }),
    p("With npm or pnpm:"),
    codeBlock({ label: "Terminal", language: "bash", source: otherManagers }),
    callout(
      "warning",
      "Pin the Effect release candidate",
      "TenetKit 0.38.x is built and tested against ",
      code("effect@4.0.0-rc.111"),
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
          "0.38.0",
          "The agent loop: events, typed suspension, turn policy, tools, approvals, permissions, steering, and compaction",
        ],
        [
          [code("tenetkit/ai")],
          "0.38.0",
          "Optional model registration for OpenAI, Anthropic, OpenRouter, Amazon Bedrock, and OpenAI-compatible APIs",
        ],
        [[code("tenetkit/runtime")], "0.38.0", "Addressable Runs, replay, inspection, waits, and stores"],
        [[code("tenetkit/mcp")], "0.38.0", "MCP discovery and the TenetKit ToolExecutor adapter"],
        [[code("tenetkit/skills")], "0.38.0", "SKILL.md and instruction-file sources"],
        [[code("tenetkit/memory")], "0.38.0", "Working memory, vector store, and semantic recall"],
        [[code("tenetkit/test")], "0.38.0", "Scripted model fixtures and normalized request capture"],
        [
          [code("tenetkit/transport")],
          "0.38.0",
          "Runtime wire codecs, snapshots, SSE and WebSocket serving, and client adapters",
        ],
        [[code("tenetkit/foldkit")], "0.38.0", "FoldKit connection service and headless chat model"],
        [[code("tenetkit/a2a")], "0.38.0", "A2A v1 server projection over Runtime"],
        [[code("tenetkit/ag-ui")], "0.38.0", "AG-UI event projection over Runtime"],
      ],
    ),
    h2("effect-compatibility", "Effect compatibility"),
    table(["TenetKit release", "Tested Effect version"], [[[code("0.38.x")], [code("effect@4.0.0-rc.111")]]]),
    p(code("tenetkit/foldkit"), " additionally declares the optional peer range ", code("foldkit >=0.148.0 <1"), "."),
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
