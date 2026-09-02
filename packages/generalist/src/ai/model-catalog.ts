import { Context, Effect, Layer, Option, Schema } from "effect"

/** @experimental Conservative context window used when model metadata is unavailable. */
export const conservativeContextWindow = 32_768

/** @experimental */
export interface Metadata {
  readonly provider: string
  readonly model: string
  readonly contextWindow: number
  readonly maxOutput: number
  readonly pricing?: {
    readonly inputPerMTok?: number
    readonly outputPerMTok?: number
    readonly cacheReadPerMTok?: number
    readonly cacheWritePerMTok?: number
  }
  readonly modalities?: ReadonlyArray<"text" | "image" | "audio">
}

/** @experimental */
export class NotFound extends Schema.TaggedError<NotFound>()("generalist/ai/ModelMetadataNotFound", {
  provider: Schema.String,
  model: Schema.String,
}) {}

/** @experimental */
export interface Service {
  readonly find: (selection: {
    readonly provider: string
    readonly model: string
  }) => Effect.Effect<Metadata | undefined>
  readonly get: (selection: { readonly provider: string; readonly model: string }) => Effect.Effect<Metadata, NotFound>
  readonly contextWindow: (selection: {
    readonly provider: string
    readonly model: string
  }) => Effect.Effect<Option.Option<number>>
  readonly list: Effect.Effect<ReadonlyArray<Metadata>>
}

/** @experimental */
export class ModelCatalog extends Context.Service<ModelCatalog, Service>()(
  "generalist/ai/model-catalog/ModelCatalog",
) {}

/** @experimental Hand-maintained static metadata snapshot. */
export const bundled: ReadonlyArray<Metadata> = [
  {
    provider: "openai",
    model: "gpt-4o-mini",
    contextWindow: 128_000,
    maxOutput: 16_384,
    pricing: {
      inputPerMTok: 0.15,
      outputPerMTok: 0.6,
    },
    modalities: ["text", "image"],
  },
  {
    provider: "openai",
    model: "gpt-4.1-mini",
    contextWindow: 1_047_576,
    maxOutput: 32_768,
    pricing: {
      inputPerMTok: 0.4,
      outputPerMTok: 1.6,
    },
    modalities: ["text", "image"],
  },
  {
    provider: "openai",
    model: "gpt-4.1",
    contextWindow: 1_047_576,
    maxOutput: 32_768,
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 8,
    },
    modalities: ["text", "image"],
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    contextWindow: 200_000,
    maxOutput: 8_192,
    pricing: {
      inputPerMTok: 0.8,
      outputPerMTok: 4,
    },
    modalities: ["text", "image"],
  },
  {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    contextWindow: 131_072,
    maxOutput: 32_768,
    modalities: ["text"],
  },
  {
    provider: "mistral",
    model: "mistral-large-latest",
    contextWindow: 131_072,
    maxOutput: 8_192,
    modalities: ["text"],
  },
]

const metadataKey = (input: { readonly provider: string; readonly model: string }) =>
  JSON.stringify([input.provider, input.model])

const mergeEntries = (base: ReadonlyArray<Metadata>, overrides: ReadonlyArray<Metadata>): ReadonlyArray<Metadata> => {
  const order: Array<string> = []
  const byKey = new Map<string, Metadata>()

  for (const entry of [...base, ...overrides]) {
    const key = metadataKey(entry)
    if (!byKey.has(key)) order.push(key)
    byKey.set(key, entry)
  }

  const entries: Array<Metadata> = []
  for (const key of order) {
    const entry = byKey.get(key)
    if (entry !== undefined) entries.push(entry)
  }
  return entries
}

const make = (entries: ReadonlyArray<Metadata>): Service => {
  const byKey = new Map(entries.map((entry) => [metadataKey(entry), entry] as const))
  const warnedMissing = new Set<string>()

  const find: Service["find"] = (selection) => Effect.succeed(byKey.get(metadataKey(selection)))
  const get: Service["get"] = (selection) =>
    find(selection).pipe(
      Effect.flatMap((metadata) =>
        metadata === undefined
          ? Effect.fail(NotFound.make({ provider: selection.provider, model: selection.model }))
          : Effect.succeed(metadata),
      ),
    )
  const contextWindow: Service["contextWindow"] = (selection) =>
    Effect.suspend(() => {
      const key = metadataKey(selection)
      const metadata = byKey.get(key)
      if (metadata !== undefined) return Effect.succeed(Option.some(metadata.contextWindow))
      if (warnedMissing.has(key)) return Effect.succeed(Option.none())
      warnedMissing.add(key)
      return Effect.logWarning(
        `ModelCatalog has no context window for ${selection.provider}/${selection.model}; compaction will use the conservative ${conservativeContextWindow}-token default`,
      ).pipe(Effect.as(Option.none()))
    })

  return {
    find,
    get,
    contextWindow,
    list: Effect.succeed(entries),
  }
}

const defaultCatalog = make(bundled)

/** @experimental */
export const layer = (overrides: ReadonlyArray<Metadata> = []): Layer.Layer<ModelCatalog> =>
  Layer.succeed(ModelCatalog, ModelCatalog.of(make(mergeEntries(bundled, overrides))))

/** @experimental */
export const layerTest = (entries: ReadonlyArray<Metadata>): Layer.Layer<ModelCatalog> =>
  Layer.succeed(ModelCatalog, ModelCatalog.of(make(entries)))

/** @experimental */
export const find = Effect.fn("ModelCatalog.find.call")(function* (selection: {
  readonly provider: string
  readonly model: string
}) {
  const catalog = yield* ModelCatalog
  return yield* catalog.find(selection)
})

/** @experimental */
export const get = Effect.fn("ModelCatalog.get.call")(function* (selection: {
  readonly provider: string
  readonly model: string
}) {
  const catalog = yield* ModelCatalog
  return yield* catalog.get(selection)
})

/** @experimental Resolve a model context window from the provided catalog or bundled snapshot. */
export const contextWindow = Effect.fn("ModelCatalog.contextWindow.call")(function* (selection: {
  readonly provider: string
  readonly model: string
}) {
  const catalog = yield* Effect.serviceOption(ModelCatalog)
  return yield* Option.match(catalog, {
    onNone: () => defaultCatalog.contextWindow(selection),
    onSome: (service) => service.contextWindow(selection),
  })
})

/** @experimental */
export const list = Effect.fn("ModelCatalog.list.call")(function* () {
  const catalog = yield* ModelCatalog
  return yield* catalog.list
})
