import { Effect, Option, Ref, Schema } from "effect"
import { AgentError, ToolNameCollision } from "../event.js"
import type { AnyToolCall } from "./result.js"
import { type DomainFailure, FrameworkFailure, type Outcome, type Success } from "../../tools/tool-executor.js"
import { type Candidate, type Registry, assemble } from "../../tools/tool-registry.js"
import { activateSkillParameters } from "../skill-tool.js"
import type { Skill, SkillSourceError } from "../../context/skill-source.js"

const isToolNameCollision = Schema.is(ToolNameCollision)

/** @internal Mutable per-run tool state shared by the executing turn. */
export interface ToolState {
  readonly registry: Registry
  readonly activatedSkillBodies: Map<string, string>
}

interface SkillActivationContext {
  readonly skillRuntime:
    | { readonly source: { readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillSourceError> } }
    | undefined
  readonly toolState: Ref.Ref<ToolState>
  readonly skillError: (turn: number, error: SkillSourceError) => AgentError
}

/** @internal Resolve one `activate_skill` call, registering the skill's tools and body in the run's tool state. */
export const make =
  (context: SkillActivationContext) =>
  (
    turn: number,
    call: AnyToolCall,
    restoredBody?: string,
  ): Effect.Effect<Outcome, AgentError | ToolNameCollision | FrameworkFailure> =>
    Effect.gen(function* () {
      const { skillRuntime, toolState } = context
      if (skillRuntime === undefined) {
        return yield* FrameworkFailure.make({
          stage: "missing-handler",
          tool: call.name,
          message: "SkillSource is not available",
        })
      }
      const params = Schema.decodeUnknownOption(activateSkillParameters)(call.params)
      if (Option.isNone(params)) {
        return yield* FrameworkFailure.make({
          stage: "decode-input",
          tool: call.name,
          message: "Skill activation requires a name",
        })
      }
      const skill = yield* skillRuntime.source.get(params.value.name)
      if (skill === undefined) {
        const failure = { reason: "not-found" as const, message: `Skill not found: ${params.value.name}` }
        return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
      }
      if (skill.frontmatter.disableModelInvocation === true) {
        const failure = {
          reason: "not-model-invocable" as const,
          message: `Skill is not model-invocable: ${params.value.name}`,
        }
        return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
      }
      const current = yield* Ref.get(toolState)
      let body = current.activatedSkillBodies.get(skill.frontmatter.name)
      if (body === undefined) {
        const registry = yield* assemble([
          ...current.registry.entries,
          ...skill.tools.map(
            (tool): Candidate => ({
              tool,
              origin: { _tag: "Skill", skill: skill.frontmatter.name },
              dispatch: "Skill",
            }),
          ),
        ])
        body = restoredBody ?? (yield* skill.body)
        const activatedSkillBodies = new Map(current.activatedSkillBodies)
        activatedSkillBodies.set(skill.frontmatter.name, body)
        yield* Ref.set(toolState, { registry, activatedSkillBodies })
      }
      const output = {
        name: skill.frontmatter.name,
        body,
        allowedTools: [...(skill.frontmatter.allowedTools ?? [])],
      }
      return { _tag: "Success", result: output, encodedResult: output } satisfies Success
    }).pipe(
      Effect.mapError((error) =>
        isToolNameCollision(error) || Schema.is(FrameworkFailure)(error) ? error : context.skillError(turn, error),
      ),
    )
