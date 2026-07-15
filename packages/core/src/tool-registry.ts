import { Effect, HashMap, Option } from "effect"
import { dual } from "effect/Function"
import { Tool, Toolkit } from "effect/unstable/ai"
import { ToolNameCollision, type ToolOrigin } from "./agent-event.js"

/** @experimental */
export type Dispatch = "Static" | "Builtin" | "Skill"

/** @experimental */
export interface Candidate {
  readonly tool: Tool.Any
  readonly origin: ToolOrigin
  readonly dispatch: Dispatch
}

/** @experimental */
export interface Registry {
  readonly entries: ReadonlyArray<Candidate>
  readonly byName: HashMap.HashMap<string, Candidate>
  readonly toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
}

const makeToolkit = (entries: ReadonlyArray<Candidate>): Toolkit.Toolkit<Record<string, Tool.Any>> => {
  const toolkit = Toolkit.make(...entries.map((candidate) => candidate.tool))
  for (const entry of entries) {
    if (!Object.hasOwn(toolkit.tools, entry.tool.name)) {
      Object.defineProperty(toolkit.tools, entry.tool.name, {
        configurable: true,
        enumerable: true,
        value: entry.tool,
        writable: true,
      })
    }
  }
  return toolkit
}

/** @experimental */
export const assemble = (candidates: ReadonlyArray<Candidate>): Effect.Effect<Registry, ToolNameCollision> => {
  const grouped = new Map<string, Array<Candidate>>()
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.tool.name)
    if (existing === undefined) grouped.set(candidate.tool.name, [candidate])
    else existing.push(candidate)
  }
  for (const candidate of candidates) {
    const conflicts = grouped.get(candidate.tool.name)
    if (conflicts !== undefined && conflicts.length > 1) {
      return Effect.fail(
        ToolNameCollision.make({
          name: candidate.tool.name,
          origins: [conflicts[0]!.origin, ...conflicts.slice(1).map((conflict) => conflict.origin)],
        }),
      )
    }
  }
  const entries = [...candidates]
  return Effect.succeed({
    entries,
    byName: HashMap.fromIterable(entries.map((candidate) => [candidate.tool.name, candidate] as const)),
    toolkit: makeToolkit(entries),
  })
}

/** @experimental */
export const get: {
  (name: string): (registry: Registry) => Candidate | undefined
  (registry: Registry, name: string): Candidate | undefined
} = dual(2, (registry: Registry, name: string): Candidate | undefined =>
  Option.getOrUndefined(HashMap.get(registry.byName, name)),
)

/** @experimental */
export const select: {
  (names: ReadonlyArray<string>): (registry: Registry) => Registry
  (registry: Registry, names: ReadonlyArray<string>): Registry
} = dual(2, (registry: Registry, names: ReadonlyArray<string>): Registry => {
  const entries = registry.entries.filter((entry) => names.includes(entry.tool.name))
  return {
    entries,
    byName: HashMap.fromIterable(entries.map((candidate) => [candidate.tool.name, candidate] as const)),
    toolkit: makeToolkit(entries),
  }
})
