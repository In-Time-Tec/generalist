import { callout, code, codeBlock, definePage, h2, lead, link, p, table } from "../../prose"
const bunInstall = `bun add effect@4.0.0-rc.112 tenetkit@0.44.0`

const otherManagers = `npm install effect@4.0.0-rc.112 tenetkit@0.44.0
pnpm add effect@4.0.0-rc.112 tenetkit@0.44.0`

export const installation = definePage({
  path: "/docs/start/installation",
  title: "Installation",
  navTitle: "Installation",
  group: "Start",
  description: "Install TenetKit 0.44.0 with its exact Effect peer and only the adapters and peers you use.",
  content: [
    lead(
      "Most projects install effect and tenetkit, then import exact tenetkit/* subpaths. PostgreSQL, MySQL, Cloudflare, and Rivet are separate lockstep adapter packages.",
    ),
    codeBlock({ label: "Terminal", language: "bash", source: bunInstall }),
    p("With npm or pnpm:"),
    codeBlock({ label: "Terminal", language: "bash", source: otherManagers }),
    callout(
      "warning",
      "Pin the Effect release candidate",
      "TenetKit 0.44.0 is built and tested against ",
      code("effect@4.0.0-rc.112"),
      ". The ",
      code("effect/unstable/ai"),
      " modules TenetKit reuses change between betas, so install the pinned version rather than a floating range. That churn is TenetKit's problem, not yours: each release tracks one tested Effect version, and the release train absorbs upstream breaking changes before you see them.",
    ),
    h2("package-matrix", "Package matrix"),
    p("The release train contains exactly five installable packages. Keep installed TenetKit packages on one version."),
    table(
      ["Package", "Version", "Runtime and role"],
      [
        [
          [code("tenetkit")],
          "0.44.0",
          "Node 22+ and Bun 1.4+: agent loop, generic Runtime, and exact feature import subpaths",
        ],
        [[code("@tenetkit/pg")], "0.44.0", "Node 22+ and Bun 1.4+: PostgreSQL Runtime layer and RuntimeSchema"],
        [[code("@tenetkit/mysql")], "0.44.0", "Node 22+ and Bun 1.4+: MySQL Runtime layer and RuntimeSchema"],
        [[code("@tenetkit/cloudflare")], "0.44.0", "Cloudflare Worker subpaths; the package root is not exported"],
        [[code("@tenetkit/rivet")], "0.44.0", "Node 22+ and Bun 1.4+: Rivet Actors Runtime host"],
      ],
    ),
    h2("import-profiles", "Import subpaths and peers"),
    p(
      code("tenetkit/runtime"),
      ", ",
      code("tenetkit/transport"),
      ", ",
      code("tenetkit/memory"),
      ", ",
      code("tenetkit/skills"),
      ", and ",
      code("tenetkit/ai/deterministic"),
      " are imports from tenetkit, never package-manager arguments. Core, generic Runtime, and the deterministic leaf need no optional peer.",
    ),
    table(
      ["Import profile", "Additional dependency", "Runtime"],
      [
        [[code("tenetkit/runtime/sqlite-bun")], [code("@effect/sql-sqlite-bun@4.0.0-rc.112")], "Bun only"],
        [[code("tenetkit/mcp/*")], [code("@modelcontextprotocol/sdk@1.29.0")], "Node, Bun; HTTP is Worker-safe"],
        [[code("tenetkit/foldkit")], [code("foldkit@0.148.2")], "Node and Bun"],
        [[code("tenetkit/a2a")], [code("@a2a-js/sdk@1.0.1")], "Node and Bun"],
        [[code("tenetkit/ag-ui")], [code("@ag-ui/core@0.0.57")], "Node and Bun"],
        [
          [code("tenetkit/ai/<provider>")],
          "The exact @effect/ai peer named by that provider; Bedrock uses its three AWS/Smithy peers",
          "Node and Bun, except Bedrock's Node credential-chain profile",
        ],
        [
          [code("tenetkit/test"), " / ", code("tenetkit/test/runtime-driver")],
          [code("@effect/vitest@4.0.0-rc.112"), " and ", code("vitest@4.1.11")],
          "Test host",
        ],
      ],
    ),
    h2("effect-compatibility", "Effect compatibility"),
    table(["TenetKit release", "Tested Effect version"], [[[code("0.44.0")], [code("effect@4.0.0-rc.112")]]]),
    p(code("tenetkit/foldkit"), " declares the exact tested optional peer ", code("foldkit@0.148.2"), "."),
    h2("api-stability", "API stability"),
    callout(
      "info",
      "Every export is @experimental",
      "While ",
      code("effect/unstable/ai"),
      " remains unstable, every public TenetKit export carries the ",
      code("@experimental"),
      " tag: APIs can change in any 0.x release. The five packages release in lockstep, so keep them on the same version.",
    ),
    p(
      "Installed? ",
      link("/docs/start/quickstart", "The quickstart"),
      " builds a tool-calling agent and a CI eval with no API key.",
    ),
  ],
})
