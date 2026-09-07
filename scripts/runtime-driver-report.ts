/* oxlint-disable effecttsgo/strict-effect-provide -- the Vitest reporter is a test-runner boundary. */
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Option, Schema } from "effect"
import type { TestModule } from "vitest/node"
import type { Reporter, TestRunEndReason } from "vitest/reporters"
import { Suite } from "../packages/generalist/src/testing/report.js"

export const certificationReportPath = "docs/features/hosts-report.json"

const UnmetQualification = Schema.Struct({
  status: Schema.Literal("unmet"),
  reason: Schema.String,
})

/** Local runtime evidence and remote qualification are deliberately independent. */
export const HostReport = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  suites: Schema.Array(Suite),
  qualification: Schema.Struct({
    "aws-s3": UnmetQualification,
    "r2-s3": UnmetQualification,
    "r2-native-s3-interoperability": UnmetQualification,
  }),
})
export type HostReport = typeof HostReport.Type

const qualification: HostReport["qualification"] = {
  "aws-s3": {
    status: "unmet",
    reason: "No authorized remote AWS S3 qualification evidence has been accepted.",
  },
  "r2-s3": {
    status: "unmet",
    reason: "No authorized remote R2 S3 API qualification evidence has been accepted.",
  },
  "r2-native-s3-interoperability": {
    status: "unmet",
    reason: "Native R2 and S3 API cross-transport qualification requires an authorized native endpoint contract and remote evidence.",
  },
}

export const objectNativeSuiteName = "runtimeDriver:object-native"

/** Suite `meta` attached by `Testing.runtimeDriver`; it crosses the worker boundary, so decode it. */
const certificationMeta = Schema.decodeUnknownOption(Schema.Struct({ generalistCertification: Suite }))

const collectPassedSuites = (modules: ReadonlyArray<TestModule>): Array<Suite> => {
  const passed = new Map<string, Suite>()
  for (const module of modules) {
    for (const suite of module.children.allSuites()) {
      if (suite.state() !== "passed") continue
      const meta = certificationMeta(suite.meta())
      if (Option.isSome(meta) && meta.value.generalistCertification.name === objectNativeSuiteName) {
        passed.set(meta.value.generalistCertification.name, meta.value.generalistCertification)
      }
    }
  }
  return [...passed.values()]
}

const updateReport = Effect.fn("RuntimeDriverReport.updateReport")(function* (suites: ReadonlyArray<Suite>) {
  const fileSystem = yield* FileSystem.FileSystem
  const report = HostReport.make({
    schemaVersion: 1,
    suites: suites.map((suite) => Suite.make({
      name: suite.name,
      capabilities: [...suite.capabilities].toSorted(),
    })).toSorted((left, right) => left.name.localeCompare(right.name)),
    qualification,
  })
  const text = yield* Schema.encodeEffect(Schema.fromJsonString(HostReport))(report)
  yield* fileSystem.writeFileString(certificationReportPath, `${text}\n`)
})

export class RuntimeDriverReport implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>, reason: TestRunEndReason) {
    const registered = modules.some((module) => [...module.children.allSuites()].some((suite) => {
      const meta = certificationMeta(suite.meta())
      return Option.isSome(meta) && meta.value.generalistCertification.name === objectNativeSuiteName
    }))
    if (!registered) return
    const suites = reason === "passed" && errors.length === 0 ? collectPassedSuites(modules) : []
    return Effect.runPromise(updateReport(suites).pipe(Effect.provide(layer)))
  }
}
