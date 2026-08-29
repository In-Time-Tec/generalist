import { Effect } from "effect"
import { Url } from "effect/unstable/http"
import { SkillCatalog } from "../core/index.js"
import { type Limits, make as makeHostedCatalog, resolveRelative } from "./hosted-catalog.js"

/** @experimental Generic HTTP skill catalog options. */
export interface Options extends Limits {
  readonly manifestUrl: string
}

const invalidUrl = () =>
  SkillCatalog.SkillCatalogError.make({ source: "http-skill-catalog", message: "Invalid manifest URL" })

/** @experimental Build a generic HTTP catalog. */
export const make = (options: Options) =>
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
export const layer = (options: Options): ReturnType<typeof SkillCatalog.layer> => SkillCatalog.layer([make(options)])
