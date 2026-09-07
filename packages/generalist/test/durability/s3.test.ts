import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { type GetObjectCommandOutput } from "@aws-sdk/client-s3"
import { vi } from "vitest"
import { make, makeMaintenance, type Client, type ConnectionOptions } from "../../src/durability/s3.js"

const capabilities = { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true } as const
const credentials = { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key", sessionToken: "temporary-token" }
const connection = {
  bucket: "durability-test",
  region: "us-east-1",
  forcePathStyle: true,
  credentials,
  capabilities,
} satisfies ConnectionOptions

const xmlError = (response: ServerResponse, status: number, code: string) => {
  response.writeHead(status, { "content-type": "application/xml" })
  response.end(`<Error><Code>${code}</Code><Message>Object request failed</Message></Error>`)
}

const withServer = async (
  handle: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  run: (endpoint: string) => Promise<void>,
) => {
  const server = createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch(() => response.destroy())
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  try {
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP server address")
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    server.closeAllConnections()
    await closed
  }
}

const receiveBytes = async (request: IncomingMessage) => {
  const chunks: Array<Uint8Array> = []
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  return new Uint8Array(Buffer.concat(chunks))
}

const injected = (overrides: Partial<Client>): Client => ({
  guarantees: { singleAttempt: true, noRedirects: true },
  getObject: async () => { throw new Error("Unexpected read") },
  createObject: async () => { throw new Error("Unexpected create") },
  listObjects: async () => { throw new Error("Unexpected listing") },
  ...overrides,
})

// The advanced-client seam exposes the SDK's streaming conversion, never a full-body collector.
const objectResponse = (bytes: Uint8Array, contentLength = bytes.byteLength): GetObjectCommandOutput => ({
  $metadata: { httpStatusCode: 200 },
  ETag: '"opaque-etag-not-a-digest"',
  ContentLength: contentLength,
  Body: { transformToWebStream: () => new Response(bytes).body! } as GetObjectCommandOutput["Body"],
})

describe("S3 object durability transport", () => {
  it("addresses a virtual-host custom endpoint and signs with refreshed session credentials", async () => {
    const requests: Array<Request> = []
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (!(input instanceof Request)) throw new Error("Expected the SDK's signed Request")
      requests.push(input)
      return new Response(new Uint8Array([1]), { headers: { etag: '"virtual-token"', "content-length": "1" } })
    })
    try {
      const store = await Effect.runPromise(make({
        ...connection,
        endpoint: "https://objects.example.test",
        forcePathStyle: false,
        credentials: async () => ({ ...credentials, sessionToken: "refreshed-session-token" }),
      }))
      expect(await Effect.runPromise(store.read("雪 +%", { maxBytes: 1024 }))).toEqual({ bytes: new Uint8Array([1]), etag: '"virtual-token"' })
      const url = new URL(requests[0]!.url)
      expect(url.host).toBe("durability-test.objects.example.test")
      expect(url.pathname).toBe("/%E9%9B%AA%20%2B%25")
      expect(requests[0]!.headers.get("x-amz-security-token")).toBe("refreshed-session-token")
      expect(requests[0]!.headers.get("authorization")).toContain("/us-east-1/s3/aws4_request")
    } finally {
      fetch.mockRestore()
    }
  })

  it("signs temporary credentials and preserves escaped Unicode keys and complete binary bytes without overwrites", async () => {
    const key = "commits/雪 +?#%/literal%2F.json"
    const bytes = new Uint8Array([0, 255, 1, 128, 10])
    const objects = new Map<string, Uint8Array>()
    const requests: Array<{ path: string; authorization: string; token: string | string[] | undefined }> = []
    await withServer(async (request, response) => {
      const path = new URL(request.url!, "http://localhost").pathname
      requests.push({ path, authorization: request.headers.authorization ?? "", token: request.headers["x-amz-security-token"] })
      if (request.method === "PUT") {
        const received = await receiveBytes(request)
        if (request.headers["if-none-match"] !== "*") return xmlError(response, 400, "InvalidRequest")
        if (objects.has(path)) return xmlError(response, 412, "PreconditionFailed")
        objects.set(path, received)
        response.writeHead(200, { etag: '"opaque-token"' })
        response.end()
      } else {
        const object = objects.get(path)
        if (object === undefined) return xmlError(response, 404, "NoSuchKey")
        response.writeHead(200, { etag: '"opaque-token"', "content-length": object.byteLength })
        response.write(object.subarray(0, 2))
        response.end(object.subarray(2))
      }
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect(await Effect.runPromise(store.create(key, bytes))).toBe("created")
      expect(await Effect.runPromise(store.create(key, new Uint8Array([42])))).toBe("conflict")
      expect(await Effect.runPromise(store.read(key, { maxBytes: 1024 }))).toEqual({ bytes, etag: '"opaque-token"' })
      expect(requests.map((request) => request.path)).toEqual(Array(3).fill(
        "/durability-test/commits/%E9%9B%AA%20%2B%3F%23%25/literal%252F.json",
      ))
      for (const request of requests) {
        expect(request.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/us-east-1\/s3\/aws4_request, /)
        expect(request.authorization).toMatch(/Signature=[a-f0-9]{64}$/)
        expect(request.token).toBe(credentials.sessionToken)
      }
      expect(requests[0]!.authorization).toContain("if-none-match")
    })
  })

  it("does not retry a committed PUT whose acknowledgement is lost and permits explicit reconciliation", async () => {
    let stored: Uint8Array | undefined
    let writes = 0
    await withServer(async (request, response) => {
      if (request.method === "PUT") {
        writes += 1
        stored = await receiveBytes(request)
        response.destroy()
      } else {
        response.writeHead(200, { etag: '"committed"', "content-length": stored!.byteLength })
        response.end(stored)
      }
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      const bytes = new TextEncoder().encode("committed-before-disconnect")
      const error = await Effect.runPromise(Effect.flip(store.create("commits/0000", bytes)))
      expect(error.reason).toBe("unavailable")
      expect(writes).toBe(1)
      expect(await Effect.runPromise(store.read("commits/0000", { maxBytes: 1024 }))).toEqual({ bytes, etag: '"committed"' })
    })
  })

  it("paginates through an empty truncated page and decodes URL-encoded keys exactly once", async () => {
    const prefix = "prefix/"
    const key = "prefix/雪 +?#%/literal%2F/\u0001"
    const cursor = "opaque+/%=token"
    const received: Array<string | null> = []
    await withServer((request, response) => {
      const query = new URL(request.url!, "http://localhost").searchParams
      received.push(query.get("continuation-token"))
      response.writeHead(200, { "content-type": "application/xml" })
      if (query.get("prefix") !== prefix || query.get("encoding-type") !== "url") {
        response.end("<invalid />")
        return
      }
      response.end(query.has("continuation-token")
        ? `<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>false</IsTruncated><NextContinuationToken>ignore-stale-token</NextContinuationToken><Contents><Key>${encodeURIComponent(key)}</Key></Contents></ListBucketResult>`
        : `<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextContinuationToken>${cursor}</NextContinuationToken></ListBucketResult>`)
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect(await Effect.runPromise(store.list(prefix))).toEqual({ keys: [], cursor })
      expect(await Effect.runPromise(store.list(prefix, cursor))).toEqual({ keys: [key] })
      expect(received).toEqual([null, cursor])
    })
  })

  it("rejects nonadvancing listing cursors instead of silently hiding later objects", async () => {
    const store = await Effect.runPromise(make({ ...connection, client: injected({
      listObjects: async () => ({ $metadata: {}, IsTruncated: true, NextContinuationToken: "same-token", Contents: [] }),
    }) }))
    const error = await Effect.runPromise(Effect.flip(store.list("commits/", "same-token")))
    expect(error.reason).toBe("invalid-response")
  })

  it("distinguishes a missing object from a missing bucket and authorization failure", async () => {
    await withServer((request, response) => {
      const path = new URL(request.url!, "http://localhost").pathname
      if (path.endsWith("/missing-key")) return xmlError(response, 404, "NoSuchKey")
      if (path.endsWith("/missing-bucket")) return xmlError(response, 404, "NoSuchBucket")
      xmlError(response, 403, "AccessDenied")
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect(await Effect.runPromise(store.read("missing-key", { maxBytes: 1024 }))).toBeUndefined()
      expect((await Effect.runPromise(Effect.flip(store.read("missing-bucket", { maxBytes: 1024 })))).reason).toBe("invalid-response")
      expect((await Effect.runPromise(Effect.flip(store.read("forbidden", { maxBytes: 1024 })))).reason).toBe("authentication")
    })
  })

  it("classifies a throttled create without retrying or weakening its condition", async () => {
    let requests = 0
    let condition: string | string[] | undefined
    await withServer((request, response) => {
      requests += 1
      condition = request.headers["if-none-match"]
      xmlError(response, 503, "SlowDown")
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect((await Effect.runPromise(Effect.flip(store.create("commit", new Uint8Array([1]))))).reason).toBe("rate-limit")
      expect(requests).toBe(1)
      expect(condition).toBe("*")
    })
  })

  it("does not mistake a conditional-write/delete race for an existing committed object", async () => {
    await withServer((_request, response) => xmlError(response, 409, "ConditionalRequestConflict"), async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect((await Effect.runPromise(Effect.flip(store.create("commit", new Uint8Array([1]))))).reason).toBe("unavailable")
    })
  })

  it("aborts a read whose response body stalls after headers and reports the deadline", async () => {
    let aborted = false
    let started!: () => void
    const bodyStarted = new Promise<void>((resolve) => { started = resolve })
    const store = await Effect.runPromise(make({ ...connection, requestTimeoutMs: 25, client: injected({
      getObject: async (_input, signal) => {
        signal.addEventListener("abort", () => { aborted = true }, { once: true })
        return {
          ...objectResponse(new Uint8Array()),
          Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
            pull() {
              started()
              return new Promise<void>(() => {})
            },
          }, { highWaterMark: 0 }) } as GetObjectCommandOutput["Body"],
        }
      },
    }) }))
    const pending = Effect.runPromise(Effect.flip(store.read("stalled", { maxBytes: 1024 })))
    await bodyStarted
    expect((await pending).reason).toBe("timeout")
    expect(aborted).toBe(true)
  })

  it("propagates Effect interruption to an in-flight signed HTTP read", async () => {
    let received!: () => void
    let disconnected!: () => void
    const started = new Promise<void>((resolve) => { received = resolve })
    const closed = new Promise<void>((resolve) => { disconnected = resolve })
    await withServer((_request, response) => {
      response.on("close", disconnected)
      response.writeHead(200, { etag: '"pending"', "content-length": 4 })
      response.flushHeaders()
      received()
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      const controller = new AbortController()
      const pending = Effect.runPromiseExit(store.read("pending", { maxBytes: 1024 }), { signal: controller.signal })
      await started
      controller.abort()
      expect((await pending)._tag).toBe("Failure")
      await closed
    })
  })

  it("refuses redirects before signed headers or temporary credentials reach another endpoint", async () => {
    let leakedRequests = 0
    let originalRequests = 0
    await withServer((_request, response) => {
      leakedRequests += 1
      response.end()
    }, async (unrelatedEndpoint) => {
      await withServer((_request, response) => {
        originalRequests += 1
        response.writeHead(307, { location: `${unrelatedEndpoint}/credential-target`, "x-amz-bucket-region": "us-west-2" })
        response.end()
      }, async (endpoint) => {
        const store = await Effect.runPromise(make({ ...connection, endpoint }))
        const error = await Effect.runPromise(Effect.flip(store.create("commit", new Uint8Array([1]))))
        expect(error.reason).toBe("unavailable")
        expect(originalRequests).toBe(1)
        expect(leakedRequests).toBe(0)
      })
    })
  })

  it("rejects incompatible provider or injected-client guarantees during initialization", async () => {
    const badProvider = await Effect.runPromise(Effect.flip(make({
      ...connection,
      capabilities: { ...capabilities, conditionalCreate: false },
    })))
    expect(badProvider.reason).toBe("invalid-response")
    const missingGuarantees = await Effect.runPromise(Effect.flip(make({
      bucket: connection.bucket, region: connection.region, endpoint: "https://objects.example.test",
    })))
    expect(missingGuarantees.reason).toBe("invalid-response")
    const retryingClient = await Effect.runPromise(Effect.flip(make({ ...connection, client: injected({
      guarantees: { singleAttempt: false, noRedirects: true },
    }) })))
    expect(retryingClient.reason).toBe("invalid-response")
    const redirectingClient = await Effect.runPromise(Effect.flip(make({ ...connection, client: injected({
      guarantees: { singleAttempt: true, noRedirects: false },
    }) })))
    expect(redirectingClient.reason).toBe("invalid-response")
  })

  it("rejects credential-bearing endpoint URLs without sending a request", async () => {
    const error = await Effect.runPromise(Effect.flip(make({
      ...connection, endpoint: "https://username:password@objects.example.test",
    })))
    expect(error.reason).toBe("invalid-response")
  })

  it("rejects truncated bytes instead of accepting a corrupt canonical object", async () => {
    const store = await Effect.runPromise(make({ ...connection, client: injected({
      getObject: async () => objectResponse(new Uint8Array([1, 2]), 3),
    }) }))
    expect((await Effect.runPromise(Effect.flip(store.read("commit", { maxBytes: 1024 })))).reason).toBe("invalid-response")
  })

  it("accepts a bounded chunked response with no declared size", async () => {
    await withServer((_request, response) => {
      response.writeHead(200, { etag: '"chunked"' })
      response.write(new Uint8Array([1, 2]))
      response.end(new Uint8Array([3, 4]))
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect(await Effect.runPromise(store.read("chunked", { maxBytes: 4 }))).toEqual({
        bytes: new Uint8Array([1, 2, 3, 4]), etag: '"chunked"',
      })
    })
  })

  for (const declaredSize of [undefined, 1]) {
    it(`cancels overflow without pulling the remaining body when Content-Length is ${declaredSize}`, async () => {
      let pulls = 0
      let canceled = false
      let aborted = false
      const store = await Effect.runPromise(make({ ...connection, client: injected({
        getObject: async (_input, signal) => {
          signal.addEventListener("abort", () => { aborted = true }, { once: true })
          return {
            ...objectResponse(new Uint8Array()),
            ContentLength: declaredSize,
            Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
              pull(controller) {
                pulls += 1
                controller.enqueue(new Uint8Array([1, 2, 3]))
              },
              cancel() { canceled = true },
            }, { highWaterMark: 0 }) } as GetObjectCommandOutput["Body"],
          }
        },
      }) }))
      expect((await Effect.runPromise(Effect.flip(store.read("oversized", { maxBytes: 2 })))).reason).toBe("limit")
      expect(pulls).toBe(1)
      expect(canceled).toBe(true)
      expect(aborted).toBe(true)
    })
  }

  it("rejects an oversized declared body before reading any chunks", async () => {
    let pulls = 0
    let canceled = false
    const store = await Effect.runPromise(make({ ...connection, client: injected({
      getObject: async () => ({
        ...objectResponse(new Uint8Array(), 3),
        Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls += 1
            controller.enqueue(new Uint8Array([1, 2, 3]))
          },
          cancel() { canceled = true },
        }, { highWaterMark: 0 }) } as GetObjectCommandOutput["Body"],
      }),
    }) }))
    expect((await Effect.runPromise(Effect.flip(store.read("oversized", { maxBytes: 2 })))).reason).toBe("limit")
    expect(pulls).toBe(0)
    expect(canceled).toBe(true)
  })

  it("reads the requested range, allowing short bytes only at EOF", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5])
    await withServer((request, response) => {
      const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "")
      if (range === null) return xmlError(response, 400, "InvalidRequest")
      const start = Number(range[1])
      const end = Math.min(Number(range[2]), bytes.byteLength - 1)
      response.writeHead(206, { etag: '"ranged"', "content-range": `bytes ${start}-${end}/${bytes.byteLength}` })
      response.end(bytes.subarray(start, end + 1))
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect(await Effect.runPromise(store.read("range", { maxBytes: 2, range: { offset: 1, length: 2 } }))).toEqual({
        bytes: new Uint8Array([1, 2]), etag: '"ranged"',
      })
      expect(await Effect.runPromise(store.read("range", { maxBytes: 4, range: { offset: 4, length: 4 } }))).toEqual({
        bytes: new Uint8Array([4, 5]), etag: '"ranged"',
      })
    })
  })

  for (const [name, status, contentRange] of [
    ["ignored range", 200, undefined],
    ["wrong offset", 206, "bytes 0-1/10"],
    ["short before EOF", 206, "bytes 2-3/10"],
    ["unknown total", 206, "bytes 2-3/*"],
    ["unsolicited partial body", 200, "bytes 2-5/10"],
  ] as const) {
    it(`rejects ${name} instead of returning bytes from a different range`, async () => {
      const store = await Effect.runPromise(make({ ...connection, client: injected({
        getObject: async () => ({
          ...objectResponse(new Uint8Array([2, 3])),
          $metadata: { httpStatusCode: status },
          ContentRange: contentRange,
        }),
      }) }))
      expect((await Effect.runPromise(Effect.flip(store.read("range", {
        maxBytes: 4, range: { offset: 2, length: 4 },
      })))).reason).toBe("invalid-response")
    })
  }

  it("does not treat an unsatisfiable range as a missing object", async () => {
    await withServer((_request, response) => xmlError(response, 416, "InvalidRange"), async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      expect((await Effect.runPromise(Effect.flip(store.read("range", {
        maxBytes: 4, range: { offset: 10, length: 4 },
      })))).reason).toBe("invalid-response")
    })
  })

  it("validates byte budgets and safe range arithmetic before sending a read", async () => {
    let reads = 0
    const store = await Effect.runPromise(make({ ...connection, client: injected({
      getObject: async () => { reads += 1; return objectResponse(new Uint8Array()) },
    }) }))
    for (const readOptions of [
      { maxBytes: 0 },
      { maxBytes: Number.NaN },
      { maxBytes: Number.MAX_SAFE_INTEGER + 1 },
      { maxBytes: 4, range: { offset: -1, length: 1 } },
      { maxBytes: 4, range: { offset: 0, length: 0 } },
      { maxBytes: 4, range: { offset: 0, length: 5 } },
      { maxBytes: 4, range: { offset: Number.MAX_SAFE_INTEGER, length: 1 } },
    ]) {
      expect((await Effect.runPromise(Effect.flip(store.read("range", readOptions)))).reason).toBe("invalid-response")
    }
    expect(reads).toBe(0)
  })

  it("rejects dot-only path segments rather than reading or writing a normalized sibling key", async () => {
    const store = await Effect.runPromise(make({ ...connection, client: injected({}) }))
    expect((await Effect.runPromise(Effect.flip(store.read("commits/../other", { maxBytes: 1024 })))).reason).toBe("invalid-response")
    expect((await Effect.runPromise(Effect.flip(store.create("commits/./other", new Uint8Array())))).reason).toBe("invalid-response")
  })

  it("uses separately authorized maintenance deletion without giving runtime creates deletion authority", async () => {
    let object: Uint8Array | undefined
    let deletionAuthorization = ""
    await withServer(async (request, response) => {
      if (request.method === "PUT") {
        if (request.headers["if-none-match"] !== "*") return xmlError(response, 400, "InvalidRequest")
        object = await receiveBytes(request)
        response.writeHead(200, { etag: '"snapshot"' })
        response.end()
      } else if (request.method === "DELETE") {
        deletionAuthorization = request.headers.authorization ?? ""
        if (!deletionAuthorization.includes("Credential=maintenance-access-key/")) return xmlError(response, 403, "AccessDenied")
        object = undefined
        response.writeHead(204)
        response.end()
      } else if (object === undefined) {
        xmlError(response, 404, "NoSuchKey")
      } else {
        response.writeHead(200, { etag: '"snapshot"', "content-length": object.byteLength })
        response.end(object)
      }
    }, async (endpoint) => {
      const store = await Effect.runPromise(make({ ...connection, endpoint }))
      const maintenance = await Effect.runPromise(makeMaintenance({
        ...connection, endpoint, credentials: { ...credentials, accessKeyId: "maintenance-access-key" },
      }))
      await Effect.runPromise(store.create("old-snapshot", new Uint8Array([1])))
      await Effect.runPromise(maintenance.remove("old-snapshot"))
      expect(await Effect.runPromise(store.read("old-snapshot", { maxBytes: 1024 }))).toBeUndefined()
      expect(deletionAuthorization).toContain("Credential=maintenance-access-key/")
    })
  })
})
