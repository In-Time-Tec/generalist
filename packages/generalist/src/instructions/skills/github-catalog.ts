import { Effect } from "effect"
import { Url } from "effect/unstable/http"
import { SkillCatalogError, layer as SkillCatalogLayer } from "../../core/context/skill-catalog.js"
import { type Limits, make as makeHostedCatalog, validateSkillPath } from "./hosted-catalog.js"

/** @experimental Manifest-backed GitHub catalog options. */
export interface Options extends Limits {
  readonly owner: string
  readonly repo: string
  readonly ref: string
  readonly root?: string
  readonly manifestName?: string
  readonly apiBaseUrl?: string
}

const encodedPath = (value: string): string =>
  value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/")

/** @experimental Build a manifest-backed immutable GitHub catalog. */
export const make = (options: Options) => {
  const validationSource = "github-skill-catalog"
  if (!/^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/.test(options.ref)) {
    return Effect.fail(
      SkillCatalogError.make({
        source: validationSource,
        message: "GitHub skill catalog ref must be a commit id",
      }),
    )
  }
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(options.owner) ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/.test(options.repo)
  ) {
    return Effect.fail(
      SkillCatalogError.make({ source: validationSource, message: "Invalid GitHub owner or repository" }),
    )
  }
  const source = `github:${options.owner}/${options.repo}@${options.ref}`
  return Effect.gen(function* () {
    if ((options.root?.length ?? 0) > 0) yield* validateSkillPath(source, options.root ?? "")
    yield* validateSkillPath(source, options.manifestName ?? "skills.json")
    const apiBase = yield* Effect.fromResult(Url.fromString(options.apiBaseUrl ?? "https://api.github.com")).pipe(
      Effect.mapError(() => SkillCatalogError.make({ source, message: "Invalid GitHub API base URL" })),
    )
    if (
      apiBase.protocol !== "https:" ||
      apiBase.username.length > 0 ||
      apiBase.password.length > 0 ||
      apiBase.search.length > 0 ||
      apiBase.hash.length > 0
    ) {
      return yield* SkillCatalogError.make({ source, message: "Invalid GitHub API base URL" })
    }
    const base = apiBase.toString().replace(/\/$/, "")
    const root = encodedPath(options.root ?? "")
    const manifestName = encodedPath(options.manifestName ?? "skills.json")
    const repository = `${base}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/contents`
    const rootUrl = `${repository}/${root.length === 0 ? "" : `${root}/`}`
    const manifestUrl = `${rootUrl}${manifestName}?ref=${encodeURIComponent(options.ref)}`
    const headers = {
      accept: "application/vnd.github.raw+json",
      "x-github-api-version": "2022-11-28",
    }
    return yield* makeHostedCatalog({
      limits: options,
      source,
      manifestUrl,
      manifestHeaders: headers,
      bodyHeaders: headers,
      resolveSkillUrl: (skillPath) =>
        validateSkillPath(source, skillPath).pipe(
          Effect.map((safePath) => `${rootUrl}${encodedPath(safePath)}?ref=${encodeURIComponent(options.ref)}`),
        ),
    })
  })
}

/** @experimental Build a manifest-backed immutable GitHub catalog layer. */
export const layer = (options: Options): ReturnType<typeof SkillCatalogLayer> => SkillCatalogLayer([make(options)])
