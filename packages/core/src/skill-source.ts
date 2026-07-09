import { Context, Effect, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
/** @experimental Parsed SKILL.md frontmatter. */
export interface Frontmatter {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly allowedTools?: ReadonlyArray<string>
  readonly disableModelInvocation?: boolean
  readonly userInvocable?: boolean
  readonly contextFork?: boolean
  readonly agent?: string
  readonly model?: string
  readonly paths?: ReadonlyArray<string>
}

/** @experimental Skill source operation failed. */
export class SkillSourceError extends Schema.TaggedErrorClass<SkillSourceError>()("@batonfx/core/SkillSourceError", {
  source: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental A discovered skill. */
export interface Skill {
  readonly frontmatter: Frontmatter
  readonly listing: string
  readonly body: Effect.Effect<string, SkillSourceError>
  readonly tools: ReadonlyArray<Tool.Any>
}

/** @experimental Per-entry description character cap. */
export const DESCRIPTION_CAP = 1_536

/** @experimental Skill registry seam. */
export interface Interface {
  readonly all: Effect.Effect<ReadonlyArray<Skill>, SkillSourceError>
  readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillSourceError>
}

/** @experimental */
export class SkillSource extends Context.Service<SkillSource, Interface>()("@batonfx/core/SkillSource") {}

/** @experimental Build a startup listing line from skill frontmatter. */
export const makeListing = (frontmatter: Frontmatter, descriptionCap: number = DESCRIPTION_CAP): string =>
  `- ${frontmatter.name}: ${frontmatter.description.slice(0, Math.max(0, descriptionCap))}`

/** @experimental A source built from in-memory skills. */
export const fromSkills = (skills: ReadonlyArray<Skill>): Layer.Layer<SkillSource> => {
  const all = [...skills]
  const byName = new Map(all.map((skill) => [skill.frontmatter.name, skill]))
  return Layer.succeed(
    SkillSource,
    SkillSource.of({
      all: Effect.succeed(all),
      get: (name) => Effect.succeed(byName.get(name)),
    }),
  )
}

/** @experimental Empty skill source. */
export const empty: Layer.Layer<SkillSource> = fromSkills([])

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<SkillSource> =>
  Layer.succeed(SkillSource, SkillSource.of(implementation))

const estimatedTokens = (listing: string): number => Math.ceil(listing.length / 4)

const usageRank = (skill: Skill, recentlyUsed: ReadonlyArray<string>): number => {
  const index = recentlyUsed.indexOf(skill.frontmatter.name)
  return index === -1 ? -1 : index
}

/** @experimental Select startup listings within a token budget. */
export const selectListings = (
  skills: ReadonlyArray<Skill>,
  budgetTokens: number,
  recentlyUsed: ReadonlyArray<string>,
): ReadonlyArray<Skill> => {
  if (budgetTokens <= 0) return []
  const selected = skills.filter(
    (skill) => skill.frontmatter.disableModelInvocation !== true && estimatedTokens(skill.listing) <= budgetTokens,
  )
  let total = selected.reduce((sum, skill) => sum + estimatedTokens(skill.listing), 0)
  while (total > budgetTokens && selected.length > 0) {
    let dropIndex = 0
    for (let index = 1; index < selected.length; index += 1) {
      if (usageRank(selected[index] as Skill, recentlyUsed) < usageRank(selected[dropIndex] as Skill, recentlyUsed)) {
        dropIndex = index
      }
    }
    const [dropped] = selected.splice(dropIndex, 1)
    total -= dropped === undefined ? 0 : estimatedTokens(dropped.listing)
  }
  return selected
}
