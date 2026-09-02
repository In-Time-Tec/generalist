/* oxlint-disable effecttsgo/strict-effect-provide -- the Vitest reporter is a test-runner boundary. */
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Option, Schema } from "effect"
import type { TestModule } from "vitest/node"
import type { Reporter, TestRunEndReason } from "vitest/reporters"
import { Certification, Suite, writeCertification } from "../packages/generalist/src/testing/report.js"

export const certificationReportPath = "docs/features/hosts-report.json"

/** Suite `meta` attached by `Testing.runtimeDriver`; it crosses the worker boundary, so decode it. */
const certificationMeta = Schema.decodeUnknownOption(Schema.Struct({ generalistCertification: Suite }))

const collectPassedSuites = (modules: ReadonlyArray<TestModule>): Array<Suite> => {
  const passed = new Map<string, Suite>()
  for (const module of modules) {
    for (const suite of module.children.allSuites()) {
      if (suite.state() !== "passed") continue
      const meta = certificationMeta(suite.meta())
      if (Option.isSome(meta)) passed.set(meta.value.generalistCertification.name, meta.value.generalistCertification)
    }
  }
  return [...passed.values()]
}

const updateReport = Effect.fn("RuntimeDriverReport.updateReport")(function* (modules: ReadonlyArray<TestModule>) {
  const fileSystem = yield* FileSystem.FileSystem
  const previous = (yield* fileSystem.exists(certificationReportPath))
    ? yield* Schema.decodeEffect(Schema.fromJsonString(Certification))(
        yield* fileSystem.readFileString(certificationReportPath),
      )
    : Certification.make({ schemaVersion: 1, suites: [] })
  const suites = new Map(previous.suites.map((suite) => [suite.name, suite]))
  for (const suite of collectPassedSuites(modules)) suites.set(suite.name, suite)
  yield* writeCertification({
    path: certificationReportPath,
    certification: Certification.make({ schemaVersion: 1, suites: [...suites.values()] }),
  })
})

export class RuntimeDriverReport implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>, _errors: ReadonlyArray<unknown>, reason: TestRunEndReason) {
    if (reason !== "passed") return
    return Effect.runPromise(updateReport(modules).pipe(Effect.provide(layer)))
  }
}
