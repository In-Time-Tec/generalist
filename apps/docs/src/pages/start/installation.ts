import { callout, code, codeBlock, definePage, h2, lead, link, p, table } from "../../prose"
const bunInstall = `bun add effect@4.0.0-rc.112 generalist@0.45.0`

const otherManagers = `npm install effect@4.0.0-rc.112 generalist@0.45.0
pnpm add effect@4.0.0-rc.112 generalist@0.45.0`

export const installation = definePage({
  path: "/docs/start/installation",
  title: "Installation",
  navTitle: "Installation",
  group: "Start",
  description: "Install Generalist 0.45.0 with its exact Effect peer and only the adapter peers you use.",
  content: [
    lead(
      "Most projects install effect and generalist, then import exact generalist/* subpaths. PostgreSQL, MySQL, Cloudflare, and Rivet adapters are subpaths of the same package; you add only the optional peers for the subpaths you import.",
    ),
    codeBlock({ label: "Terminal", language: "bash", source: bunInstall }),
    p("With npm or pnpm:"),
    codeBlock({ label: "Terminal", language: "bash", source: otherManagers }),
    callout(
      "warning",
      "Pin the Effect release candidate",
      "Generalist 0.45.0 is built and tested against ",
      code("effect@4.0.0-rc.112"),
      ". The ",
      code("effect/unstable/ai"),
      " modules Generalist reuses change between betas, so install the pinned version rather than a floating range. That churn is Generalist's problem, not yours: each release tracks one tested Effect version, and the release train absorbs upstream breaking changes before you see them.",
    ),
    h2("package-matrix", "One package"),
    p(
      "The release train publishes exactly one installable package. Every adapter ships inside it as a subpath export, so there is one version to track and unimported adapters never reach your bundle.",
    ),
    table(
      ["Package", "Version", "Runtime and role"],
      [
        [
          [code("generalist")],
          "0.45.0",
          "Node 22+ and Bun 1.4+: agent loop, generic Runtime, exact feature import subpaths, and the pg, mysql, cloudflare, and rivet adapters",
        ],
      ],
    ),
    h2("import-profiles", "Import subpaths and peers"),
    p(
      code("generalist/runtime"),
      ", ",
      code("generalist/transport"),
      ", ",
      code("generalist/memory"),
      ", ",
      code("generalist/instructions/skills"),
      ", and ",
      code("generalist/ai/deterministic"),
      " are imports from generalist, never package-manager arguments. Core, generic Runtime, and the deterministic leaf need no optional peer.",
    ),
    table(
      ["Import profile", "Additional dependency", "Runtime"],
      [
        [[code("generalist/pg")], [code("@effect/sql-pg@4.0.0-rc.112"), " and ", code("pg@8.23.0")], "Node and Bun"],
        [[code("generalist/mysql")], [code("@effect/sql-mysql2@4.0.0-rc.112")], "Node and Bun"],
        [[code("generalist/cloudflare/workers")], "None beyond effect", "Cloudflare Workers"],
        [
          [code("generalist/cloudflare/durable-objects")],
          [code("@effect/sql-sqlite-do@4.0.0-rc.112")],
          "Cloudflare Workers",
        ],
        [[code("generalist/cloudflare/dynamic-workers")], [code("es-module-lexer@2.3.2")], "Cloudflare Workers"],
        [
          [code("generalist/rivet/actors")],
          [code("rivetkit@2.3.10"), " and ", code("@standard-schema/spec@1.1.0")],
          "Node and Bun",
        ],
        [[code("generalist/runtime/sqlite-bun")], [code("@effect/sql-sqlite-bun@4.0.0-rc.112")], "Bun only"],
        [[code("generalist/mcp/*")], [code("@modelcontextprotocol/sdk@1.29.0")], "Node, Bun; HTTP is Worker-safe"],
        [[code("generalist/foldkit")], [code("foldkit@0.148.2")], "Node and Bun"],
        [[code("generalist/a2a")], [code("@a2a-js/sdk@1.0.1")], "Node and Bun"],
        [[code("generalist/ag-ui")], [code("@ag-ui/core@0.0.57")], "Node and Bun"],
        [
          [code("generalist/ai/<provider>")],
          "The exact @effect/ai peer named by that provider; Bedrock uses its three AWS/Smithy peers",
          "Node and Bun, except Bedrock's Node credential-chain profile",
        ],
        [
          [code("generalist/test"), " / ", code("generalist/test/runtime-driver")],
          [code("@effect/vitest@4.0.0-rc.112"), " and ", code("vitest@4.1.11")],
          "Test host",
        ],
      ],
    ),
    h2("effect-compatibility", "Effect compatibility"),
    table(["Generalist release", "Tested Effect version"], [[[code("0.45.0")], [code("effect@4.0.0-rc.112")]]]),
    p(code("generalist/foldkit"), " declares the exact tested optional peer ", code("foldkit@0.148.2"), "."),
    h2("api-stability", "API stability"),
    callout(
      "info",
      "Every export is @experimental",
      "While ",
      code("effect/unstable/ai"),
      " remains unstable, every public Generalist export carries the ",
      code("@experimental"),
      " tag: APIs can change in any 0.x release. There is one package and one version to track.",
    ),
    p(
      "Installed? ",
      link("/docs/start/quickstart", "The quickstart"),
      " builds a tool-calling agent and a CI eval with no API key.",
    ),
  ],
})
