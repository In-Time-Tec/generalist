/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, Result, Schema } from "effect"
import { configuration, providers, qualify, writeEvidence } from "../packages/generalist/src/testing/durability/remote.js"
import type { Evidence, Provider } from "../packages/generalist/src/testing/durability/remote.js"
import { nativeR2Configuration, nativeR2Provider, qualifyNativeR2, type NativeR2Evidence } from "../packages/generalist/src/testing/durability/native-r2.js"

class QualificationFailed extends Schema.TaggedError<QualificationFailed>()(
  "generalist/scripts/QualificationFailed",
  { message: Schema.String },
) {}

const acceptedProviders = [...providers, nativeR2Provider] as const
type SelectedProvider = (typeof acceptedProviders)[number]
const isProvider = Schema.is(Schema.Literals(acceptedProviders))
const runId = globalThis.crypto.randomUUID()
const runtime = `Bun ${process.versions.bun ?? "unavailable"}; ${process.platform}/${process.arch}`
const directory = process.env.GENERALIST_DURABILITY_EVIDENCE_DIR ?? "artifacts/durability-provider"
const arguments_ = process.argv.slice(2)
const selected: Array<SelectedProvider> = []
const argumentErrors: Array<string> = []
for (const argument of arguments_.length === 0 ? providers : arguments_) {
  if (!isProvider(argument)) argumentErrors.push("Arguments must be aws-s3, r2-s3, or r2-native-s3-interoperability; omit arguments to require both S3 providers")
  else if (!selected.includes(argument)) selected.push(argument)
}
const s3Configurations = selected
  .filter((provider): provider is Provider => provider !== nativeR2Provider)
  .map((provider) => configuration(provider, process.env))
const nativeConfiguration = selected.includes(nativeR2Provider) ? nativeR2Configuration(process.env) : undefined
const scope = selected.includes(nativeR2Provider)
  ? "R2 native/S3 interoperability and S3 API provider qualification"
  : "S3 API provider qualification"

type Report =
  | Evidence
  | NativeR2Evidence
  | { readonly provider: SelectedProvider; readonly result: "failed"; readonly reasons: ReadonlyArray<string> }

const unmetReasons: ReadonlyArray<string> = [
  ...s3Configurations.flatMap((entry) => entry.status === "unmet" ? entry.reasons : []),
  ...(nativeConfiguration?.status === "unmet" ? nativeConfiguration.reasons : []),
]

const preflightProviders: ReadonlyArray<unknown> = [
  ...s3Configurations.map((entry) => entry.status === "unmet" ? entry : {
    provider: entry.configuration.provider,
    result: "not-run" as const,
    reasons: ["Required configuration preflight failed; no network requests were made"],
  }),
  ...(nativeConfiguration === undefined
    ? []
    : [nativeConfiguration.status === "unmet" ? nativeConfiguration : {
      provider: nativeConfiguration.configuration.provider,
      result: "not-run" as const,
      reasons: ["Required configuration preflight failed; no network requests were made"],
    }]),
]

const program = Effect.gen(function* () {
  // Preflight ALL requested providers before any provider receives even a read request.
  if (argumentErrors.length > 0 || s3Configurations.some((entry) => entry.status === "unmet") || nativeConfiguration?.status === "unmet") {
    const path = yield* writeEvidence(directory, runId, {
      schemaVersion: 1, runId, runtime, result: "unmet", scope,
      reasons: [...argumentErrors, ...unmetReasons],
      providers: preflightProviders,
      unmetGates: nativeConfiguration?.status === "unmet" ? nativeConfiguration.reasons : [],
    })
    yield* Console.error(`Provider qualification UNMET. Evidence: ${path}`)
    return yield* new QualificationFailed({ message: "Explicit remote authorization, scoped identity, credentials, bucket configuration, and (for native interoperability) an authenticated enabled Worker endpoint are required" })
  }

  const reports: Array<Report> = []
  for (const provider of selected) {
    if (provider === nativeR2Provider) {
      if (nativeConfiguration?.status !== "configured") continue
      yield* writeEvidence(directory, runId, {
        schemaVersion: 1, runId, runtime, result: "in-progress", scope, providers: reports,
        running: {
          provider,
          namespace: `environments/${nativeConfiguration.configuration.environment}/v1/tenants/${nativeConfiguration.configuration.tenant}~${runId}/`,
          journalConcurrency: nativeConfiguration.configuration.concurrency,
        },
        unmetGates: [],
      })
      const result = yield* qualifyNativeR2(nativeConfiguration.configuration, { runId, runtime }).pipe(Effect.result)
      reports.push(Result.isSuccess(result) ? result.success : {
        provider,
        result: "failed",
        namespace: `environments/${nativeConfiguration.configuration.environment}/v1/tenants/${nativeConfiguration.configuration.tenant}~${runId}/`,
        cleanup: { result: "retained", removedObjects: 0, writers: "uncertain", reason: "Completion was not positively acknowledged; retained namespace may contain in-flight native writes" },
      })
    } else {
      const entry = s3Configurations.find((candidate) => candidate.status === "configured" && candidate.configuration.provider === provider)
      if (entry === undefined || entry.status !== "configured") continue
      yield* writeEvidence(directory, runId, {
        schemaVersion: 1, runId, runtime, result: "in-progress", scope, providers: reports,
        running: {
          provider: entry.configuration.provider,
          region: entry.configuration.connection.region,
          seed: entry.configuration.seed,
          journalConcurrency: entry.configuration.concurrency,
          namespace: `environments/${entry.configuration.environment}/v1/tenants/${entry.configuration.tenant}-${entry.configuration.provider}-${runId}/`,
        },
        unmetGates: [],
      })
      const result = yield* qualify(entry.configuration, { runId, runtime }).pipe(Effect.result)
      reports.push(Result.isSuccess(result) ? result.success : {
        provider,
        result: "failed",
        reasons: ["Qualification failed before returning a complete evidence record; retained remote objects may require investigation"],
      })
    }
    // Persist after each provider so a later crash cannot erase an earlier completed result.
    yield* writeEvidence(directory, runId, {
      schemaVersion: 1, runId, runtime, result: "in-progress", scope, providers: reports,
      unmetGates: [],
    })
  }
  const passed = reports.length === selected.length && reports.every((report) => report.result === "passed")
  const path = yield* writeEvidence(directory, runId, {
    schemaVersion: 1, runId, runtime, result: passed ? "passed" : "failed", scope, providers: reports,
    unmetGates: [],
  })
  yield* Console.log(`Provider qualification ${passed ? "PASSED" : "FAILED"}. Evidence: ${path}`)
  if (!passed) return yield* new QualificationFailed({ message: "At least one required real-provider scenario failed; inspect the machine-readable evidence" })
})

await Effect.runPromise(program.pipe(Effect.provide(layer)))
