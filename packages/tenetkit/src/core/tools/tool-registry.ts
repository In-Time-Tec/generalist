import { Array, Effect, HashMap, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Tool, Toolkit } from "effect/unstable/ai"
import { ToolNameCollision, type ToolOrigin } from "../agent/event.js"

/** @experimental */
export type Dispatch = "Static" | "Builtin" | "Skill" | "Handoff"

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
    const name = Schema.decodeUnknownSync(Schema.String)(entry.tool.name)
    if (!Object.hasOwn(toolkit.tools, name)) {
      Object.defineProperty(toolkit.tools, name, {
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
  const named = candidates.map((candidate) => ({
    candidate,
    name: Schema.decodeUnknownSync(Schema.String)(candidate.tool.name),
  }))
  const grouped = Array.groupBy(named, ({ name }) => `tool:${name}`)
  for (const { name } of named) {
    const conflicts = grouped[`tool:${name}`]
    if (conflicts !== undefined && conflicts.length > 1) {
      return Effect.fail(
        ToolNameCollision.make({
          name,
          origins: Array.map(conflicts, ({ candidate: conflict }) => conflict.origin),
        }),
      )
    }
  }
  const entries = [...candidates]
  return Effect.succeed({
    entries,
    byName: HashMap.fromIterable(
      entries.map((candidate) => [Schema.decodeUnknownSync(Schema.String)(candidate.tool.name), candidate] as const),
    ),
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
  const entries = registry.entries.filter((entry) =>
    names.includes(Schema.decodeUnknownSync(Schema.String)(entry.tool.name)),
  )
  return {
    entries,
    byName: HashMap.fromIterable(
      entries.map((candidate) => [Schema.decodeUnknownSync(Schema.String)(candidate.tool.name), candidate] as const),
    ),
    toolkit: makeToolkit(entries),
  }
})
