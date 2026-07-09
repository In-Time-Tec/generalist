import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SkillSource } from "../src/index"

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
  it.effect("fromSkills returns copied skills and resolves duplicate names with later wins", () => {
    const first = skill("review", "first")
    const second = skill("review", "second")
    return Effect.gen(function* () {
      const source = yield* SkillSource.SkillSource

      const all = yield* source.all
      const found = yield* source.get("review")
      const missing = yield* source.get("missing")

      expect(all).toEqual([first, second])
      expect(found).toBe(second)
      expect(missing).toBeUndefined()
    }).pipe(Effect.provide(SkillSource.fromSkills([first, second])))
  })

  it.effect("empty provides no skills", () =>
    Effect.gen(function* () {
      const source = yield* SkillSource.SkillSource

      expect(yield* source.all).toEqual([])
      expect(yield* source.get("missing")).toBeUndefined()
    }).pipe(Effect.provide(SkillSource.empty)),
  )

  it("builds capped listings", () => {
    const frontmatter = { name: "long", description: "abcdef" }

    expect(SkillSource.makeListing(frontmatter)).toBe("- long: abcdef")
    expect(SkillSource.makeListing(frontmatter, 3)).toBe("- long: abc")
    expect(SkillSource.DESCRIPTION_CAP).toBe(1_024)
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

  it.effect("testLayer provides an exact implementation", () =>
    Effect.gen(function* () {
      const source = yield* SkillSource.SkillSource

      expect(yield* source.all).toEqual([])
      expect(yield* source.get("x")).toBeUndefined()
    }).pipe(
      Effect.provide(
        SkillSource.testLayer({
          all: Effect.succeed([]),
          get: () => Effect.succeed(undefined),
        }),
      ),
    ),
  )

  it.effect("merge deduplicates names with later sources winning consistently", () => {
    const firstOnly = skill("first", "first only")
    const firstDuplicate = skill("duplicate", "first duplicate")
    const secondDuplicate = skill("duplicate", "second duplicate")
    const secondOnly = skill("second", "second only")
    const merged = SkillSource.merge([
      {
        all: Effect.succeed([firstOnly, firstDuplicate]),
        get: (name) => Effect.succeed(name === "duplicate" ? firstDuplicate : name === "first" ? firstOnly : undefined),
      },
      {
        all: Effect.succeed([secondDuplicate, secondOnly]),
        get: (name) =>
          Effect.succeed(name === "duplicate" ? secondDuplicate : name === "second" ? secondOnly : undefined),
      },
    ])
    return Effect.gen(function* () {
      expect(yield* merged.all).toEqual([firstOnly, secondDuplicate, secondOnly])
      expect(yield* merged.get("duplicate")).toBe(secondDuplicate)
      expect(yield* merged.get("missing")).toBeUndefined()
    })
  })

  it.effect("layer evaluates composable sources and fails fast", () => {
    const first = skill("first", "first")
    const failure = new SkillSource.SkillSourceError({ source: "second", message: "unavailable" })
    const failed = SkillSource.SkillSource.pipe(
      Effect.provide(
        SkillSource.layer([
          Effect.succeed({ all: Effect.succeed([first]), get: () => Effect.succeed(first) }),
          Effect.fail(failure),
        ]),
      ),
      Effect.exit,
    )
    return Effect.gen(function* () {
      const exit = yield* failed
      expect(exit._tag).toBe("Failure")
    })
  })
})
