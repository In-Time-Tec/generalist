import { Crypto, Effect } from "effect"
import { HttpClient, Url } from "effect/unstable/http"
import { SkillSource } from "@batonfx/core"
import { type Limits, make as makeHostedCatalog, resolveRelative } from "./hosted-catalog.js"

/** @experimental Generic HTTP skill catalog options. */
export interface Options extends Limits {
  readonly manifestUrl: string
  readonly source?: string
}

const invalidUrl = (cause: unknown) =>
  new SkillSource.SkillSourceError({ source: "http-skill-catalog", message: "Invalid manifest URL", cause })

/** @experimental Build a generic HTTP catalog source. */
export const make = (options: Options): SkillSource.Source<HttpClient.HttpClient | Crypto.Crypto> => {
  return Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(Url.fromString(options.manifestUrl)).pipe(Effect.mapError(invalidUrl))
    const source = options.source ?? `${parsed.origin}${parsed.pathname}`
    return yield* makeHostedCatalog({
      ...options,
      source,
      resolveSkillUrl: (skillPath) => resolveRelative(source, options.manifestUrl, skillPath),
    })
  })
}

/** @experimental Build a generic HTTP catalog layer. */
export const layer = (options: Options) => SkillSource.layer([make(options)])
