import { code, definePage, h2, lead, link, p, pills, table } from "../../../prose"

const version = "0.43.0"

export const versioningReference = definePage({
  path: "/docs/reference/versioning",
  title: "Versioning and releases",
  navTitle: "Versioning",
  group: "Reference",
  description: "The 0.43.0 package set, experimental policy, Effect compatibility, and release train.",
  content: [
    lead("The four TenetKit packages publish to npm as a coordinated train at the same version."),
    h2("published-set", "Published packages"),
    table(
      ["Package", "Version", "Subpath exports"],
      [
        [
          [code("tenetkit")],
          [code(version)],
          [
            "44 explicit exports for Core, Runtime, exact AI leaves, MCP, memory, skills, test hosts, transport, and integrations",
          ],
        ],
        [[code("@tenetkit/pg")], [code(version)], [code(".")]],
        [[code("@tenetkit/mysql")], [code(version)], [code(".")]],
        [
          [code("@tenetkit/cloudflare")],
          [code(version)],
          [
            code("./workers"),
            ", ",
            code("./durable-objects"),
            ", ",
            code("./dynamic-workers"),
            "; no package-root export",
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
      [[[code("0.43.0")], [code("4.0.0-rc.112")], "The exact peer and tested workspace catalog version"]],
    ),
    h2("release-train", "The release train"),
    p("Every release builds and publishes all packages from one committed lockstep version:"),
    pills(["tenetkit", "@tenetkit/pg", "@tenetkit/mysql", "@tenetkit/cloudflare"]),
    p(
      "The tag workflow builds once, verifies four unchanged tarballs in clean minimum-dependency consumers, emits checksums and release evidence, attaches those six assets to GitHub, and publishes the exact four tarballs to npm. A manual run only reconciles an existing immutable tag and commit.",
    ),
    p("For install commands and package roles, see ", link("/docs/start/installation", "Installation"), "."),
  ],
})
