import { Context, Effect, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { ToolContext } from "../../tools/tool-context.js"
import { FrameworkFailure, type Outcome, type Request } from "../../tools/tool-executor.js"
import type { Child as LifecycleChild } from "../../../hooks/index.js"
import { AgentError } from "../event.js"
import { childEnd as applyChildEnd, childStart as applyChildStart } from "../lifecycle/hooks.js"
import { definition as fanOutDefinition, validateAuthority, type Definition } from "../tool/fan-out.js"
import type { Any as AnyAgent } from "../lifecycle/definition.js"
import { inheritedHistory, ProcessRunner, run, type AnyChild } from "../lifecycle/fan-out.js"
import { current as currentTasks } from "../../../tasks/internal.js"
import { get, type Registry } from "../../tools/tool-registry.js"

type Invocation = AnyChild & { readonly lifecycle: LifecycleChild }

const frameworkFailure = (request: Request, stage: "decode-input" | "encode-success" | "handler", message: string) =>
  FrameworkFailure.make({ stage, tool: request.call.name, message })

/** @internal Attach the current parent list only when a durable fan-out profile requests it. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal executor seam with two required inputs.
export const withParentTasks = (request: Request, registry: Registry) => {
  const registered = get(registry, request.call.name)
  const definition = registered === undefined ? undefined : fanOutDefinition(registered.tool)
  if (definition === undefined || !Object.values(definition.inheritance).some((inherit) => inherit.tasks === "read")) {
    return Effect.succeed(request)
  }
  return currentTasks.pipe(Effect.map((tasks) => ({ ...request, tasks })))
}

/** @internal Execute one model-authored fan-out through Agent.run's process-local child runner. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal tool-execution seam with two required direct-style arguments.
export const execute = (parentAgent: AnyAgent, definition: Definition, request: Request) =>
  Effect.gen(function* () {
    const current = yield* Effect.context<never>()
    const context = Context.makeUnsafe<unknown>(current.mapUnsafe)
    const parameters = yield* definition
      .decode(request.call.params, context)
      .pipe(Effect.mapError((error) => frameworkFailure(request, "decode-input", error.message)))
    const runner = yield* Effect.serviceOption(ProcessRunner)
    if (Option.isNone(runner)) {
      return yield* frameworkFailure(request, "handler", "AgentTool.fanOut requires Agent.run or a Runtime")
    }
    const parent = yield* ToolContext
    yield* validateAuthority(
      parentAgent,
      definition,
      parameters.children.map((member) => member.agent),
    )
    const parentHistory = parent.history === undefined ? undefined : yield* parent.history
    const parentTasks = parameters.children.some((member) => member.inherit.tasks === "read")
      ? yield* currentTasks
      : undefined
    const invocations: Array<Invocation> = []
    for (const [index, member] of parameters.children.entries()) {
      const agent = definition.agents[member.agent]
      if (agent === undefined) {
        return yield* frameworkFailure(request, "decode-input", `Unknown fan-out Agent selection: ${member.agent}`)
      }
      const prompt = yield* definition
        .encodeInput(member.agent, member.input, context)
        .pipe(Effect.mapError((error) => frameworkFailure(request, "decode-input", error.message)))
      const history = inheritedHistory(member.inherit.history, parentHistory)
      invocations.push({
        agent,
        input: member.input,
        inherit: member.inherit,
        ...Object.assign({}, history === undefined ? undefined : { history }),
        ...Object.assign({}, member.inherit.tasks === "read" ? { tasks: parentTasks ?? [] } : undefined),
        lifecycle: {
          operation: `${request.call.id}:${index}`,
          selection: member.agent,
          prompt: Prompt.make(prompt),
        },
      })
    }
    const exits = yield* run(
      invocations,
      {
        concurrency: parameters.concurrency ?? definition.maxChildren,
        onFailure: parameters.onFailure ?? "collect",
      },
      (invocation) =>
        Effect.gen(function* () {
          const identity = {
            runId: parent.runId ?? `local:${request.sessionId}`,
            agentName: parent.agentName ?? request.agentName,
            turn: parent.turn ?? request.turn,
          }
          const started = yield* applyChildStart({ ...identity, child: invocation.lifecycle })
          if (started.blocked !== undefined) {
            return yield* AgentError.make({
              message: `ChildStart hook blocked '${invocation.agent.name}': ${started.blocked}`,
              turn: request.turn,
            })
          }
          const result = yield* runner.value.run(invocation)
          const ended = yield* applyChildEnd({ ...identity, child: invocation.lifecycle, result })
          if (ended.blocked !== undefined) {
            return yield* AgentError.make({
              message: `ChildEnd hook blocked '${invocation.agent.name}' result: ${ended.blocked}`,
              turn: request.turn,
            })
          }
          return ended.input.result
        }),
    )
    const encodedResult = yield* definition
      .encode(exits, context)
      .pipe(Effect.mapError((error) => frameworkFailure(request, "encode-success", error.message)))
    return { _tag: "Success", result: exits, encodedResult } satisfies Outcome
  })
