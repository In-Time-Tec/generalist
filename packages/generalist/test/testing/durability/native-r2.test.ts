import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { TestClock } from "effect/testing"
import { vi } from "vitest"
import { ObjectStoreFailure } from "../../../src/durability/object-store.js"
import { make as makeSimulator } from "../../../src/testing/durability/index.js"
import { NativeR2Failure, nativeR2Namespace } from "../../../src/testing/durability/native-r2-worker.js"
import { nativeR2Configuration } from "../../../src/testing/durability/native-r2-configuration.js"
import { qualifyNativeR2 } from "../../../src/testing/durability/native-r2.js"

const secrets = ["test-access-key", "test-secret-key", "temporary-token", "native-bearer-token"]
const configured = nativeR2Configuration({
  GENERALIST_DURABILITY_REMOTE: "1",
  GENERALIST_DURABILITY_ENVIRONMENT: "test",
  GENERALIST_DURABILITY_TENANT: "tenant",
  GENERALIST_DURABILITY_R2_BUCKET: "durability-test",
  GENERALIST_DURABILITY_R2_ACCESS_KEY_ID: secrets[0],
  GENERALIST_DURABILITY_R2_SECRET_ACCESS_KEY: secrets[1],
  GENERALIST_DURABILITY_R2_SESSION_TOKEN: secrets[2],
  GENERALIST_DURABILITY_R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT: "https://native.example.test",
  GENERALIST_DURABILITY_NATIVE_R2_TOKEN: secrets[3],
  GENERALIST_DURABILITY_CLEANUP: "1",
})
if (configured.status !== "configured") throw new Error(configured.reasons.join("; "))
const configuration = configured.configuration
const runId = "0123456789abcdef"
const namespace = nativeR2Namespace(configuration.environment, configuration.tenant, runId)
const leakedMessage = `Signed provider response: ${secrets.join(" ")}`

describe("native R2 local qualification failure evidence", () => {
  it.layer(Layer.mergeAll(BunCrypto.layer, FetchHttpClient.layer))((test) => {
    for (const kind of ["typed failure", "defect", "timeout"] as const) {
      test.effect(`records a sanitized ${kind} and retains uncertain native writes`, () =>
        Effect.gen(function* () {
          const simulator = yield* makeSimulator()
          const entered = yield* Deferred.make<void>()
          let finalized = false
          const failure =
            kind === "timeout"
              ? Effect.never
              : Effect.sleep("7 millis").pipe(
                  Effect.andThen(
                    kind === "defect"
                      ? Effect.die(new Error(leakedMessage))
                      : Effect.fail(
                          ObjectStoreFailure.make({
                            operation: leakedMessage,
                            key: `${namespace}${leakedMessage}`,
                            reason: "authentication",
                            message: leakedMessage,
                          }),
                        ),
                  ),
                )
          const read = vi.fn(() =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(failure),
              Effect.ensuring(
                Effect.sync(() => {
                  finalized = true
                }),
              ),
            ),
          )
          const s3 = yield* Effect.promise(() => import("../../../src/durability/s3.js"))
          const make = vi.spyOn(s3, "make").mockReturnValue(Effect.succeed({ ...simulator.store, read }))
          const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValueOnce(
              Response.json({
                schemaVersion: 1,
                result: "ready",
                operation: "preflight",
                runId,
                environment: configuration.environment,
                tenant: `${configuration.tenant}~${runId}`,
                namespace,
                history: [],
              }),
            )
            .mockResolvedValueOnce(
              Response.json({
                schemaVersion: 1,
                result: "passed",
                operation: "commit",
                runId,
                environment: configuration.environment,
                tenant: `${configuration.tenant}~${runId}`,
                namespace,
                partition: "native",
                history: Array.from({ length: 3 }, (_, index) => ({
                  id: `native-${index}`,
                  receipt: { count: index + 1 },
                })),
                head: { sequence: "2", count: 3, stateDigest: "local-fixture-digest" },
              }),
            )
            .mockRejectedValue(new Error("Unexpected native request"))
          try {
            const pending = yield* qualifyNativeR2(configuration, { runId, runtime: "local-test" }).pipe(
              Effect.provideService(FetchHttpClient.Fetch, fetch),
              Effect.forkChild({ startImmediately: true }),
            )
            yield* Effect.raceFirst(Deferred.await(entered), Fiber.join(pending))
            yield* TestClock.adjust(kind === "timeout" ? "5 minutes" : "7 millis")
            const evidence = yield* Fiber.join(pending)
            expect(evidence.result).toBe("failed")
            expect(evidence.cases).toEqual([
              {
                name: "native-commits-recover-through-s3",
                result: "failed",
                durationMs: kind === "timeout" ? 300_000 : 7,
                failure: {
                  tag: kind === "defect" ? NativeR2Failure.make({ reason: "transport" })._tag : "native-r2-failure",
                  reason: "transport",
                },
              },
              { name: "s3-commits-recover-through-native", result: "not-run", durationMs: 0 },
              { name: "native-contention-has-independent-winners", result: "not-run", durationMs: 0 },
              { name: "s3-contention-recovers-through-native", result: "not-run", durationMs: 0 },
            ])
            expect(evidence.cleanup).toEqual({
              result: "retained",
              removedObjects: 0,
              writers: "uncertain",
              reason:
                "Completion was not positively acknowledged; retained namespace may contain in-flight native writes",
            })
            expect(finalized).toBe(true)
            expect(read).toHaveBeenCalledTimes(1)
            expect(fetch).toHaveBeenCalledTimes(2)
            const json = Schema.fromJsonString(Schema.Unknown)
            const report = yield* Schema.encodeEffect(json)(evidence)
            for (const secret of [
              ...secrets,
              leakedMessage,
              configuration.endpoint,
              configuration.connection.endpoint!,
            ]) {
              expect(report).not.toContain(secret)
            }
            expect(yield* Schema.decodeEffect(json)(report)).toEqual(evidence)
          } finally {
            fetch.mockRestore()
            make.mockRestore()
          }
        }),
      )
    }
  })
})
