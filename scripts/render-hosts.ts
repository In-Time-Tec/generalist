/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Schema } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { HostReport, certificationReportPath, objectNativeSuiteName } from "./runtime-driver-report.js"

class HostDocumentationFailed extends Schema.TaggedError<HostDocumentationFailed>()(
  "generalist/scripts/HostDocumentationFailed",
  { message: Schema.String },
) {}

const documentationPath = "docs/features/hosts.md"

const table = (rows: ReadonlyArray<ReadonlyArray<string>>): string => {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)))
  const line = (row: ReadonlyArray<string>) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`
  const separator = line(widths.map((width) => "-".repeat(width)))
  return [line(rows[0]), separator, ...rows.slice(1).map(line)].join("\n")
}

export const renderHosts = (report: HostReport): string => {
  const suite = report.suites.find((entry) => entry.name === objectNativeSuiteName)
  const localCapabilities =
    suite === undefined ? "unmet: no passing object-native shared suite" : suite.capabilities.join(", ")
  const rows = [
    [
      "Node/Bun, test-only object simulator",
      "`generalist/durability` + `generalist/testing/durability`",
      localCapabilities,
      "Local runtime evidence only; not a production backend or provider qualification.",
    ],
    [
      "Node/Bun + AWS S3",
      "`generalist/durability/s3`",
      report.qualification["aws-s3"].status,
      report.qualification["aws-s3"].reason,
    ],
    [
      "Node/Bun + R2 S3 API",
      "`generalist/durability/s3`",
      report.qualification["r2-s3"].status,
      report.qualification["r2-s3"].reason,
    ],
    [
      "Cloudflare native R2 + S3 API",
      "`generalist/durability/r2`",
      report.qualification["r2-native-s3-interoperability"].status,
      report.qualification["r2-native-s3-interoperability"].reason,
    ],
    [
      "Cloudflare Worker / Durable Object",
      "`generalist/unstable/cloudflare/*`",
      "unmet: host shared suite not registered",
      "Native R2 transport and host-specific local checks do not certify remote recovery.",
    ],
    [
      "Rivet actor",
      "`generalist/unstable/rivet`",
      "unmet: host shared suite not registered",
      "Host placement does not introduce a different durability engine.",
    ],
  ]
  return `# Runtime hosts

One object-native durability engine serves every host. Public transport entrypoints exist, but availability is not qualification: this report does not claim AWS S3, R2, or native/S3 interoperability support without accepted remote evidence. SQL drivers and the alternate memory Runtime are not supported.

${table([["Host / transport", "Entrypoint", "Evidence / gate", "Notes"], ...rows])}

## Local evidence

The shared object-native runtime suite records its advertised capability names only when the complete suite passes. The test-only simulator is not restart-safe production storage. Transport unit tests, signed local HTTP fixtures, Worker bundles, and workerd tests provide local evidence, not remote-provider certification.

\`\`\`sh
bun --bun vitest run packages/generalist/test/testing/runtime-driver/index.test.ts --no-file-parallelism
bun scripts/render-hosts.ts
\`\`\`

Test: [\`testing/runtime-driver/index.test.ts\`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/testing/runtime-driver/index.test.ts)

## Remote qualification

All remote gates above remain unmet. The remote provider runner requires explicit authorization, scoped identities, credentials, and bucket configuration before making requests. Passing its S3 API checks does not establish native R2/S3 interoperability, which requires separate native endpoint and cross-transport evidence. No remote qualification runs as part of package smoke.

## Report lifecycle

The committed [\`hosts-report.json\`](./hosts-report.json) uses schema version 1 for the current object-native contract, with no legacy report reader or migration path. Its producer accepts only the object-native shared suite. A registered suite that fails clears its local passing evidence. Runs that do not include the registered object-native suite leave the report unchanged.

The reporter cannot promote remote gates from local tests. Remote evidence must be reviewed and integrated explicitly. After the shared suite runs, regenerate this page with \`bun scripts/render-hosts.ts\`; \`bun scripts/render-hosts.ts --check\` rejects drift.
`
}

const program = Effect.fn("RenderHosts.program")(function* (check: boolean) {
  const fileSystem = yield* FileSystem.FileSystem
  const report = yield* Schema.decodeEffect(Schema.fromJsonString(HostReport))(
    yield* fileSystem.readFileString(certificationReportPath),
  )
  const rendered = renderHosts(report)
  if (!check) {
    yield* fileSystem.writeFileString(documentationPath, rendered)
    return
  }
  const current = yield* fileSystem.readFileString(documentationPath)
  if (current !== rendered) {
    return yield* HostDocumentationFailed.make({
      message: `${documentationPath} has drifted; run bun scripts/render-hosts.ts`,
    })
  }
  yield* Console.log(`${documentationPath} matches ${certificationReportPath}`)
})

const command = Command.make(
  "render-hosts",
  { check: Flag.Boolean("check").pipe(Flag.withDefault(false)) },
  ({ check }) => program(check),
)

if (import.meta.main) {
  await Effect.runPromise(Command.run(command, { version: "1" }).pipe(Effect.provide(layer)))
}
