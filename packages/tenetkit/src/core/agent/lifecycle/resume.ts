import { Effect, Option, Schema } from "effect"
import { assemble, type Candidate } from "../../tools/tool-registry.js"
import { Instructions, openEpoch } from "../../context/instructions.js"
import { listing, SkillCatalog, selectListings } from "../../context/skill-catalog.js"
import { refreshResumeSystem } from "../session/history.js"
import { activateSkillTool, skillListingBudgetTokens } from "../skill-tool.js"
import { skillListingsInstructions } from "../message.js"
import { AgentError } from "../event.js"
import type { Agent, RunOptions } from "../service.js"
import { SetupHelpers } from "./construction.js"

const { appendInstructionFragment, errorMessage } = SetupHelpers

/** @internal Resolve skills and the authoritative system instructions for this run. */
export const setupPromptContext = <T extends Record<string, import("effect/unstable/ai").Tool.Any>, R>(args: {
  readonly agent: Agent<T, R>
  readonly options: RunOptions
  readonly activeSession: Option.Option<import("../../context/session.js").Service>
  readonly resumeChat: import("effect/unstable/ai").Chat.Service | undefined
  readonly staticCandidates: ReadonlyArray<Candidate>
}) =>
  Effect.gen(function* () {
    const instructionsService = yield* Effect.serviceOption(Instructions)
    const skillSourceService = yield* Effect.serviceOption(SkillCatalog)
    const skillRuntime = Option.isNone(skillSourceService)
      ? undefined
      : {
          source: skillSourceService.value,
          skills: yield* skillSourceService.value.all.pipe(
            Effect.mapError((error) => AgentError.make({ message: error.message, turn: 0, cause: error })),
          ),
        }
    const selectedSkills =
      skillRuntime === undefined ? [] : selectListings(skillRuntime.skills, skillListingBudgetTokens, [])
    const skillListings = selectedSkills.map((skill) => listing(skill)).join("\n")
    const hasActivatableSkills = selectedSkills.length > 0
    const initialRegistry = yield* assemble([
      ...args.staticCandidates,
      ...(hasActivatableSkills
        ? [
            {
              tool: activateSkillTool,
              origin: { _tag: "Builtin", builtin: "activate_skill" } as const,
              dispatch: "Builtin" as const,
            },
          ]
        : []),
    ])
    const derivesCurrentSystem = args.options.history === undefined || Option.isSome(args.activeSession)
    const instructionsEpoch =
      args.options.system === undefined && derivesCurrentSystem && Option.isSome(instructionsService)
        ? yield* openEpoch(instructionsService.value, { agentName: args.agent.name, turn: 0 })
        : undefined
    const epochSystem =
      instructionsEpoch === undefined || instructionsEpoch.length === 0 ? args.agent.instructions : instructionsEpoch
    const baseSystem = args.options.system ?? epochSystem
    const system = appendInstructionFragment(
      baseSystem,
      derivesCurrentSystem && skillListings.length > 0 ? skillListingsInstructions(skillListings) : undefined,
    )
    const supplemental =
      args.agent.supplemental === undefined || args.agent.supplemental === "" ? undefined : args.agent.supplemental
    yield* refreshResumeSystem({ chat: args.resumeChat, activeSession: args.activeSession, system, supplemental }).pipe(
      Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
    )
    return {
      instructionsService,
      skillSourceService,
      skillRuntime,
      selectedSkills,
      skillListings,
      hasActivatableSkills,
      initialRegistry,
      instructionsEpoch,
      baseSystem,
      system,
      supplemental,
    }
  })

/** @experimental Re-entry resolution for an authoritative suspension checkpoint. */
export const ResumeResolution = Schema.Union([
  Schema.TaggedStruct("Approved", {}),
  Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  Schema.TaggedStruct("Signal", { name: Schema.String, payload: Schema.optionalKey(Schema.Unknown) }),
])

/** @experimental Decoded re-entry resolution for an authoritative suspension checkpoint. */
export type ResumeResolution = typeof ResumeResolution.Type

/** @experimental Agent options known to contain a model selection. */
export interface WithModelDefault {
  readonly model: import("../../model/registry.js").ModelSelection
}
