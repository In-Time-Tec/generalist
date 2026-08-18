import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema, pipe } from "effect"
import { SkillSource } from "../../src/core/index"
import { ItLayer } from "./it-layer"

const skill = (
  name: string,
  description: string,
  options: Partial<SkillSource.Frontmatter> = {},
): SkillSource.Skill => {
  const frontmatter = { name, description, ...options }
  return {
    frontmatter,
    listing: SkillSource.makeListing(frontmatter),
    body: Effect.succeed(`# ${name}`),
    tools: [],
  }
}

const listingTokens = (listing: string) => Math.ceil(listing.length / 4)

describe("SkillSource", () => {
  ItLayer.make(it, "layerSkills returns copied skills and resolves duplicate names with later wins", () => {
    const first = skill("review", "first")
    const second = skill("review", "second")
    return [
      SkillSource.layerSkills([first, second]),
      Effect.gen(function* () {
        const source = yield* SkillSource.SkillSource

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
        SkillSource.layerEmpty,
        Effect.gen(function* () {
          const source = yield* SkillSource.SkillSource

          expect(yield* source.all).toEqual([])
          expect(yield* source.get("missing")).toBeUndefined()
        }),
      ] as const,
  )

  it("builds capped listings", () => {
    const frontmatter = { name: "long", description: "abcdef" }

    expect(SkillSource.makeListing(frontmatter)).toBe("- long: abcdef")
    expect(SkillSource.makeListing(frontmatter, 3)).toBe("- long: abc")
    expect(SkillSource.DESCRIPTION_CAP).toBe(1_024)
  })

  it("validates descriptions through the shared frontmatter schema", () => {
    const isFrontmatter = Schema.is(SkillSource.Frontmatter)

    expect(isFrontmatter({ name: "valid", description: "a" })).toBe(true)
    expect(isFrontmatter({ name: "empty", description: "" })).toBe(false)
    expect(isFrontmatter({ name: "long", description: "a".repeat(SkillSource.DESCRIPTION_CAP + 1) })).toBe(false)
  })

  it("selectListings preserves source order under budget and excludes user-only skills", () => {
    const first = skill("first", "a")
    const second = skill("second", "b", { disableModelInvocation: true })
    const third = skill("third", "c")

    expect(SkillSource.selectListings([first, second, third], 1_000, [])).toEqual([first, third])
  })

  it("selectListings drops least-recently-used skills first when over budget", () => {
    const first = skill("first", "a".repeat(24))
    const second = skill("second", "b".repeat(24))
    const third = skill("third", "c".repeat(24))
    const budget = listingTokens(second.listing) + listingTokens(third.listing)

    expect(SkillSource.selectListings([first, second, third], budget, ["second", "third"])).toEqual([second, third])
    expect(SkillSource.selectListings([first, second, third], 0, ["first", "second", "third"])).toEqual([])
  })

  ItLayer.make(
    it,
    "layerTest provides an exact implementation",
    () =>
      [
        SkillSource.layerTest({
          all: Effect.succeed([]),
          get: () => Effect.void.pipe(Effect.map(() => undefined as SkillSource.Skill | undefined)),
        }),
        Effect.gen(function* () {
          const source = yield* SkillSource.SkillSource

          expect(yield* source.all).toEqual([])
          expect(yield* source.get("x")).toBeUndefined()
        }),
      ] as const,
  )

  it.effect("merge folds binary sources with later sources winning consistently", () => {
    const firstOnly = skill("first", "first only")
    const firstDuplicate = skill("duplicate", "first duplicate")
    const secondDuplicate = skill("duplicate", "second duplicate")
    const secondOnly = skill("second", "second only")
    const thirdDuplicate = skill("duplicate", "third duplicate")
    const thirdOnly = skill("third", "third only")
    const first: SkillSource.Interface = {
      all: Effect.succeed([firstOnly, firstDuplicate]),
      get: (name) => Effect.succeed(name === "duplicate" ? firstDuplicate : name === "first" ? firstOnly : undefined),
    }
    const second: SkillSource.Interface = {
      all: Effect.succeed([secondDuplicate, secondOnly]),
      get: (name) =>
        Effect.succeed(name === "duplicate" ? secondDuplicate : name === "second" ? secondOnly : undefined),
    }
    const third: SkillSource.Interface = {
      all: Effect.succeed([thirdDuplicate, thirdOnly]),
      get: (name) => Effect.succeed(name === "duplicate" ? thirdDuplicate : name === "third" ? thirdOnly : undefined),
    }
    const binary = SkillSource.merge(first, second)
    const folded = SkillSource.merge(binary, third)
    const pipeable = pipe(first, SkillSource.merge(second), SkillSource.merge(third))

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
        const empty = Context.get(yield* Layer.build(SkillSource.layer<never>([])), SkillSource.SkillSource)
        const single = Context.get(
          yield* Layer.build(
            SkillSource.layer<never>([
              Effect.succeed({
                all: Effect.succeed([first]),
                get: (name) => Effect.succeed(name === "first" ? first : undefined),
              }),
            ]),
          ),
          SkillSource.SkillSource,
        )
        const multiple = Context.get(
          yield* Layer.build(
            SkillSource.layer<never>([
              Effect.succeed({ all: Effect.succeed([earlier]), get: () => Effect.succeed(earlier) }),
              Effect.succeed({ all: Effect.succeed([later]), get: () => Effect.succeed(later) }),
            ]),
          ),
          SkillSource.SkillSource,
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
    const failure = SkillSource.SkillSourceError.make({ source: "second", message: "unavailable" })
    return Effect.gen(function* () {
      const exit = yield* Layer.build(
        SkillSource.layer([
          Effect.succeed({ all: Effect.succeed([first]), get: () => Effect.succeed(first) }),
          Effect.fail(failure),
        ]),
      ).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
    })
  })
})
