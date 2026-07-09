import { describe, expect, it } from "@effect/vitest"
import { Crypto, Effect, Encoding, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { SkillSource } from "@batonfx/core"
import { GitHubCatalog, HttpCatalog, S3Catalog } from "../src/index"

const digestBytes = new Uint8Array(32).fill(1)
const digest = Encoding.encodeHex(digestBytes)

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
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(response?.body ?? "missing", {
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
  JSON.stringify({
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
  it.effect("loads HTTP metadata once and keeps verified SKILL.md bodies lazy", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl, source: "company-skills" })
      const all = yield* source.all

      expect(all.map((skill) => skill.frontmatter.name)).toEqual(["remote"])
      expect(requests.map((request) => request.url)).toEqual([manifestUrl])

      const body = yield* all[0]!.body

      expect(body).toContain("# Remote body")
      expect(requests.map((request) => request.url)).toEqual([manifestUrl, bodyUrl])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [manifestUrl]: { body: manifest() }, [bodyUrl]: { body: document } }, requests),
        ),
      ),
    )
  })

  it.effect("rejects unsafe hosted paths during source construction", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl, source: "unsafe-catalog" }))

      expect(failure._tag).toBe("@batonfx/core/SkillSourceError")
      expect(failure.source).toBe("unsafe-catalog")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(cryptoLayer(), httpLayer({ [manifestUrl]: { body: manifest("../escape/SKILL.md") } }, requests)),
      ),
    )
  })

  it.effect("fails digest mismatches on activation and allows a later retry", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://skills.example/catalog/skills.json"
    const bodyUrl = "https://skills.example/catalog/remote/SKILL.md"
    return Effect.gen(function* () {
      const source = yield* HttpCatalog.make({ manifestUrl, source: "retry-catalog" })
      const skill = yield* source.get("remote")
      const first = yield* Effect.exit(skill!.body)
      const second = yield* Effect.exit(skill!.body)

      expect(first._tag).toBe("Failure")
      expect(second._tag).toBe("Failure")
      expect(requests.filter((request) => request.url === bodyUrl)).toHaveLength(2)
    }).pipe(
      Effect.provide(
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
      const source = yield* HttpCatalog.make({ manifestUrl, source: "drift-catalog" })
      const skill = yield* source.get("remote")
      const failure = yield* Effect.flip(skill!.body)

      expect(failure._tag).toBe("@batonfx/core/SkillSourceError")
      expect(failure.message).toContain("Frontmatter mismatch")
    }).pipe(
      Effect.provide(
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
    const duplicate = JSON.stringify({
      version: 1,
      skills: [...JSON.parse(manifest()).skills, ...JSON.parse(manifest()).skills],
    })
    return Effect.gen(function* () {
      const duplicateFailure = yield* Effect.flip(HttpCatalog.make({ manifestUrl: duplicateUrl }))
      const limitedFailure = yield* Effect.flip(HttpCatalog.make({ manifestUrl: limitedUrl, manifestMaxBytes: 1 }))

      expect(duplicateFailure.message).toContain("Duplicate hosted skill name")
      expect(limitedFailure.message).toContain("exceeds 1 bytes")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [duplicateUrl]: { body: duplicate }, [limitedUrl]: { body: manifest() } }, requests),
        ),
      ),
    )
  })

  it.effect("maps non-success HTTP responses to safe source errors", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const manifestUrl = "https://user:password@skills.example/private/skills.json?signature=secret#fragment"
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(HttpCatalog.make({ manifestUrl }))

      expect(failure.source).toBe("https://skills.example/private/skills.json")
      expect(failure.source).not.toContain("secret")
      expect(failure.source).not.toContain("password")
    }).pipe(
      Effect.provide(
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

      yield* (yield* s3.get("remote"))!.body
      yield* (yield* github.get("remote"))!.body

      expect(requests.map((request) => request.url)).toEqual([s3Manifest, githubManifest, s3Body, githubBody])
      expect(requests.filter((request) => request.url.startsWith("https://api.github.com"))).toSatisfy(
        (items: ReadonlyArray<{ readonly accept: string | undefined }>) =>
          items.every((request) => request.accept === "application/vnd.github.raw+json"),
      )
    }).pipe(
      Effect.provide(
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
      expect(failure._tag).toBe("@batonfx/core/SkillSourceError")
    }).pipe(Effect.provide(Layer.mergeAll(cryptoLayer(), httpLayer({}, [])))),
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
      Effect.provide(
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
    const manifestBody = JSON.stringify({
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
      yield* skill!.body

      expect([...hashed!]).toEqual([...raw])
      expect(skill!.tools).toEqual([])
    }).pipe(
      Effect.provide(
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
      Effect.provide(
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

  it.effect("composes public filesystem-independent adapters with later sources winning", () => {
    const requests: Array<{ readonly url: string; readonly accept: string | undefined }> = []
    const httpUrl = "https://skills.example/catalog.json"
    const s3Url = "https://company-skills.s3.us-west-2.amazonaws.com/skills.json"
    const secondManifest = JSON.stringify({
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
      const source = yield* SkillSource.SkillSource
      const all = yield* source.all
      const remote = yield* source.get("remote")

      expect(all).toHaveLength(1)
      expect(remote?.frontmatter.description).toBe("Later source wins")
    }).pipe(
      Effect.provide(
        SkillSource.layer([
          HttpCatalog.make({ manifestUrl: httpUrl }),
          S3Catalog.make({ bucket: "company-skills", region: "us-west-2" }),
        ]),
      ),
      Effect.provide(
        Layer.mergeAll(
          cryptoLayer(),
          httpLayer({ [httpUrl]: { body: manifest() }, [s3Url]: { body: secondManifest } }, requests),
        ),
      ),
    )
  })
})
