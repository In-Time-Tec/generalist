import { Context, Effect, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { BudgetLimits } from "../../durable/run-budget.js"
import { ToolContext } from "../../tools/tool-context.js"
import { FrameworkFailure, type Outcome, type Request } from "../../tools/tool-executor.js"
import type { Child as LifecycleChild } from "../../../hooks/index.js"
import { AgentError } from "../event.js"
import { childEnd as applyChildEnd, childStart as applyChildStart } from "../lifecycle/hooks.js"
import type { Definition } from "../tool/fan-out.js"
import { ProcessRunner, child, run, type AnyChild } from "../lifecycle/fan-out.js"

type Invocation = AnyChild & { readonly budget?: BudgetLimits; readonly lifecycle: LifecycleChild }

const frameworkFailure = (request: Request, stage: "decode-input" | "encode-success" | "handler", message: string) =>
  FrameworkFailure.make({ stage, tool: request.call.name, message })

/** @internal Execute one model-authored fan-out through Agent.run's process-local child runner. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal tool-execution seam with two required direct-style arguments.
export const execute = (definition: Definition, request: Request) =>
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
    const invocations: Array<Invocation> = []
    for (const [index, member] of parameters.children.entries()) {
      const agent = definition.agents[member.agent]
      if (agent === undefined) {
        return yield* frameworkFailure(request, "decode-input", `Unknown fan-out Agent selection: ${member.agent}`)
      }
      const prompt = yield* definition
        .encodeInput(member.agent, member.input, context)
        .pipe(Effect.mapError((error) => frameworkFailure(request, "decode-input", error.message)))
      invocations.push({
        ...child(agent, member.input),
        lifecycle: {
          operation: `${request.call.id}:${index}`,
          selection: member.agent,
          prompt: Prompt.make(prompt),
        },
        ...Object.assign({}, member.budget === undefined ? undefined : { budget: member.budget }),
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
          const result = yield* runner.value.run(invocation, invocation.budget)
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
