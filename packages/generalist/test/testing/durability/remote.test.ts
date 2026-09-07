/* oxlint-disable effecttsgo/async-function, effecttsgo/crypto-random-uuid, effecttsgo/process-env, effecttsgo/strict-effect-provide -- This real-provider qualification harness runs at the native credential/environment boundary and must retain host-generated isolation IDs and the test-host Layer. */
import { layer } from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Result, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { configuration, providers, qualify, writeEvidence } from "../../../src/testing/durability/remote.js"
import {
  NativeR2Response,
  nativeR2Namespace,
  nativeR2Provider,
} from "../../../src/testing/durability/native-r2-worker.js"
import { nativeR2Configuration } from "../../../src/testing/durability/native-r2-configuration.js"
import { nativeR2WriterState, qualifyNativeR2 } from "../../../src/testing/durability/native-r2.js"

const runtime = `Bun ${process.versions.bun ?? "unavailable"}; ${process.platform}/${process.arch}`
const directory = process.env.GENERALIST_DURABILITY_EVIDENCE_DIR ?? "artifacts/durability-provider"

for (const provider of providers) {
  const configured = configuration(provider, process.env)
  describe(`real ${provider} object durability`, () => {
    if (configured.status === "unmet") {
      it.skip(`UNMET: ${configured.reasons.join("; ")}`, () => {})
      return
    }
    it("qualifies conditional writes, journal contention, lost acknowledgement, fresh recovery, pagination, integrity, and snapshot restart", async () => {
      const runId = globalThis.crypto.randomUUID()
      const result = await Effect.runPromise(
        qualify(configured.configuration, { runId, runtime }).pipe(Effect.result, Effect.provide(layer)),
      )
      const evidence = Result.isSuccess(result)
        ? result.success
        : {
            schemaVersion: 1,
            provider,
            runtime,
            runId,
            result: "failed",
            reasons: [
              "Qualification failed before returning a complete evidence record; no provider support is established",
            ],
          }
      const path = await Effect.runPromise(
        Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(evidence).pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))),
          Effect.flatMap((json) => writeEvidence(directory, runId, json)),
          Effect.provide(layer),
        ),
      )
      expect(evidence.result, `Qualification evidence: ${path}`).toBe("passed")
    }, 1_200_000)
  })
}
describe("native R2 local protocol boundaries", () => {
  it("keeps valid tenant/run identities injective in Journal namespaces", () => {
    const first = nativeR2Namespace("env", "a", "b-0123456789abcdef")
    const second = nativeR2Namespace("env", "a-b", "0123456789abcdef")
    expect(first).not.toBe(second)
  })

  it("retains uncertainty when native completion is not acknowledged", () => {
    expect(nativeR2WriterState(true)).toBe("stopped")
    expect(nativeR2WriterState(false)).toBe("uncertain")
  })

  it("strictly decodes partition-bearing responses", () => {
    const decode = Schema.decodeUnknownSync(NativeR2Response, { onExcessProperty: "error" })
    const response = decode({
      schemaVersion: 1,
      result: "passed",
      operation: "commit",
      runId: "0123456789abcdef",
      environment: "env",
      tenant: "tenant~0123456789abcdef",
      namespace: "environments/env/v1/tenants/tenant~0123456789abcdef/",
      partition: "native",
      history: [],
      head: { sequence: "0", count: 1, stateDigest: "digest" },
    })
    expect(response.partition).toBe("native")
    expect(() => decode({ ...response, unexpected: true })).toThrow()
  })
})

const nativeConfigured = nativeR2Configuration(process.env)

describe("real R2 native/S3 interoperability", () => {
  if (nativeConfigured.status === "unmet") {
    it.skip(`UNMET: ${nativeConfigured.reasons.join("; ")}`, () => {})
  } else {
    it("recovers exact Journal receipts and independent contention through both production transports", async () => {
      const runId = globalThis.crypto.randomUUID()
      const result = await Effect.runPromise(
        qualifyNativeR2(nativeConfigured.configuration, { runId, runtime }).pipe(
          Effect.result,
          Effect.provide(Layer.mergeAll(layer, FetchHttpClient.layer)),
        ),
      )
      const evidence = Result.isSuccess(result)
        ? result.success
        : {
            schemaVersion: 1,
            provider: nativeR2Provider,
            runtime,
            runId,
            result: "failed",
            reasons: ["Native interoperability failed before returning complete non-secret evidence"],
            namespace: nativeR2Namespace(
              nativeConfigured.configuration.environment,
              nativeConfigured.configuration.tenant,
              runId,
            ),
            cleanup: {
              result: "retained",
              removedObjects: 0,
              writers: "uncertain",
              reason:
                "Completion was not positively acknowledged; retained namespace may contain in-flight native writes",
            },
          }
      const path = await Effect.runPromise(
        Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(evidence).pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))),
          Effect.flatMap((json) => writeEvidence(directory, runId, json)),
          Effect.provide(layer),
        ),
      )
      expect(evidence.result, `Qualification evidence: ${path}`).toBe("passed")
    }, 1_200_000)
  }
})
