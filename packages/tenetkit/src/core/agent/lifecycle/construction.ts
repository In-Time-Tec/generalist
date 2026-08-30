import { Effect, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import { AgentError } from "../event.js"
import type { Agent, ToolDeclaration } from "../service.js"
import { dispatchForOrigin } from "../tools/dispatch.js"
import { type Candidate, assemble } from "../../tools/tool-registry.js"

const errorMessage = <E>(error: E): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)
const appendInstructionFragment = (base: string | undefined, fragment: string | undefined): string | undefined => {
  if (fragment === undefined || fragment.length === 0) return base
  if (base === undefined || base.length === 0) return fragment
  return `${base}\n\n${fragment}`
}
const defaultProgressOverflowPolicy = { _tag: "Backpressure", capacity: 64 } as const
const progressCapacitySchema = Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
const progressOverflowPolicySchema = Schema.Union([
  Schema.TaggedStruct("Backpressure", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Dropping", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Sliding", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Fail", { capacity: progressCapacitySchema }),
])

type StaticDeclaration = { readonly origin: import("../event.js").ToolOrigin; readonly tool: Tool.Any }

/** @internal Validate and assemble the immutable tools declared by an Agent. */
export const setupStaticTools = <T extends Record<string, Tool.Any>, R, P, A>(agent: Agent<T, R, P, A>) =>
  Effect.gen(function* () {
    const declarations: ReadonlyArray<StaticDeclaration> =
      agent.toolDeclarations ??
      Object.values(agent.toolkit.tools).map((tool) => ({
        tool,
        origin: { _tag: "Static" as const, agent: agent.name },
      }))
    const candidates: ReadonlyArray<Candidate> = declarations.map(({ origin, tool }) => ({
      origin,
      tool,
      dispatch: dispatchForOrigin(origin),
    }))
    const registry = yield* assemble(candidates)
    const declarationsDiffer =
      agent.toolDeclarations !== undefined &&
      (agent.toolDeclarations.length !== Object.keys(agent.toolkit.tools).length ||
        agent.toolDeclarations.some(
          (declaration: ToolDeclaration) => agent.toolkit.tools[String(declaration.tool.name)] !== declaration.tool,
        ))
    if (declarationsDiffer) {
      return yield* AgentError.make({
        message: "Agent tool declarations and toolkit must contain the same tool instances",
        turn: 0,
      })
    }
    const tools = { ...agent.toolkit.tools }
    const staticToolkit = Object.assign({}, agent.toolkit, { tools })
    return { staticCandidates: candidates, staticRegistry: registry, staticToolkit }
  })

/** @internal Small setup codecs and normalizers kept outside the composition root. */
export const SetupHelpers = {
  errorMessage,
  appendInstructionFragment,
  defaultProgressOverflowPolicy,
  progressOverflowPolicySchema,
}
export type { StaticDeclaration }
