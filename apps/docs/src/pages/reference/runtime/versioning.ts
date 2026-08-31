import { code, definePage, h2, lead, link, p, pills, table } from "../../../prose"

const version = "0.45.0"

export const versioningReference = definePage({
  path: "/docs/reference/versioning",
  title: "Versioning and releases",
  navTitle: "Versioning",
  group: "Reference",
  description: "The 0.45.0 package, experimental policy, Effect compatibility, and release train.",
  content: [
    lead("Generalist publishes to npm as one package; every adapter is a subpath export at the same version."),
    h2("published-set", "Published package"),
    table(
      ["Package", "Version", "Subpath exports"],
      [
        [
          [code("generalist")],
          [code(version)],
          [
            "49 explicit exports for Core, Runtime, exact AI leaves, MCP, memory, instructions and skills, test hosts, transport, integrations, and the ",
            code("./pg"),
            ", ",
            code("./mysql"),
            ", ",
            code("./cloudflare/workers"),
            ", ",
            code("./cloudflare/durable-objects"),
            ", ",
            code("./cloudflare/dynamic-workers"),
            ", and ",
            code("./rivet/actors"),
            " adapters",
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
      ["Generalist", "effect", "Notes"],
      [[[code("0.45.0")], [code("4.0.0-rc.112")], "The exact peer and tested workspace catalog version"]],
    ),
    h2("release-train", "The release train"),
    p("Every release builds and publishes from one committed version:"),
    pills(["generalist"]),
    p(
      "The tag workflow builds once, verifies the unchanged tarball in clean minimum-dependency consumers, emits checksums and release evidence, attaches those three assets to GitHub, and publishes the exact tarball to npm. A manual run only reconciles an existing immutable tag and commit.",
    ),
    p("For install commands and adapter peers, see ", link("/docs/start/installation", "Installation"), "."),
  ],
})
