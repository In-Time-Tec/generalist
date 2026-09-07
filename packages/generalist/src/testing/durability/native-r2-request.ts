import { Effect, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from "effect/unstable/http"
import type { NativeR2Configuration } from "./native-r2-configuration.js"
import {
  NativeR2Failure,
  NativeR2Request,
  NativeR2Response,
  isNativeR2Reason,
  maxResponseBytes,
} from "./native-r2-worker.js"

const failureReason = Schema.Struct({ reason: Schema.Unknown })
const json = Schema.fromJsonString(Schema.Unknown)
const transportFailure = (error: HttpClientError.HttpClientError): NativeR2Failure => {
  const cause = "cause" in error.reason ? error.reason.cause : undefined
  if (Schema.is(NativeR2Failure)(cause)) return cause
  if (cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError")) {
    return NativeR2Failure.make({ reason: "timeout" })
  }
  return NativeR2Failure.make({ reason: "transport" })
}

export const nativeRequest =
  (configuration: Pick<NativeR2Configuration, "endpoint" | "token">) =>
  (request: NativeR2Request): Effect.Effect<NativeR2Response, NativeR2Failure, HttpClient.HttpClient> =>
    Effect.gen(function* () {
      const client = HttpClient.withScope(yield* HttpClient.HttpClient)
      const prepared = yield* HttpClientRequest.post(new URL("/qualification", configuration.endpoint).toString()).pipe(
        HttpClientRequest.setHeader("authorization", `Bearer ${configuration.token}`),
        HttpClientRequest.schemaBodyJson(NativeR2Request)(request),
        Effect.mapError(() => NativeR2Failure.make({ reason: "transport" })),
      )
      const response = yield* client.execute(prepared).pipe(Effect.mapError(transportFailure))
      const length = response.headers["content-length"]
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes)) {
        return yield* NativeR2Failure.make({ reason: "invalid-response" })
      }
      const chunks: Array<Uint8Array> = []
      let size = 0
      yield* response.stream.pipe(
        Stream.catchTag("HttpClientError", (error) =>
          error.reason._tag === "EmptyBodyError" ? Stream.empty : Stream.fail(transportFailure(error)),
        ),
        Stream.runForEach((chunk) =>
          Effect.gen(function* () {
            if (!(chunk instanceof Uint8Array) || chunk.byteLength > maxResponseBytes - size) {
              return yield* NativeR2Failure.make({ reason: "invalid-response" })
            }
            if (chunk.byteLength > 0) chunks.push(chunk)
            size += chunk.byteLength
          }),
        ),
      )
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      const text = new TextDecoder().decode(bytes)
      if (response.status < 200 || response.status >= 300) {
        const parsed = yield* Schema.decodeEffect(json)(text).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(failureReason)),
          Effect.option,
        )
        const fallback = response.status === 401 || response.status === 403 ? "authentication" : "transport"
        return yield* NativeR2Failure.make({
          reason: parsed._tag === "Some" && isNativeR2Reason(parsed.value.reason) ? parsed.value.reason : fallback,
        })
      }
      return yield* Schema.decodeEffect(Schema.fromJsonString(NativeR2Response), { onExcessProperty: "error" })(
        text,
      ).pipe(Effect.mapError(() => NativeR2Failure.make({ reason: "invalid-response" })))
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: "60 seconds",
        orElse: () => Effect.fail(NativeR2Failure.make({ reason: "timeout" })),
      }),
      Effect.catchDefect(() => Effect.fail(NativeR2Failure.make({ reason: "transport" }))),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    )
