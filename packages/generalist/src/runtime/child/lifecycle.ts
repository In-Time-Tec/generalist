import { Effect, Option, Schema, Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import { childEnd as applyChildEnd, childStart as applyChildStart } from "../../core/agent/lifecycle/hooks.js"
import { DriverError, DriverStateInvalid } from "../../core/durable/service.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import type { Request, SettledOutcome, Success } from "../../core/tools/tool-executor.js"
import { HookFailed, type Child, type ChildEndInput, type ChildStartInput } from "../../hooks/index.js"
import {
  GroupChildResult,
  GroupResult,
  Parameters,
  Result,
  awaitGroupToolName,
  runGroupToolName,
  toolName,
} from "./group.js"

export type ChildHookError = HookFailed | DriverError | DriverStateInvalid

interface Blocked {
  readonly message: string
}

const success = <Result>(result: Result): Success => ({ _tag: "Success", result, encodedResult: result })

const start = (input: ChildStartInput, description: string): Effect.Effect<void, ChildHookError | Blocked> =>
  applyChildStart(input).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.void
        : Effect.fail({ message: `ChildStart hook blocked ${description}: ${result.blocked}` }),
    ),
  )

const end = (
  input: ChildEndInput,
  description: string,
): Effect.Effect<typeof Schema.Unknown.Type, ChildHookError | Blocked> =>
  applyChildEnd(input).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.succeed(result.input.result)
        : Effect.fail({ message: `ChildEnd hook blocked ${description}: ${result.blocked}` }),
    ),
  )

const endGroup = (parentRunId: string, result: GroupResult): Effect.Effect<GroupResult, ChildHookError | Blocked> =>
  Effect.gen(function* () {
    const parent = yield* Effect.serviceOption(ToolContext)
    const agentName = Option.isSome(parent) ? (parent.value.agentName ?? "runtime") : "runtime"
    const turn = Option.isSome(parent) ? (parent.value.turn ?? 0) : 0
    const children: Array<GroupChildResult> = []
    for (const member of result.children) {
      const child: Types.Mutable<Child> = {
        operation: `${result.groupId}:${member.key}`,
        selection: member.selection,
        childRunId: member.childRunId,
      }
      if (member.label !== undefined) child.label = member.label
      const transformed = yield* end(
        { runId: parentRunId, agentName, turn, child, result: member },
        `group member '${member.key}'`,
      )
      const decoded = yield* Schema.decodeUnknownEffect(GroupChildResult)(transformed).pipe(
        Effect.mapError(() => ({
          message: `ChildEnd hook returned an invalid result for group member '${member.key}'`,
        })),
      )
      children.push(decoded)
    }
    return { ...result, children }
  })

const transformResolved = (
  request: Request,
  outcome: SettledOutcome,
): Effect.Effect<SettledOutcome, ChildHookError | Blocked> => {
  if (outcome._tag === "DomainFailure") return Effect.succeed(outcome)
  const parent = Effect.serviceOption(ToolContext)
  if (request.call.name === toolName) {
    return Effect.gen(function* () {
      const context = yield* parent
      const input = yield* Schema.decodeUnknownEffect(Parameters)(request.call.params)
      const result = yield* Schema.decodeUnknownEffect(Result)(outcome.result)
      const child: Types.Mutable<Child> = {
        operation: Option.isSome(context) ? (context.value.operationKey ?? request.call.id) : request.call.id,
        selection: input.selection,
        prompt: Prompt.make(input.prompt),
        childRunId: result.childRunId,
      }
      if (input.label !== undefined) child.label = input.label
      const transformed = yield* end(
        {
          runId: Option.isSome(context) ? (context.value.runId ?? "runtime") : "runtime",
          agentName: request.agentName,
          turn: request.turn,
          child,
          result,
        },
        `'${input.selection}'`,
      )
      return success(yield* Schema.decodeUnknownEffect(Result)(transformed))
    })
  }
  if (request.call.name === runGroupToolName || request.call.name === awaitGroupToolName) {
    return Effect.gen(function* () {
      const context = yield* parent
      const result = yield* Schema.decodeUnknownEffect(GroupResult)(outcome.result)
      const parentRunId = Option.isSome(context) ? (context.value.runId ?? "runtime") : "runtime"
      return success(yield* endGroup(parentRunId, result))
    })
  }
  return Effect.succeed(outcome)
}

export const ChildLifecycle = { start, end, endGroup, transformResolved }
