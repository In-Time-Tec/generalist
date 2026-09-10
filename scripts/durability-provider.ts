/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Config, Console, Crypto, Effect, Layer, Result, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { arch, argv, env, platform, versions } from "node:process"
import {
  configuration,
  providers,
  qualify,
  type Evidence,
  type Provider,
  writeEvidence as writeJsonEvidence,
} from "../packages/generalist/src/testing/durability/remote.js"
import { nativeR2Configuration } from "../packages/generalist/src/testing/durability/native-r2-configuration.js"
import { nativeR2Provider } from "../packages/generalist/src/testing/durability/native-r2-worker.js"
import { qualifyNativeR2, type NativeR2Evidence } from "../packages/generalist/src/testing/durability/native-r2.js"

class QualificationFailed extends Schema.TaggedError<QualificationFailed>()("generalist/scripts/QualificationFailed", {
  message: Schema.String,
}) {}

const acceptedProviders = [...providers, nativeR2Provider] as const
type SelectedProvider = (typeof acceptedProviders)[number]
const isProvider = Schema.is(Schema.Literals(acceptedProviders))
const runtime = `Bun ${versions.bun ?? "unavailable"}; ${platform}/${arch}`
const explicitEnvironment: Readonly<Record<string, string | undefined>> = env
const evidenceDirectory = Config.withDefault(
  Config.string("GENERALIST_DURABILITY_EVIDENCE_DIR"),
  "artifacts/durability-provider",
)
const arguments_ = argv.slice(2)
const selected: Array<SelectedProvider> = []
const argumentErrors: Array<string> = []
for (const argument of arguments_.length === 0 ? providers : arguments_) {
  if (!isProvider(argument))
    argumentErrors.push(
      "Arguments must be aws-s3, r2-s3, or r2-native-s3-interoperability; omit arguments to require both S3 providers",
    )
  else if (!selected.includes(argument)) selected.push(argument)
}
const s3Configurations = selected
  .filter((provider): provider is Provider => provider !== nativeR2Provider)
  .map((provider) => configuration(provider, explicitEnvironment))
const nativeConfiguration = selected.includes(nativeR2Provider) ? nativeR2Configuration(explicitEnvironment) : undefined
const scope = selected.includes(nativeR2Provider)
  ? "R2 native/S3 interoperability and S3 API provider qualification"
  : "S3 API provider qualification"

type Report =
  | Evidence
  | NativeR2Evidence
  | { readonly provider: SelectedProvider; readonly result: "failed"; readonly reasons: ReadonlyArray<string> }
  | {
      readonly provider: typeof nativeR2Provider
      readonly result: "failed"
      readonly namespace: string
      readonly cleanup: {
        readonly result: "retained"
        readonly removedObjects: 0
        readonly writers: "uncertain"
        readonly reason: string
      }
    }

const unmetReasons: ReadonlyArray<string> = [
  ...s3Configurations.flatMap((entry) => (entry.status === "unmet" ? entry.reasons : [])),
  ...(nativeConfiguration?.status === "unmet" ? nativeConfiguration.reasons : []),
]

const preflightProviders = [
  ...s3Configurations.map((entry) =>
    entry.status === "unmet"
      ? entry
      : {
          provider: entry.configuration.provider,
          result: "not-run" as const,
          reasons: ["Required configuration preflight failed; no network requests were made"],
        },
  ),
  ...(nativeConfiguration === undefined
    ? []
    : [
        nativeConfiguration.status === "unmet"
          ? nativeConfiguration
          : {
              provider: nativeConfiguration.configuration.provider,
              result: "not-run" as const,
              reasons: ["Required configuration preflight failed; no network requests were made"],
            },
      ]),
]

interface QualificationEvidence {
  readonly schemaVersion: number
  readonly runId: string
  readonly runtime: string
  readonly result: "unmet" | "in-progress" | "passed" | "failed"
  readonly scope: string
  readonly providers: ReadonlyArray<Report | (typeof preflightProviders)[number]>
  readonly unmetGates: ReadonlyArray<string>
  readonly reasons?: ReadonlyArray<string>
  readonly running?: Schema.Json
}

const writeEvidence = (directory: string, runId: string, evidence: QualificationEvidence) =>
  Schema.decodeUnknownEffect(Schema.Json)(evidence).pipe(
    Effect.flatMap((json) => writeJsonEvidence(directory, runId, json)),
  )

const writeProgress = (directory: string, runId: string, reports: ReadonlyArray<Report>, running?: Schema.Json) => {
  const progress = {
    schemaVersion: 1,
    runId,
    runtime,
    result: "in-progress" as const,
    scope,
    providers: reports,
    unmetGates: [],
  }
  return running === undefined
    ? writeEvidence(directory, runId, progress)
    : writeEvidence(directory, runId, { ...progress, running })
}

const runNativeProvider = (directory: string, runId: string, reports: Array<Report>) =>
  Effect.gen(function* () {
    if (nativeConfiguration?.status !== "configured") return
    const nativeConfig = nativeConfiguration.configuration
    const namespace = `environments/${nativeConfig.environment}/v1/tenants/${nativeConfig.tenant}~${runId}/`
    yield* writeProgress(directory, runId, reports, {
      provider: nativeR2Provider,
      namespace,
      journalConcurrency: nativeConfig.concurrency,
    })
    const result = yield* qualifyNativeR2(nativeConfig, { runId, runtime }).pipe(Effect.result)
    reports.push(
      Result.isSuccess(result)
        ? result.success
        : {
            provider: nativeR2Provider,
            result: "failed",
            namespace,
            cleanup: {
              result: "retained",
              removedObjects: 0,
              writers: "uncertain",
              reason:
                "Completion was not positively acknowledged; retained namespace may contain in-flight native writes",
            },
          },
    )
  })

const runS3Provider = (directory: string, runId: string, reports: Array<Report>, provider: Provider) =>
  Effect.gen(function* () {
    const entry = s3Configurations.find(
      (candidate) => candidate.status === "configured" && candidate.configuration.provider === provider,
    )
    if (entry === undefined || entry.status !== "configured") return
    const s3Config = entry.configuration
    yield* writeProgress(directory, runId, reports, {
      provider: s3Config.provider,
      region: s3Config.connection.region,
      seed: s3Config.seed,
      journalConcurrency: s3Config.concurrency,
      namespace: `environments/${s3Config.environment}/v1/tenants/${s3Config.tenant}-${s3Config.provider}-${runId}/`,
    })
    const result = yield* qualify(s3Config, { runId, runtime }).pipe(Effect.result)
    reports.push(
      Result.isSuccess(result)
        ? result.success
        : {
            provider,
            result: "failed",
            reasons: [
              "Qualification failed before returning a complete evidence record; retained remote objects may require investigation",
            ],
          },
    )
  })

const program = Effect.gen(function* () {
  const directory = yield* evidenceDirectory
  const crypto = yield* Crypto.Crypto
  const runId = yield* crypto.randomUUIDv4
  // Preflight ALL requested providers before any provider receives even a read request.
  if (
    argumentErrors.length > 0 ||
    s3Configurations.some((entry) => entry.status === "unmet") ||
    nativeConfiguration?.status === "unmet"
  ) {
    const path = yield* writeEvidence(directory, runId, {
      schemaVersion: 1,
      runId,
      runtime,
      result: "unmet",
      scope,
      reasons: [...argumentErrors, ...unmetReasons],
      providers: preflightProviders,
      unmetGates: nativeConfiguration?.status === "unmet" ? nativeConfiguration.reasons : [],
    })
    yield* Console.error(`Provider qualification UNMET. Evidence: ${path}`)
    return yield* QualificationFailed.make({
      message:
        "Explicit remote authorization, scoped identity, credentials, bucket configuration, and (for native interoperability) an authenticated enabled Worker endpoint are required",
    })
  }
  const reports: Array<Report> = []
  for (const provider of selected) {
    if (provider === nativeR2Provider) yield* runNativeProvider(directory, runId, reports)
    else yield* runS3Provider(directory, runId, reports, provider)
    // Persist after each provider so a later crash cannot erase an earlier completed result.
    yield* writeProgress(directory, runId, reports)
  }
  const passed = reports.length === selected.length && reports.every((report) => report.result === "passed")
  const path = yield* writeEvidence(directory, runId, {
    schemaVersion: 1,
    runId,
    runtime,
    result: passed ? "passed" : "failed",
    scope,
    providers: reports,
    unmetGates: [],
  })
  yield* Console.log(`Provider qualification ${passed ? "PASSED" : "FAILED"}. Evidence: ${path}`)
  if (!passed)
    return yield* QualificationFailed.make({
      message: "At least one required real-provider scenario failed; inspect the machine-readable evidence",
    })
})

await Effect.runPromise(program.pipe(Effect.provide(Layer.mergeAll(layer, FetchHttpClient.layer))))
