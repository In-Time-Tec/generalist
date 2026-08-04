import { code, definePage, h2, lead, link, p, pills, table } from "../../prose"

const version = "0.14.0"

export const versioningReference = definePage({
  path: "/docs/reference/versioning",
  title: "Versioning and releases",
  navTitle: "Versioning",
  group: "Reference",
  description: "The published 0.14.0 set, experimental policy, Effect compatibility, and release train.",
  content: [
    lead("All eleven @batonfx packages publish to npm as a coordinated train at the same version."),
    h2("published-set", "Published packages"),
    table(
      ["Package", "Version", "Subpath exports"],
      [
        [[code("@batonfx/a2a")], [code(version)], [code(".")]],
        [[code("@batonfx/ag-ui")], [code(version)], [code(".")]],
        [[code("@batonfx/core")], [code(version)], [code(".")]],
        [[code("@batonfx/foldkit")], [code(version)], [code(".")]],
        [[code("@batonfx/mcp")], [code(version)], [code("."), ", ", code("./baton")]],
        [[code("@batonfx/memory")], [code(version)], [code(".")]],
        [
          [code("@batonfx/providers")],
          [code(version)],
          [code("."), ", ", code("./catalog"), ", provider, authentication, preset, and embedding subpaths"],
        ],
        [[code("@batonfx/runtime")], [code(version)], [code(".")]],
        [[code("@batonfx/skills")], [code(version)], [code(".")]],
        [[code("@batonfx/test")], [code(version)], [code(".")]],
        [
          [code("@batonfx/transport")],
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
      ["Batonfx", "effect", "Notes"],
      [[[code("0.14.x")], [code("4.0.0-beta.98")], "The exact peer and tested workspace catalog version"]],
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
