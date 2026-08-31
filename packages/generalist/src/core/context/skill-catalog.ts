import { Context, Effect, Function, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { listing } from "./skill-catalog-internal.js"

/** @experimental Per-entry description character cap. */
export { descriptionLimit } from "./skill-catalog-internal.js"

/** @experimental Skill catalog operation failed. */
export class SkillCatalogError extends Schema.TaggedError<SkillCatalogError>()("generalist/core/SkillCatalogError", {
  source: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental A discovered skill. */
export interface Skill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly allowedTools?: ReadonlyArray<string>
  readonly disableModelInvocation?: boolean
  readonly userInvocable?: boolean
  readonly contextFork?: boolean
  readonly paths?: ReadonlyArray<string>
  readonly instructions: Effect.Effect<string, SkillCatalogError>
  readonly tools: ReadonlyArray<Tool.Any>
  /**
   * Where the skill was found, for a catalog that reads a filesystem. A host that resolves resources
   * beside a skill needs the directory it came from rather than one derived from its name, because
   * a catalog may find a skill anywhere beneath its root.
   */
  readonly location?: string
}

/** @experimental Skill registry seam. */
export interface Service {
  readonly all: Effect.Effect<ReadonlyArray<Skill>, SkillCatalogError>
  readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillCatalogError>
}

/** @experimental */
export class SkillCatalog extends Context.Service<SkillCatalog, Service>()(
  "generalist/core/context/skill-catalog/SkillCatalog",
) {}

/** @experimental A catalog built from in-memory skills. */
export const layerSkills = (skills: ReadonlyArray<Skill>): Layer.Layer<SkillCatalog> => {
  const all = [...skills]
  const byName = new Map(all.map((skill) => [skill.name, skill]))
  return Layer.succeed(
    SkillCatalog,
    SkillCatalog.of({
      all: Effect.succeed(all),
      get: (name) => Effect.succeed(byName.get(name)),
    }),
  )
}

/** @experimental Empty skill catalog. */
export const layerEmpty: Layer.Layer<SkillCatalog> = layerSkills([])

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<SkillCatalog> =>
  Layer.succeed(SkillCatalog, SkillCatalog.of(implementation))

const emptyCatalog: Service = {
  all: Effect.succeed([]),
  get: () => Effect.void.pipe(Effect.as(undefined)),
}

/** @experimental Merge two catalogs with the second catalog winning duplicate names. */
export const merge: {
  (second: Service): (first: Service) => Service
  (first: Service, second: Service): Service
} = Function.dual(
  2,
  (first: Service, second: Service): Service => ({
    all: Effect.all([first.all, second.all]).pipe(
      Effect.map((groups) => {
        const byName = new Map<string, Skill>()
        for (const skills of groups) {
          for (const skill of skills) byName.set(skill.name, skill)
        }
        return [...byName.values()]
      }),
    ),
    get: (name) =>
      second.get(name).pipe(Effect.flatMap((found) => (found === undefined ? first.get(name) : Effect.succeed(found)))),
  }),
)

/** @experimental Build one layer from composable catalogs. */
export const layer = <R>(
  catalogs: ReadonlyArray<Effect.Effect<Service, SkillCatalogError, R>>,
): Layer.Layer<SkillCatalog, SkillCatalogError, R> =>
  Layer.effect(
    SkillCatalog,
    Effect.forEach(catalogs, (catalog) => catalog).pipe(
      Effect.map((built) => SkillCatalog.of(built.reduce((first, second) => merge(first, second), emptyCatalog))),
    ),
  )

const estimatedTokens = (listingText: string): number => Math.ceil(listingText.length / 4)

const usageRank = (skill: Skill, recentlyUsed: ReadonlyArray<string>): number => {
  const index = recentlyUsed.indexOf(skill.name)
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
      (skill) => skill.disableModelInvocation !== true && estimatedTokens(listing(skill)) <= budgetTokens,
    )
    let total = selected.reduce((sum, skill) => sum + estimatedTokens(listing(skill)), 0)
    while (total > budgetTokens && selected.length > 0) {
      let dropIndex = 0
      for (let index = 1; index < selected.length; index += 1) {
        const candidate = selected[index]
        const current = selected[dropIndex]
        if (
          candidate !== undefined &&
          current !== undefined &&
          usageRank(candidate, recentlyUsed) < usageRank(current, recentlyUsed)
        ) {
          dropIndex = index
        }
      }
      const [dropped] = selected.splice(dropIndex, 1)
      total -= dropped === undefined ? 0 : estimatedTokens(listing(dropped))
    }
    return selected
  },
)
