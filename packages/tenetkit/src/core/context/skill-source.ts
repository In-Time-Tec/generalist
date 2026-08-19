import { Context, Effect, Function, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"

/** @experimental Per-entry description character cap. */
export const DESCRIPTION_CAP = 1_024

/** @experimental Parsed SKILL.md frontmatter. */
export const Frontmatter = Schema.Struct({
  name: Schema.String,
  description: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(DESCRIPTION_CAP))),
  whenToUse: Schema.optionalKey(Schema.String),
  allowedTools: Schema.optionalKey(Schema.Array(Schema.String)),
  disableModelInvocation: Schema.optionalKey(Schema.Boolean),
  userInvocable: Schema.optionalKey(Schema.Boolean),
  contextFork: Schema.optionalKey(Schema.Boolean),
  agent: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

/** @experimental Parsed SKILL.md frontmatter. */
export type Frontmatter = typeof Frontmatter.Type

/** @experimental Skill source operation failed. */
export class SkillSourceError extends Schema.TaggedError<SkillSourceError>()("tenetkit/core/SkillSourceError", {
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
  /**
   * Where the skill was found, for a source that reads a filesystem. A host that resolves resources
   * beside a skill needs the directory it came from rather than one derived from its name, because
   * a source may find a skill anywhere beneath its root.
   */
  readonly directory?: string
}

/** @experimental Skill registry seam. */
export interface Interface {
  readonly all: Effect.Effect<ReadonlyArray<Skill>, SkillSourceError>
  readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillSourceError>
}

/** @experimental Effect that builds one skill source implementation. */
export type Source<R = never> = Effect.Effect<Interface, SkillSourceError, R>

/** @experimental */
export class SkillSource extends Context.Service<SkillSource, Interface>()(
  "tenetkit/core/context/skill-source/SkillSource",
) {}

/** @experimental Build a startup listing line from skill frontmatter. */
export const makeListing: {
  (descriptionCap?: number): (frontmatter: Frontmatter) => string
  (frontmatter: Frontmatter, descriptionCap?: number): string
} = Function.dual(
  (args) => typeof args[0] !== "number",
  (frontmatter: Frontmatter, descriptionCap: number = DESCRIPTION_CAP): string =>
    `- ${frontmatter.name}: ${frontmatter.description.slice(0, Math.max(0, descriptionCap))}`,
)

/** @experimental A source built from in-memory skills. */
export const layerSkills = (skills: ReadonlyArray<Skill>): Layer.Layer<SkillSource> => {
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
export const layerEmpty: Layer.Layer<SkillSource> = layerSkills([])

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<SkillSource> =>
  Layer.succeed(SkillSource, SkillSource.of(implementation))

const emptySource: Interface = {
  all: Effect.succeed([]),
  get: () => Effect.void.pipe(Effect.as(undefined)),
}

/** @experimental Merge two built sources with the second source winning duplicate names. */
export const merge: {
  (second: Interface): (first: Interface) => Interface
  (first: Interface, second: Interface): Interface
} = Function.dual(
  2,
  (first: Interface, second: Interface): Interface => ({
    all: Effect.all([first.all, second.all]).pipe(
      Effect.map((groups) => {
        const byName = new Map<string, Skill>()
        for (const skills of groups) {
          for (const skill of skills) byName.set(skill.frontmatter.name, skill)
        }
        return [...byName.values()]
      }),
    ),
    get: (name) =>
      second.get(name).pipe(Effect.flatMap((found) => (found === undefined ? first.get(name) : Effect.succeed(found)))),
  }),
)

/** @experimental Build one layer from composable sources. */
export const layer = <R>(sources: ReadonlyArray<Source<R>>): Layer.Layer<SkillSource, SkillSourceError, R> =>
  Layer.effect(
    SkillSource,
    Effect.forEach(sources, (source) => source).pipe(
      Effect.map((built) => SkillSource.of(built.reduce((first, second) => merge(first, second), emptySource))),
    ),
  )

const estimatedTokens = (listing: string): number => Math.ceil(listing.length / 4)

const usageRank = (skill: Skill, recentlyUsed: ReadonlyArray<string>): number => {
  const index = recentlyUsed.indexOf(skill.frontmatter.name)
  return index === -1 ? -1 : index
}

/** @experimental Select startup listings within a token budget. */
export const selectListings: {
  (budgetTokens: number, recentlyUsed: ReadonlyArray<string>): (skills: ReadonlyArray<Skill>) => ReadonlyArray<Skill>
  (skills: ReadonlyArray<Skill>, budgetTokens: number, recentlyUsed: ReadonlyArray<string>): ReadonlyArray<Skill>
} = Function.dual(
  3,
  (skills: ReadonlyArray<Skill>, budgetTokens: number, recentlyUsed: ReadonlyArray<string>): ReadonlyArray<Skill> => {
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
  },
)
