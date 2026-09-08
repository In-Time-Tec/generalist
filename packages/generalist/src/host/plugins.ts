import { Effect, Function, Option } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { Skill } from "../core/context/skill-catalog.js"
import { make as makeHooks, type Declaration as HookDeclaration, type Service as HooksService } from "../hooks/index.js"
import type { Provider as InstructionProvider } from "../instructions/providers.js"
import { PluginNameConflict, PluginToolConflict } from "./errors.js"

export const mergedHooks: {
  (contributed: ReadonlyArray<HookDeclaration>): (current: Option.Option<HooksService>) => HooksService | undefined
  (current: Option.Option<HooksService>, contributed: ReadonlyArray<HookDeclaration>): HooksService | undefined
} = Function.dual(
  2,
  (current: Option.Option<HooksService>, contributed: ReadonlyArray<HookDeclaration>): HooksService | undefined => {
    const existing = Option.getOrUndefined(current)
    if (contributed.length === 0) return existing
    return makeHooks({ declarations: [...(existing?.declarations ?? []), ...contributed] })
  },
)

/** One deterministic collection of host-owned Agent contributions. */
export interface Plugin<Tools extends ReadonlyArray<Tool.Any> = ReadonlyArray<never>> {
  readonly name: string
  readonly tools?: Tools
  readonly instructions?: ReadonlyArray<InstructionProvider>
  readonly skills?: ReadonlyArray<Skill>
  readonly hooks?: ReadonlyArray<HookDeclaration>
}

interface PluginContributions {
  readonly tools: ReadonlyArray<Tool.Any>
  readonly instructions: ReadonlyArray<InstructionProvider>
  readonly skills: ReadonlyArray<Skill>
  readonly hooks: ReadonlyArray<HookDeclaration>
}

const toolName = (tool: Tool.Any): string => String(tool.name)

export const make = (options: {
  readonly plugins: ReadonlyArray<Plugin<ReadonlyArray<Tool.Any>>>
  readonly agents: ReadonlyArray<AnyAgent>
}): Effect.Effect<PluginContributions, PluginNameConflict | PluginToolConflict> =>
  Effect.gen(function* () {
    const { plugins, agents } = options
    const pluginNames = new Set<string>()
    const pluginTools = new Map<string, { readonly plugin: string; readonly tool: Tool.Any }>()
    const instructions: Array<InstructionProvider> = []
    const skills: Array<Skill> = []
    const hooks: Array<HookDeclaration> = []
    for (const current of plugins) {
      if (pluginNames.has(current.name)) {
        return yield* PluginNameConflict.make({
          name: current.name,
          hint: "Give each host plugin a unique name.",
        })
      }
      pluginNames.add(current.name)
      for (const tool of current.tools ?? []) {
        const name = toolName(tool)
        const existing = pluginTools.get(name)
        if (existing !== undefined) {
          return yield* PluginToolConflict.make({
            name,
            sources: [existing.plugin, current.name],
            hint: "Rename or remove one of the colliding plugin tools.",
          })
        }
        pluginTools.set(name, { plugin: current.name, tool })
      }
      instructions.push(...(current.instructions ?? []))
      skills.push(...(current.skills ?? []))
      hooks.push(...(current.hooks ?? []))
    }

    const tools = [...pluginTools.values()].map(({ tool }) => tool)
    for (const agent of agents) {
      for (const tool of tools) {
        const name = toolName(tool)
        if (!Object.hasOwn(agent.toolkit.tools, name)) continue
        return yield* PluginToolConflict.make({
          name,
          sources: [`agent:${agent.name}`, `plugin:${pluginTools.get(name)!.plugin}`],
          hint: "Rename or remove the plugin tool that collides with the Agent's static toolkit.",
        })
      }
    }

    for (const [index, current] of plugins.entries()) {
      yield* Effect.logInfo("Loaded Generalist host plugin").pipe(
        Effect.annotateLogs({
          "generalist.host.plugin.name": current.name,
          "generalist.host.plugin.index": index,
          "generalist.host.plugin.count": plugins.length,
        }),
      )
    }
    return { tools, instructions, skills, hooks }
  })
