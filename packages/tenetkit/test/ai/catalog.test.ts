import { describe, expect, it, layer as testLayer } from "@effect/vitest"
import { Effect } from "effect"
import { ModelCatalog, layer } from "tenetkit/ai/catalog"
import { Catalog } from "../../src/ai/index"

describe("Catalog", () => {
  testLayer(Catalog.layer())((test) => {
    test.effect("requires a known bundled model", () =>
      Effect.gen(function* () {
        const metadata = yield* Catalog.require({ provider: "openai", model: "gpt-4o-mini" })

        expect(metadata.provider).toBe("openai")
        expect(metadata.model).toBe("gpt-4o-mini")
        expect(metadata.contextWindow).toBeGreaterThan(0)
        expect(metadata.maxOutput).toBeGreaterThan(0)
      }),
    )

    test.effect("fails typed when required metadata is missing", () =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Catalog.require({ provider: "missing", model: "none" }))

        expect(failure._tag).toBe("tenetkit/ai/ModelMetadataNotFound")
        if (failure._tag === "tenetkit/ai/ModelMetadataNotFound") {
          expect(failure.provider).toBe("missing")
          expect(failure.model).toBe("none")
        }
      }),
    )

    test.effect("returns undefined from lookup when metadata is missing", () =>
      Effect.gen(function* () {
        const metadata = yield* Catalog.lookup({ provider: "missing", model: "none" })

        expect(metadata).toBeUndefined()
      }),
    )
  })

  const override: Catalog.ModelMetadata = {
    provider: "openai",
    model: "gpt-4o-mini",
    contextWindow: 42,
    maxOutput: 7,
    pricing: { inputPerMTok: 1 },
    modalities: ["text"],
  }
  testLayer(Catalog.layer([override]))((test) => {
    test.effect("lets overrides shadow bundled metadata by provider and model", () =>
      Effect.gen(function* () {
        const metadata = yield* Catalog.require({ provider: "openai", model: "gpt-4o-mini" })
        const all = yield* Catalog.all()

        expect(metadata).toEqual(override)
        expect(all.find((entry) => entry.provider === "openai" && entry.model === "gpt-4o-mini")).toEqual(override)
      }),
    )
  })

  it("exports the catalog namespace and subpath", () => {
    expect(typeof Catalog.layer).toBe("function")
    expect(typeof Catalog.layerTest).toBe("function")
    expect(typeof layer).toBe("function")
    expect(ModelCatalog).toBeDefined()
  })
})
