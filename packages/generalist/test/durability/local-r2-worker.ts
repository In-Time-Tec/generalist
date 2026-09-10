import { Crypto, Effect, PlatformError, Schema } from "effect"
import { type Bucket, make } from "../../src/durability/r2.js"
import { append, exercise, objectConformance, open } from "./local-operations.js"

const cryptoService = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.tryPromise({
      try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
      catch: (cause) => PlatformError.systemError({ module: "Crypto", method: "digest", _tag: "Unknown", cause }),
    }).pipe(Effect.map((buffer) => new Uint8Array(buffer))),
})

// Miniflare's bundled workerd turns an exact-EOF or out-of-range offset into a malformed 500
// rather than production R2's InvalidRange (10039). Reproduce the production contract at the
// harness boundary so the adapter's typed invalid-response mapping is exercised faithfully.
const faithfulRanges = (bucket: Bucket): Bucket => ({
  get: (key, options) => {
    const range = options?.range
    const read = () => bucket.get(key, options)
    if (range === undefined) return read()
    return bucket.get(key).then((probe) => {
      if (probe === null || range.offset < 0 || range.offset >= probe.size || range.length <= 0) {
        throw new Error("get: Requested byte range is not satisfiable. (10039)")
      }
      return read()
    })
  },
  put: (key, value, options) => bucket.put(key, value, options),
  list: (options) => bucket.list(options),
})

export default {
  fetch(request: Request, environment: { readonly BUCKET: Bucket }): Promise<Response> {
    return Effect.gen(function* () {
      const bucket = faithfulRanges(environment.BUCKET)
      const store = make(bucket)
      if (new URL(request.url).pathname === "/conformance") {
        yield* objectConformance(Effect.sync(() => make(bucket)))
        return Response.json({ result: "passed" })
      }
      if (new URL(request.url).pathname === "/range-boundaries") {
        yield* store.create("range-boundaries", new Uint8Array([1, 2, 3]))
        const failures = yield* Effect.forEach([3, 4], (offset) =>
          store
            .read("range-boundaries", {
              maxBytes: 1,
              range: { offset, length: 1 },
            })
            .pipe(
              Effect.flip,
              Effect.map((error) => ({ offset, reason: error.reason })),
            ),
        )
        return Response.json(failures)
      }
      if (new URL(request.url).pathname === "/exercise")
        return Response.json(yield* exercise(Effect.sync(() => make(bucket))))
      if (new URL(request.url).pathname === "/contend")
        return Response.json(yield* append({ store, id: "native-interop" }))
      const journal = yield* open(store)
      const head = yield* journal.read
      const retained = yield* journal.commit({ id: "after-restart", input: null }, () =>
        Effect.die("S3 command redispatched through native R2"),
      )
      yield* Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Literal(6) }))(retained)
      return Response.json(head)
    }).pipe(Effect.provideService(Crypto.Crypto, cryptoService), Effect.runPromise)
  },
}
