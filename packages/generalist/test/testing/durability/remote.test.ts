/* oxlint-disable effecttsgo/async-function, effecttsgo/crypto-random-uuid, effecttsgo/process-env, effecttsgo/strict-effect-provide -- This real-provider qualification harness runs at the native credential/environment boundary and must retain host-generated isolation IDs and the test-host Layer. */
import { layer } from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { configuration, providers, qualify, writeEvidence } from "../../../src/testing/durability/remote.js"

const runtime = `Bun ${process.versions.bun ?? "unavailable"}; ${process.platform}/${process.arch}`
const directory = process.env.GENERALIST_DURABILITY_EVIDENCE_DIR ?? "artifacts/durability-provider"

describe("remote durability configuration", () => {
  it("exposes only the maintained AWS S3 qualification", () => {
    expect(providers).toEqual(["aws-s3"])
    const result = configuration("aws-s3", {})
    expect(result.status).toBe("unmet")
    if (result.status === "configured") return
    expect(result.reasons).toContain("GENERALIST_DURABILITY_AWS_REGION is required")
    expect(result.reasons.some((reason) => reason.includes("R2"))).toBe(false)
  })
})

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
