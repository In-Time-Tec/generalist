import { Crypto, Effect } from "effect"
import { HttpClient, Url } from "effect/unstable/http"
import { SkillSource } from "tenetkit"
import type { SkillSourceFacade } from "tenetkit"
import { type Limits, make as makeHostedCatalog, resolveRelative } from "./hosted-catalog.js"

/** @experimental Generic HTTP skill catalog options. */
export interface Options extends Limits {
  readonly manifestUrl: string
}

const invalidUrl = () =>
  SkillSource.SkillSourceError.make({ source: "http-skill-catalog", message: "Invalid manifest URL" })

/** @experimental Build a generic HTTP catalog source. */
export const make = (options: Options): SkillSource.Source<HttpClient.HttpClient | Crypto.Crypto> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(Url.fromString(options.manifestUrl)).pipe(Effect.mapError(invalidUrl))
    const source = `${parsed.origin}${parsed.pathname}`
    return yield* makeHostedCatalog({
      limits: options,
      source,
      manifestUrl: options.manifestUrl,
      resolveSkillUrl: (skillPath) => resolveRelative(source, options.manifestUrl, skillPath),
    })
  })

/** @experimental Build a generic HTTP catalog layer. */
export const layer = (options: Options): ReturnType<SkillSourceFacade["layer"]> => SkillSource.layer([make(options)])
