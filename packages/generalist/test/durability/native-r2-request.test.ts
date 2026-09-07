import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { FetchHttpClient } from "effect/unstable/http"
import { vi } from "vitest"
import { nativeRequest } from "../../src/testing/durability/native-r2-request.js"
import { NativeR2Request, maxResponseBytes } from "../../src/testing/durability/native-r2-worker.js"

const connection = { endpoint: "https://native.example.test", token: "fixture-secret-token" }
const request = { schemaVersion: 1, operation: "preflight", runId: "0123456789abcdef" } as const
const response = {
  ...request,
  result: "ready",
  environment: "test",
  tenant: "tenant~0123456789abcdef",
  namespace: "environments/test/v1/tenants/tenant~0123456789abcdef/",
  history: [],
}

describe("native R2 local request boundary", () => {
  it.layer(FetchHttpClient.layer)((test) => {
    test.effect("sends one authenticated schema request without redirects and closes its scope", () =>
      Effect.gen(function* () {
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(response))
        expect(
          yield* nativeRequest(connection)(request).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
        ).toEqual(response)
        expect(fetch).toHaveBeenCalledTimes(1)
        const [url, options] = fetch.mock.calls[0]!
        expect(yield* Schema.decodeUnknownEffect(Schema.instanceOf(URL))(url)).toEqual(
          new URL("/qualification", connection.endpoint),
        )
        expect(options?.method).toBe("POST")
        expect(options?.redirect).toBe("error")
        expect(new Headers(options?.headers).get("authorization")).toBe(`Bearer ${connection.token}`)
        const bytes = yield* Schema.decodeUnknownEffect(Schema.Uint8Array)(options?.body)
        const body = yield* Schema.decodeEffect(Schema.fromJsonString(NativeR2Request))(new TextDecoder().decode(bytes))
        expect(body).toEqual(request)
        expect(options?.signal?.aborted).toBe(true)
      }),
    )

    for (const fixture of [
      {
        name: "strict response properties",
        body: { ...response, secret: connection.token },
        status: 200,
        reason: "invalid-response",
      },
      { name: "malformed response JSON", body: connection.token, status: 200, reason: "invalid-response" },
      { name: "authentication fallback", body: { message: connection.token }, status: 401, reason: "authentication" },
      { name: "untrusted failure reason", body: { reason: connection.token }, status: 500, reason: "transport" },
      {
        name: "allowlisted failure reason",
        body: { reason: "unavailable", message: connection.token },
        status: 500,
        reason: "unavailable",
      },
    ]) {
      test.effect(`sanitizes ${fixture.name}`, () =>
        Effect.gen(function* () {
          const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValue(Response.json(fixture.body, { status: fixture.status }))
          const failure = yield* nativeRequest(connection)(request).pipe(
            Effect.provideService(FetchHttpClient.Fetch, fetch),
            Effect.flip,
          )
          expect(failure.reason).toBe(fixture.reason)
          const report = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(failure)
          expect(report).not.toContain(connection.token)
          expect(fetch).toHaveBeenCalledTimes(1)
          expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
        }),
      )
    }

    for (const length of ["-1", "invalid", String(maxResponseBytes + 1)]) {
      test.effect(`rejects invalid content length ${length} before reading`, () =>
        Effect.gen(function* () {
          let pulled = false
          const body = new ReadableStream<Uint8Array>(
            {
              pull: () => {
                pulled = true
              },
            },
            { highWaterMark: 0 },
          )
          const fetch = vi
            .fn<typeof globalThis.fetch>()
            .mockResolvedValue(new Response(body, { headers: { "content-length": length } }))
          const failure = yield* nativeRequest(connection)(request).pipe(
            Effect.provideService(FetchHttpClient.Fetch, fetch),
            Effect.flip,
          )
          expect(failure.reason).toBe("invalid-response")
          expect(pulled).toBe(false)
          expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
        }),
      )
    }

    for (const name of ["Error", "AbortError", "TimeoutError"]) {
      test.effect(`sanitizes a transport ${name}`, () =>
        Effect.gen(function* () {
          const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException(connection.token, name))
          const failure = yield* nativeRequest(connection)(request).pipe(
            Effect.provideService(FetchHttpClient.Fetch, fetch),
            Effect.flip,
          )
          expect(failure.reason).toBe(name === "Error" ? "transport" : "timeout")
          expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(failure)).not.toContain(
            connection.token,
          )
          expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
        }),
      )
    }

    test.effect("aborts the transport when the deadline expires before headers", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const responsePending = Promise.withResolvers<Response>()
        const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => {
          Deferred.doneUnsafe(entered, Effect.void)
          return responsePending.promise
        })
        const pending = yield* nativeRequest(connection)(request).pipe(
          Effect.provideService(FetchHttpClient.Fetch, fetch),
          Effect.forkChild({ startImmediately: true }),
        )
        yield* Deferred.await(entered)
        yield* TestClock.adjust("60 seconds")
        expect((yield* Fiber.join(pending).pipe(Effect.flip)).reason).toBe("timeout")
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
        responsePending.resolve(Response.json(response))
      }),
    )

    test.effect("cancels a response stream that exceeds the actual byte limit", () =>
      Effect.gen(function* () {
        let canceled = false
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(new Uint8Array(maxResponseBytes))
            controller.enqueue(new Uint8Array(1))
          },
          cancel: () => {
            canceled = true
          },
        })
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body))
        const failure = yield* nativeRequest(connection)(request).pipe(
          Effect.provideService(FetchHttpClient.Fetch, fetch),
          Effect.flip,
        )
        expect(failure.reason).toBe("invalid-response")
        expect(canceled).toBe(true)
        expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
      }),
    )

    for (const finish of ["timeout", "interruption"] as const) {
      test.effect(`cancels a stalled response body on ${finish}`, () =>
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>()
          let canceled = false
          const body = new ReadableStream<Uint8Array>(
            {
              pull: () => {
                Deferred.doneUnsafe(entered, Effect.void)
              },
              cancel: () => {
                canceled = true
              },
            },
            { highWaterMark: 0 },
          )
          const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(body))
          const pending = yield* nativeRequest(connection)(request).pipe(
            Effect.provideService(FetchHttpClient.Fetch, fetch),
            Effect.forkChild({ startImmediately: true }),
          )
          yield* Deferred.await(entered)
          if (finish === "timeout") {
            yield* TestClock.adjust("60 seconds")
            expect((yield* Fiber.join(pending).pipe(Effect.flip)).reason).toBe("timeout")
          } else {
            yield* Fiber.interrupt(pending)
          }
          expect(canceled).toBe(true)
          expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true)
        }),
      )
    }
  })
})
