import { Context, Effect, Layer, Schema } from "effect"

/** @experimental */
export interface ModelMetadata {
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
export class ModelMetadataNotFound extends Schema.TaggedErrorClass<ModelMetadataNotFound>()(
  "@batonfx/providers/ModelMetadataNotFound",
  {
    provider: Schema.String,
    model: Schema.String,
  },
) {}

/** @experimental */
export interface Interface {
  readonly lookup: (selection: {
    readonly provider: string
    readonly model: string
  }) => Effect.Effect<ModelMetadata | undefined>
  readonly require: (selection: {
    readonly provider: string
    readonly model: string
  }) => Effect.Effect<ModelMetadata, ModelMetadataNotFound>
  readonly all: Effect.Effect<ReadonlyArray<ModelMetadata>>
}

/** @experimental */
export class ModelCatalog extends Context.Service<ModelCatalog, Interface>()("@batonfx/providers/catalog/catalog/ModelCatalog") {}

/** @experimental Hand-maintained static metadata snapshot. */
export const bundled: ReadonlyArray<ModelMetadata> = [
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

const mergeEntries = (
  base: ReadonlyArray<ModelMetadata>,
  overrides: ReadonlyArray<ModelMetadata>,
): ReadonlyArray<ModelMetadata> => {
  const order: Array<string> = []
  const byKey = new Map<string, ModelMetadata>()

  for (const entry of [...base, ...overrides]) {
    const key = metadataKey(entry)
    if (!byKey.has(key)) order.push(key)
    byKey.set(key, entry)
  }

  const entries: Array<ModelMetadata> = []
  for (const key of order) {
    const entry = byKey.get(key)
    if (entry !== undefined) entries.push(entry)
  }
  return entries
}

const make = (entries: ReadonlyArray<ModelMetadata>): Interface => {
  const byKey = new Map(entries.map((entry) => [metadataKey(entry), entry] as const))

  const lookup: Interface["lookup"] = (selection) => Effect.succeed(byKey.get(metadataKey(selection)))
  const require: Interface["require"] = (selection) =>
    lookup(selection).pipe(
      Effect.flatMap((metadata) =>
        metadata === undefined
          ? Effect.fail(ModelMetadataNotFound.make({ provider: selection.provider, model: selection.model }))
          : Effect.succeed(metadata),
      ),
    )

  return {
    lookup,
    require,
    all: Effect.succeed(entries),
  }
}

/** @experimental */
export const layer = (overrides: ReadonlyArray<ModelMetadata> = []): Layer.Layer<ModelCatalog> =>
  Layer.succeed(ModelCatalog, ModelCatalog.of(make(mergeEntries(bundled, overrides))))

/** @experimental */
export const layerTest = (entries: ReadonlyArray<ModelMetadata>): Layer.Layer<ModelCatalog> =>
  Layer.succeed(ModelCatalog, ModelCatalog.of(make(entries)))

/** @experimental */
export const lookup = Effect.fn("Catalog.lookup.call")(function* (selection: {
  readonly provider: string
  readonly model: string
}) {
  const catalog = yield* ModelCatalog
  return yield* catalog.lookup(selection)
})

/** @experimental */
export const require = Effect.fn("Catalog.require.call")(function* (selection: {
  readonly provider: string
  readonly model: string
}) {
  const catalog = yield* ModelCatalog
  return yield* catalog.require(selection)
})

/** @experimental */
export const all = Effect.fn("Catalog.all.call")(function* () {
  const catalog = yield* ModelCatalog
  return yield* catalog.all
})
