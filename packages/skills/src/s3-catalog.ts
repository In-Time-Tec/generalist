import { Crypto, Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { SkillSource } from "@batonfx/core"
import { type Limits, make as makeHostedCatalog, resolveRelative, validateSkillPath } from "./hosted-catalog.js"

/** @experimental Manifest-backed S3 catalog options. */
export interface Options extends Limits {
  readonly bucket: string
  readonly region: string
  readonly prefix?: string
  readonly manifestName?: string
  readonly source?: string
}

const segments = (value: string): string =>
  value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/")

/** @experimental Build a manifest-backed S3 catalog source. */
export const make = (options: Options): SkillSource.Source<HttpClient.HttpClient | Crypto.Crypto> => {
  const source = options.source ?? `s3://${options.bucket}/${options.prefix ?? ""}`
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(options.bucket) ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(options.region)
  ) {
    return Effect.fail(
      new SkillSource.SkillSourceError({ source, message: "Invalid S3 bucket or region for hosted skill catalog" }),
    )
  }
  return Effect.gen(function* () {
    if ((options.prefix?.length ?? 0) > 0) yield* validateSkillPath(source, options.prefix ?? "")
    yield* validateSkillPath(source, options.manifestName ?? "skills.json")
    const prefix = segments(options.prefix ?? "")
    const manifestName = segments(options.manifestName ?? "skills.json")
    const manifestUrl = `https://${options.bucket}.s3.${options.region}.amazonaws.com/${prefix.length === 0 ? "" : `${prefix}/`}${manifestName}`
    return yield* makeHostedCatalog({
      ...options,
      source,
      manifestUrl,
      resolveSkillUrl: (skillPath) => resolveRelative(source, manifestUrl, skillPath),
    })
  })
}

/** @experimental Build a manifest-backed S3 catalog layer. */
export const layer = (options: Options) => SkillSource.layer([make(options)])
