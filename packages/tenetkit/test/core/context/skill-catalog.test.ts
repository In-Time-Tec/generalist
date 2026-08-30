import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, pipe } from "effect"
import { SkillCatalog } from "../../../src/index"
import { ItLayer } from "../it-layer.js"

const skill = (name: string, description: string, options: Partial<SkillCatalog.Skill> = {}): SkillCatalog.Skill => ({
  name,
  description,
  instructions: Effect.succeed(`# ${name}`),
  tools: [],
  ...options,
})

const listingTokens = (listing: string) => Math.ceil(listing.length / 4)

describe("SkillCatalog", () => {
  ItLayer.make(it, "layerSkills returns copied skills and resolves duplicate names with later wins", () => {
    const first = skill("review", "first")
    const second = skill("review", "second")
    return [
      SkillCatalog.layerSkills([first, second]),
      Effect.gen(function* () {
        const source = yield* SkillCatalog.SkillCatalog

        const all = yield* source.all
        const found = yield* source.get("review")
        const missing = yield* source.get("missing")

        expect(all).toEqual([first, second])
        expect(found).toBe(second)
        expect(missing).toBeUndefined()
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "layerEmpty provides no skills",
    () =>
      [
        SkillCatalog.layerEmpty,
        Effect.gen(function* () {
          const source = yield* SkillCatalog.SkillCatalog

          expect(yield* source.all).toEqual([])
          expect(yield* source.get("missing")).toBeUndefined()
        }),
      ] as const,
  )

  it("selectListings preserves source order under budget and excludes user-only skills", () => {
    const first = skill("first", "a")
    const second = skill("second", "b", { disableModelInvocation: true })
    const third = skill("third", "c")

    expect(SkillCatalog.selectListings([first, second, third], 1_000, [])).toEqual([first, third])
  })

  it("selectListings drops least-recently-used skills first when over budget", () => {
    const first = skill("first", "a".repeat(24))
    const second = skill("second", "b".repeat(24))
    const third = skill("third", "c".repeat(24))
    const budget =
      listingTokens(`- ${second.name}: ${second.description}`) + listingTokens(`- ${third.name}: ${third.description}`)

    expect(SkillCatalog.selectListings([first, second, third], budget, ["second", "third"])).toEqual([second, third])
    expect(SkillCatalog.selectListings([first, second, third], 0, ["first", "second", "third"])).toEqual([])
  })

  ItLayer.make(
    it,
    "layerTest provides an exact implementation",
    () =>
      [
        SkillCatalog.layerTest({
          all: Effect.succeed([]),
          get: () => Effect.void.pipe(Effect.as(undefined)),
        }),
        Effect.gen(function* () {
          const source = yield* SkillCatalog.SkillCatalog

          expect(yield* source.all).toEqual([])
          expect(yield* source.get("x")).toBeUndefined()
        }),
      ] as const,
  )

  it.effect("merge folds binary catalogs with later catalogs winning consistently", () => {
    const firstOnly = skill("first", "first only")
    const firstDuplicate = skill("duplicate", "first duplicate")
    const secondDuplicate = skill("duplicate", "second duplicate")
    const secondOnly = skill("second", "second only")
    const thirdDuplicate = skill("duplicate", "third duplicate")
    const thirdOnly = skill("third", "third only")
    const first: SkillCatalog.Service = {
      all: Effect.succeed([firstOnly, firstDuplicate]),
      get: (name) => {
        if (name === "duplicate") return Effect.succeed(firstDuplicate)
        return Effect.succeed(name === "first" ? firstOnly : undefined)
      },
    }
    const second: SkillCatalog.Service = {
      all: Effect.succeed([secondDuplicate, secondOnly]),
      get: (name) => {
        if (name === "duplicate") return Effect.succeed(secondDuplicate)
        return Effect.succeed(name === "second" ? secondOnly : undefined)
      },
    }
    const third: SkillCatalog.Service = {
      all: Effect.succeed([thirdDuplicate, thirdOnly]),
      get: (name) => {
        if (name === "duplicate") return Effect.succeed(thirdDuplicate)
        return Effect.succeed(name === "third" ? thirdOnly : undefined)
      },
    }
    const binary = SkillCatalog.merge(first, second)
    const folded = SkillCatalog.merge(binary, third)
    const pipeable = pipe(first, SkillCatalog.merge(second), SkillCatalog.merge(third))

    return Effect.gen(function* () {
      expect(yield* binary.all).toEqual([firstOnly, secondDuplicate, secondOnly])
      expect(yield* binary.get("duplicate")).toBe(secondDuplicate)
      expect(yield* folded.all).toEqual([firstOnly, thirdDuplicate, secondOnly, thirdOnly])
      expect(yield* folded.get("duplicate")).toBe(thirdDuplicate)
      expect(yield* folded.get("first")).toBe(firstOnly)
      expect(yield* folded.get("missing")).toBeUndefined()
      expect(yield* pipeable.all).toEqual(yield* folded.all)
      expect(yield* pipeable.get("duplicate")).toBe(yield* folded.get("duplicate"))
    })
  })

  it.effect("layer composes zero, one, and multiple sources", () => {
    const first = skill("first", "first")
    const earlier = skill("duplicate", "earlier")
    const later = skill("duplicate", "later")
    return Effect.scoped(
      Effect.gen(function* () {
        const empty = Context.get(yield* Layer.build(SkillCatalog.layer<never>([])), SkillCatalog.SkillCatalog)
        const single = Context.get(
          yield* Layer.build(
            SkillCatalog.layer<never>([
              Effect.succeed({
                all: Effect.succeed([first]),
                get: (name) => Effect.succeed(name === "first" ? first : undefined),
              }),
            ]),
          ),
          SkillCatalog.SkillCatalog,
        )
        const multiple = Context.get(
          yield* Layer.build(
            SkillCatalog.layer<never>([
              Effect.succeed({ all: Effect.succeed([earlier]), get: () => Effect.succeed(earlier) }),
              Effect.succeed({ all: Effect.succeed([later]), get: () => Effect.succeed(later) }),
            ]),
          ),
          SkillCatalog.SkillCatalog,
        )

        expect(yield* empty.all).toEqual([])
        expect(yield* single.all).toEqual([first])
        expect(yield* multiple.all).toEqual([later])
        expect(yield* multiple.get("duplicate")).toBe(later)
      }),
    )
  })

  it.effect("layer evaluates composable sources and fails fast", () => {
    const first = skill("first", "first")
    const failure = SkillCatalog.SkillCatalogError.make({ source: "second", message: "unavailable" })
    return Effect.gen(function* () {
      const exit = yield* Layer.build(
        SkillCatalog.layer([
          Effect.succeed({ all: Effect.succeed([first]), get: () => Effect.succeed(first) }),
          Effect.fail(failure),
        ]),
      ).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
    })
  })
})
