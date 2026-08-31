import { describe, expect, it } from "@effect/vitest"
import { Crypto, Effect, Encoding, Layer, Schema } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { SkillCatalog } from "generalist"
import { GitHubCatalog, HttpCatalog, S3Catalog } from "../../../src/instructions/skills/index"

const hostedCatalogIsInternal: "HostedCatalog" extends keyof typeof import("../../../src/instructions/skills/index")
  ? false
  : true = true
const httpSourceIsInternal: "source" extends keyof HttpCatalog.Options ? false : true = true
const s3SourceIsInternal: "source" extends keyof S3Catalog.Options ? false : true = true
const githubSourceIsInternal: "source" extends keyof GitHubCatalog.Options ? false : true = true
const digestBytes = new Uint8Array(32).fill(1)
const digest = Encoding.encodeHex(digestBytes)
const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const secretSource = "https://user:password@example.invalid/catalog?token=SECRET#fragment"

const withSecretSource = <Options extends object>(options: Options): Options => ({ ...options, source: secretSource })

const expectSafeError = (failure: SkillCatalog.SkillCatalogError, source: string) => {
  const encoded = stringify(failure)
  expect(failure.source).toBe(source)
  expect(failure.cause).toBeUndefined()
  expect(encoded).not.toContain("user")
  expect(encoded).not.toContain("password")
  expect(encoded).not.toContain("token")
  expect(encoded).not.toContain("SECRET")
  expect(encoded).not.toContain("fragment")
}

const provideTestLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

const cryptoLayer = (bytes: Uint8Array = digestBytes) =>
  Layer.succeed(
    Crypto.Crypto,
    Crypto.make({
      randomBytes: (size) => new Uint8Array(size),
      digest: () => Effect.succeed(bytes),
    }),
  )

const httpLayer = (
  responses: Readonly<
    Record<string, { readonly body: string | Uint8Array | ReadableStream<Uint8Array>; readonly status?: number }>
  >,
  requests: Array<{ readonly url: string; readonly accept: string | undefined }>,
) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      const target = url.toString()
      requests.push({ url: target, accept: request.headers.accept })
      const response = responses[target]
      const body = response?.body instanceof Uint8Array ? new Uint8Array(response.body) : response?.body
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(body ?? "missing", {
            status: response?.status ?? (response === undefined ? 404 : 200),
          }),
        ),
      )
    }),
  )

const document = `---
name: remote
description: Remote review skill
allowed-tools: read grep
---
# Remote body
Review carefully.
`

const manifest = (skillPath: string = "remote/SKILL.md", sha256: string = digest) =>
  stringify({
    version: 1,
    skills: [
      {
        name: "remote",
        description: "Remote review skill",
        allowedTools: ["read", "grep"],
        skillPath,
        sha256,
      },
    ],
  })

describe("hosted skill catalogs", () => {
  it("keeps hosted construction and diagnostic identifiers out of the public boundary", () => {
    expect(hostedCatalogIsInternal).toBe(true)
    expect(httpSourceIsInternal).toBe(true)
    expect(s3SourceIsInternal).toBe(true)
    expect(githubSourceIsInternal).toBe(true)
  })

  it.effect("ignores untyped caller diagnostic identifiers on provider validation failures", () =>
    Effect.gen(function* () {
      const [httpFailure, s3Failure, githubFailure] = yield* Effect.all(
        [
          Effect.flip(HttpCatalog.make(withSecretSource({ manifestUrl: "not a URL" }))),
          Effect.flip(S3Catalog.make(withSecretSource({ bucket: "company.skills", region: "us-west-2" }))),
          Effect.flip(
            GitHubCatalog.make(withSecretSource({ owner: "acme", repo: "agent-skills", ref: "main", root: "skills" })),
          ),
        ],
        { concurrency: 3 },
      )

      expectSafeError(httpFailure, "http-skill-catalog")
      expectSafeError(s3Failure, "s3-skill-catalog")
      expectSafeError(githubFailure, "github-skill-catalog")
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), httpLayer({}, [])))),
  )

  it.effect("does not forward untyped implementation options into hosted requests", () => {
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    const reads = { source: 0, manifestHeaders: 0, bodyHeaders: 0 }
    const options = Object.defineProperties(
      { manifestUrl },
      {
        source: {
          enumerable: true,
          get: () => {
            reads.source += 1
            return secretSource
          },
        },
        manifestHeaders: {
          enumerable: true,
          get: () => {
            reads.manifestHeaders += 1
            return { authorization: `Bearer ${secretSource}` }
          },
        },
        bodyHeaders: {
          enumerable: true,
          get: () => {
            reads.bodyHeaders += 1
            return { authorization: `Bearer ${secretSource}` }
          },
        },
      },
    ) satisfies HttpCatalog.Options
    const authorizations: Array<string | undefined> = []
    const urls: Array<string> = []
    const recordingHttp = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) => {
        authorizations.push(request.headers.authorization)
        const target = url.toString()
        urls.push(target)
        const body = target === manifestUrl ? manifest() : document
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body)))
      }),
    )
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make(options)
      yield* (yield* source.get("remote"))!.instructions

      expect(reads).toEqual({ source: 0, manifestHeaders: 0, bodyHeaders: 0 })
      expect(authorizations).toEqual([undefined, undefined])
      expect(urls).toEqual([manifestUrl, bodyUrl])
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), recordingHttp)))
  })

  it.effect("redacts decorated transport failures", () => {
    const manifestUrl = "https://user:password@skills.example/catalog.json?token=SECRET#fragment"
    const transport = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause: secretSource }),
        }),
      ),
    ).pipe(HttpClient.mapRequest(HttpClientRequest.setHeader("authorization", `Bearer ${secretSource}`)))
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))

      expectSafeError(failure, "https://skills.example/catalog.json")
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), Layer.succeed(HttpClient.HttpClient, transport))))
  })

  it.effect("redacts scheme-like hosted paths that escape the manifest origin", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog.json"
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))

      expectSafeError(failure, manifestUrl)
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [manifestUrl]: { body: manifest("http:SECRET/remote/SKILL.md") } }, requests),
        ),
      ),
    )
  })

  it.effect("keeps secret-like invalid provider components out of diagnostics", () =>
    Effect.gen(function* () {
      const commit = "a".repeat(40)
      const failures = yield* Effect.all(
        [
          Effect.flip(S3Catalog.make({ bucket: secretSource, region: "us-west-2" })),
          Effect.flip(S3Catalog.make({ bucket: "company-skills", region: secretSource })),
          Effect.flip(S3Catalog.make({ bucket: "company-skills", region: "us-west-2", prefix: secretSource })),
          Effect.flip(S3Catalog.make({ bucket: "company-skills", region: "us-west-2", manifestName: secretSource })),
          Effect.flip(GitHubCatalog.make({ owner: "acme", repo: "agent-skills", ref: secretSource })),
          Effect.flip(GitHubCatalog.make({ owner: "acme", repo: "agent-skills", ref: commit, root: secretSource })),
          Effect.flip(
            GitHubCatalog.make({ owner: "acme", repo: "agent-skills", ref: commit, manifestName: secretSource }),
          ),
        ],
        { concurrency: 3 },
      )

      expectSafeError(failures[0], "s3-skill-catalog")
      expectSafeError(failures[1], "s3-skill-catalog")
      expectSafeError(failures[2], "s3-skill-catalog")
      expectSafeError(failures[3], "s3://company-skills/")
      expectSafeError(failures[4], "github-skill-catalog")
      expectSafeError(failures[5], `github:acme/agent-skills@${commit}`)
      expectSafeError(failures[6], `github:acme/agent-skills@${commit}`)
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), httpLayer({}, [])))),
  )

  it.effect("ignores untyped caller diagnostic identifiers on hosted fetch failures", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const commit = "a".repeat(40)
    const httpUrl = "https://skills.example/catalog/skills.json"
    const s3Url = "https://company-skills.s3.us-west-2.amazonaws.com/skills.json"
    const githubUrl = `https://api.github.com/repos/acme/agent-skills/contents/skills.json?ref=${commit}`
    return Effect.gen(function* () {
      const [httpFailure, s3Failure, githubFailure] = yield* Effect.all(
        [
          Effect.flip(HttpCatalog.make(withSecretSource({ manifestUrl: httpUrl }))),
          Effect.flip(S3Catalog.make(withSecretSource({ bucket: "company-skills", region: "us-west-2" }))),
          Effect.flip(GitHubCatalog.make(withSecretSource({ owner: "acme", repo: "agent-skills", ref: commit }))),
        ],
        { concurrency: 3 },
      )

      expectSafeError(httpFailure, httpUrl)
      expectSafeError(s3Failure, "s3://company-skills/")
      expectSafeError(githubFailure, `github:acme/agent-skills@${commit}`)
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer(
            {
              [httpUrl]: { body: "forbidden", status: 403 },
              [s3Url]: { body: "forbidden", status: 403 },
              [githubUrl]: { body: "forbidden", status: 403 },
            },
            requests,
          ),
        ),
      ),
    )
  })

  it.effect("loads HTTP metadata once and keeps verified SKILL.md bodies lazy", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl })
      const all = yield* source.all

      expect(all.map((skill) => skill.name)).toEqual(["remote"])
      expect(requests.map((request) => request.url)).toEqual([manifestUrl])

      const body = yield* all[0]!.instructions

      expect(body).toContain("# Remote body")
      expect(requests.map((request) => request.url)).toEqual([manifestUrl, bodyUrl])
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [manifestUrl]: { body: manifest() }, [bodyUrl]: { body: document } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects unsafe hosted paths during catalog construction", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))

      expect(failure._tag).toBe("generalist/core/SkillCatalogError")
      expect(failure.source).toBe(manifestUrl)
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(cryptoLayer(), httpLayer({ [manifestUrl]: { body: manifest("../escape/SKILL.md") } }, requests)),
      ),
    )
  })

  it.effect("fails digest mismatches on activation and allows a later retry", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl })
      const skill = yield* source.get("remote")
      const first = yield* Effect.exit(skill!.instructions)
      const second = yield* Effect.exit(skill!.instructions)

      expect(first._tag).toBe("Failure")
      expect(second._tag).toBe("Failure")
      expect(requests.filter((request) => request.url === bodyUrl)).toHaveLength(2)
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(new Uint8Array(32).fill(2)),
          httpLayer({ [manifestUrl]: { body: manifest() }, [bodyUrl]: { body: document } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects frontmatter drift after a verified body fetch", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    const drifted = document.replace("Remote review skill", "Changed after publication")
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl })
      const skill = yield* source.get("remote")
      const failure = yield* Effect.flip(skill!.instructions)

      expect(failure._tag).toBe("generalist/core/SkillCatalogError")
      expect(failure.message).toContain("Frontmatter mismatch")
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [manifestUrl]: { body: manifest() }, [bodyUrl]: { body: drifted } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects duplicate names and bounded manifest overflows", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const duplicateUrl = "https://skills.example/duplicate.json"
    const limitedUrl = "https://skills.example/limited.json"
    const entry = {
      name: "remote",
      description: "Remote review skill",
      allowedTools: ["read", "grep"],
      skillPath: "remote/SKILL.md",
      sha256: digest,
    }
    const duplicate = stringify({
      version: 1,
      skills: [entry, entry],
    })
    return Effect.gen(function* () {
      const duplicateFailure = yield* Effect.flip(HttpCatalog.make({ manifestUrl: duplicateUrl }))
      const limitedFailure = yield* Effect.flip(HttpCatalog.make({ manifestUrl: limitedUrl, manifestMaxBytes: 1 }))

      expect(duplicateFailure.message).toContain("Duplicate hosted skill name")
      expect(limitedFailure.message).toContain("exceeds 1 bytes")
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [duplicateUrl]: { body: duplicate }, [limitedUrl]: { body: manifest() } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects hosted descriptions outside the shared frontmatter bound", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/invalid-description.json"
    const invalid = stringify({
      version: 1,
      skills: [
        {
          name: "remote",
          description: "x".repeat(SkillCatalog.descriptionLimit + 1),
          skillPath: "remote/SKILL.md",
          sha256: digest,
        },
      ],
    })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))

      expect(failure.message).toContain("Invalid hosted skill manifest")
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), httpLayer({ [manifestUrl]: { body: invalid } }, requests))))
  })

  it.effect("maps non-success HTTP responses to safe source errors", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://user:password@skills.example/private/skills.json?signature=secret#fragment"
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))
      const encoded = stringify(failure)

      expect(failure.source).toBe("https://skills.example/private/skills.json")
      expect(failure.cause).toBeUndefined()
      expect(encoded).not.toContain("secret")
      expect(encoded).not.toContain("password")
      expect(encoded).not.toContain("fragment")
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(cryptoLayer(), httpLayer({ [manifestUrl]: { body: "forbidden", status: 403 } }, requests)),
      ),
    )
  })

  it.effect("constructs S3 and immutable GitHub catalog endpoints", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const commit = "a".repeat(40)
    const s3Manifest = "https://company-skills.s3.us-west-2.amazonaws.com/support/skills.json"
    const s3Body = "https://company-skills.s3.us-west-2.amazonaws.com/support/remote/SKILL.md"
    const githubManifest = `https://api.github.com/repos/acme/agent-skills/contents/skills/skills.json?ref=${commit}`
    const githubBody = `https://api.github.com/repos/acme/agent-skills/contents/skills/remote/SKILL.md?ref=${commit}`
    return Effect.gen(function* () {
      const s3 = yield* S3Catalog.make({ bucket: "company-skills", region: "us-west-2", prefix: "support" })
      const github = yield* GitHubCatalog.make({
        owner: "acme",
        repo: "agent-skills",
        ref: commit,
        root: "skills",
      })

      yield* (yield* s3.get("remote"))!.instructions
      yield* (yield* github.get("remote"))!.instructions

      expect(requests.map((request) => request.url)).toEqual([s3Manifest, githubManifest, s3Body, githubBody])
      expect(requests.filter((request) => request.url.startsWith("https://api.github.com"))).toSatisfy(
        (items: ReadonlyArray<{ readonly accept: string | undefined }>) =>
          items.every((request) => request.accept === "application/vnd.github.raw+json"),
      )
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer(
            {
              [s3Manifest]: { body: manifest() },
              [s3Body]: { body: document },
              [githubManifest]: { body: manifest() },
              [githubBody]: { body: document },
            },
            requests,
          ),
        ),
      ),
    )
  })

  it.effect("requires GitHub refs to be immutable commit ids", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        GitHubCatalog.make({ owner: "acme", repo: "agent-skills", ref: "main", root: "skills" }),
      )
      expect(failure._tag).toBe("generalist/core/SkillCatalogError")
    }).pipe(provideTestLayer(Layer.mergeAll(cryptoLayer(), httpLayer({}, [])))),
  )

  it.effect("bounds raw streamed bytes before buffering and rejects invalid UTF-8", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const limitedUrl = "https://skills.example/streamed.json"
    const invalidUrl = "https://skills.example/invalid.json"
    let pulls = 0
    const streamed = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1
          controller.enqueue(new Uint8Array([123, 34, 120]))
          if (pulls >= 3) controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    return Effect.gen(function* () {
      const limited = yield* Effect.flip(HttpCatalog.make({ manifestUrl: limitedUrl, manifestMaxBytes: 4 }))
      const invalid = yield* Effect.flip(HttpCatalog.make({ manifestUrl: invalidUrl }))

      expect(limited.message).toContain("exceeds 4 bytes")
      expect(pulls).toBeLessThan(3)
      expect(invalid.message).toContain("UTF-8")
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer(
            {
              [limitedUrl]: { body: streamed },
              [invalidUrl]: { body: new Uint8Array([0xff]) },
            },
            requests,
          ),
        ),
      ),
    )
  })

  it.effect("hashes exact body bytes and does not inherit tools from record prototypes", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/constructor/SKILL.md"
    const raw = new TextEncoder().encode(`---\nname: constructor\ndescription: Safe own-property lookup\n---\nbody`)
    let hashed: Uint8Array | undefined
    const manifestBody = stringify({
      version: 1,
      skills: [
        {
          name: "constructor",
          description: "Safe own-property lookup",
          skillPath: "constructor/SKILL.md",
          sha256: digest,
        },
      ],
    })
    const recordingCrypto = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, bytes) => {
          hashed = bytes
          return Effect.succeed(digestBytes)
        },
      }),
    )
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl, toolsBySkill: {} })
      const skill = yield* source.get("constructor")
      yield* skill!.instructions

      expect([...hashed!]).toEqual([...raw])
      expect(skill!.tools).toEqual([])
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          recordingCrypto,
          httpLayer({ [manifestUrl]: { body: manifestBody }, [bodyUrl]: { body: raw } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects unsafe provider components and encoded hosted paths", () =>
    Effect.gen(function* () {
      const commit = "a".repeat(40)
      const encodedPathUrl = "https://skills.example/catalog.json"
      const failures = yield* Effect.all([
        Effect.flip(GitHubCatalog.make({ owner: "..", repo: "skills", ref: commit })),
        Effect.flip(GitHubCatalog.make({ owner: "acme", repo: "..", ref: commit })),
        Effect.flip(
          GitHubCatalog.make({
            owner: "acme",
            repo: "skills",
            ref: commit,
            apiBaseUrl: "https://user:secret@git.example/api?token=secret",
          }),
        ),
        Effect.flip(S3Catalog.make({ bucket: "company.skills", region: "us-west-2" })),
        Effect.flip(S3Catalog.make({ bucket: "192.168.1.1", region: "us-west-2" })),
        Effect.flip(HttpCatalog.make({ manifestUrl: encodedPathUrl })),
      ])
      expect(failures).toHaveLength(6)
    }).pipe(
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer(
            {
              "https://skills.example/catalog.json": {
                body: manifest("remote%2fescape/SKILL.md"),
              },
            },
            [],
          ),
        ),
      ),
    ),
  )

  it.effect("composes public filesystem-independent adapters with later catalogs winning", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const httpUrl = "https://skills.example/catalog.json"
    const s3Url = "https://company-skills.s3.us-west-2.amazonaws.com/skills.json"
    const secondManifest = stringify({
      version: 1,
      skills: [
        {
          name: "remote",
          description: "Later source wins",
          skillPath: "remote/SKILL.md",
          sha256: digest,
        },
      ],
    })
    return Effect.gen(function* () {
      const source = yield* SkillCatalog.SkillCatalog
      const all = yield* source.all
      const remote = yield* source.get("remote")

      expect(all).toHaveLength(1)
      expect(remote?.description).toBe("Later source wins")
    }).pipe(
      provideTestLayer(
        SkillCatalog.layer([
          HttpCatalog.make({ manifestUrl: httpUrl }),
          S3Catalog.make({ bucket: "company-skills", region: "us-west-2" }),
        ]),
      ),
      provideTestLayer(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [httpUrl]: { body: manifest() }, [s3Url]: { body: secondManifest } }, requests),
        ),
      ),
    )
  })
})
