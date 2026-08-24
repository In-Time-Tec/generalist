import { code, definePage, h2, lead, link, p, pills, table } from "../../prose"

const version = "0.14.0"

export const versioningReference = definePage({
  path: "/docs/reference/versioning",
  title: "Versioning and releases",
  navTitle: "Versioning",
  group: "Reference",
  description: "The published 0.14.0 set, experimental policy, Effect compatibility, and release train.",
  content: [
    lead("All eleven @tenetkit packages publish to npm as a coordinated train at the same version."),
    h2("published-set", "Published packages"),
    table(
      ["Package", "Version", "Subpath exports"],
      [
        [[code("tenetkit/a2a")], [code(version)], [code(".")]],
        [[code("tenetkit/ag-ui")], [code(version)], [code(".")]],
        [[code("tenetkit")], [code(version)], [code(".")]],
        [[code("tenetkit/foldkit")], [code(version)], [code(".")]],
        [[code("tenetkit/mcp")], [code(version)], [code("."), ", ", code("./tools")]],
        [[code("tenetkit/memory")], [code(version)], [code(".")]],
        [
          [code("tenetkit/ai")],
          [code(version)],
          [code("."), ", ", code("./catalog"), ", provider, authentication, preset, and embedding subpaths"],
        ],
        [[code("tenetkit/runtime")], [code(version)], [code(".")]],
        [[code("tenetkit/skills")], [code(version)], [code(".")]],
        [[code("tenetkit/test")], [code(version)], [code(".")]],
        [
          [code("tenetkit/transport")],
          [code(version)],
          [
            code("."),
            ", ",
            code("./client"),
            ", ",
            code("./errors"),
            ", ",
            code("./sse"),
            ", ",
            code("./ws"),
            ", ",
            code("./wire"),
            ", ",
            code("./snapshot"),
          ],
        ],
      ],
    ),
    h2("experimental-policy", "The @experimental policy"),
    p(
      "Every public export remains ",
      code("@experimental"),
      " while ",
      code("effect/unstable/ai"),
      " is unstable. APIs may change in any 0.x release.",
    ),
    h2("effect-compat", "Effect compatibility"),
    table(
      ["TenetKit", "effect", "Notes"],
      [[[code("0.37.x")], [code("4.0.0-rc.111")], "The exact peer and tested workspace catalog version"]],
    ),
    h2("release-train", "The release train"),
    p("Every release builds and publishes all packages from one committed lockstep version:"),
    pills(["a2a", "ag-ui", "core", "foldkit", "mcp", "memory", "providers", "runtime", "skills", "test", "transport"]),
    p(
      "The tag workflow builds once, verifies eleven unchanged tarballs in clean consumers, emits checksums and release evidence, attaches the same thirteen assets to GitHub, and publishes the exact tarballs to npm. A manual run only reconciles an existing immutable tag and commit.",
    ),
    p("For install commands and package roles, see ", link("/docs/start/installation", "Installation"), "."),
  ],
})
