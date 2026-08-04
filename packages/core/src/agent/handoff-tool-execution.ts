import { Effect, Ref } from "effect"
import { Chat } from "effect/unstable/ai"
import type { AnyToolCall } from "./agent-tool-result.js"
import type { RunOptions } from "./agent.js"
import type { HandoffRunState } from "./handoff-state.js"
import { FrameworkFailure, type Outcome, type Success } from "../tools/tool-executor.js"
import { type Registry, get } from "../tools/tool-registry.js"
import { executeSameRunHandoff } from "../policy/handoff-runtime.js"
import { lookupHandoffToolMeta } from "../policy/handoff-tool-meta.js"
import { HandoffCatalog } from "../policy/handoff-target.js"

export const runHandoffTool = (input: {
  readonly turn: number
  readonly call: AnyToolCall
  readonly options: RunOptions
  readonly handoffState: Ref.Ref<HandoffRunState>
  readonly chat: Chat.Service
  readonly toolState: Ref.Ref<{
    readonly registry: Registry
    readonly activatedSkillBodies: Map<string, string>
  }>
  readonly resolvingToolCallIds?: ReadonlyArray<string>
}): Effect.Effect<
  Outcome,
  import("./agent.js").RunError,
  HandoffCatalog | import("../durable/driver-interpreter.js").DriverInterpreter
> =>
  Effect.gen(function* () {
    const meta = lookupHandoffToolMeta(input.call.name)
    if (meta === undefined) {
      return yield* FrameworkFailure.make({
        stage: "missing-handler",
        tool: input.call.name,
        message: `Handoff metadata missing for ${input.call.name}`,
      })
    }
    yield* HandoffCatalog
    const accepted = yield* executeSameRunHandoff({
      turn: input.turn,
      toolCallId: input.call.id,
      specialist: meta.specialist,
      params: input.call.params,
      options: input.options,
      handoffState: input.handoffState,
      chat: input.chat,
      toolState: input.toolState,
      ...(input.resolvingToolCallIds === undefined ? {} : { resolvingToolCallIds: input.resolvingToolCallIds }),
      ...(meta.projection === undefined ? {} : { projection: meta.projection }),
      ...(meta.maxRepeatedEdge === undefined ? {} : { maxRepeatedEdge: meta.maxRepeatedEdge }),
    })
    return { _tag: "Success", result: accepted, encodedResult: accepted } satisfies Success
  })

export const handoffDispatch = (
  request: { readonly turn: number; readonly call: AnyToolCall },
  registry: Registry,
  input: {
    readonly options: RunOptions
    readonly handoffState: Ref.Ref<HandoffRunState>
    readonly chat: Chat.Service
    readonly toolState: Ref.Ref<{
      readonly registry: Registry
      readonly activatedSkillBodies: Map<string, string>
    }>
    readonly resolvingToolCallIds?: ReadonlyArray<string>
  },
):
  | Effect.Effect<
      Outcome,
      FrameworkFailure | import("./agent.js").RunError,
      HandoffCatalog | import("../durable/driver-interpreter.js").DriverInterpreter
    >
  | undefined => {
  const registered = get(registry, request.call.name)
  return registered?.dispatch === "Handoff"
    ? runHandoffTool({ turn: request.turn, call: request.call, ...input })
    : undefined
}
