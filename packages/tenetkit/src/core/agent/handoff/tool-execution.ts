import { Effect, Function, Option, Ref } from "effect"
import { Chat } from "effect/unstable/ai"
import type { AnyToolCall } from "../tools/result.js"
import type { RunOptions } from "../service.js"
import type { HandoffRunState } from "./state.js"
import { FrameworkFailure, type Outcome, type Success } from "../../tools/tool-executor.js"
import { type Registry, get } from "../../tools/tool-registry.js"
import { executeSameRunHandoff } from "../../policy/handoff-runtime.js"
import { lookupHandoffToolMeta } from "../../policy/handoff-tool-meta.js"
import { Catalog } from "../../policy/handoff-target.js"

export const runHandoffTool = (input: {
  readonly turn: number
  readonly call: AnyToolCall
  readonly options: RunOptions
  readonly activeSession: Option.Option<import("../../context/session.js").Service>
  readonly handoffState: Ref.Ref<HandoffRunState>
  readonly chat: Chat.Service
  readonly toolState: Ref.Ref<{
    readonly registry: Registry
    readonly activatedSkillBodies: Map<string, string>
  }>
  readonly resolvingToolCallIds?: ReadonlyArray<string>
}): Effect.Effect<
  Outcome,
  import("../service.js").RunError,
  import("../../durable/driver/interpreter.js").DriverInterpreter
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
    const catalog = yield* Effect.serviceOption(Catalog)
    if (Option.isNone(catalog)) {
      return yield* FrameworkFailure.make({
        stage: "missing-handler",
        tool: input.call.name,
        message: `Handoff catalog missing for ${input.call.name}`,
      })
    }
    const handoffInput = {
      catalog: catalog.value,
      turn: input.turn,
      toolCallId: input.call.id,
      specialist: meta.specialist,
      params: input.call.params,
      options: input.options,
      session: input.activeSession,
      handoffState: input.handoffState,
      chat: input.chat,
      toolState: input.toolState,
    }
    const executionInput: import("../../policy/handoff-runtime.js").ExecuteInput = handoffInput
    if (input.resolvingToolCallIds !== undefined)
      Object.assign(executionInput, { resolvingToolCallIds: input.resolvingToolCallIds })
    if (meta.projection !== undefined) Object.assign(executionInput, { projection: meta.projection })
    if (meta.maxRepeatedEdge !== undefined) Object.assign(executionInput, { maxRepeatedEdge: meta.maxRepeatedEdge })
    const accepted = yield* executeSameRunHandoff(executionInput)
    return { _tag: "Success", result: accepted, encodedResult: accepted } satisfies Success
  })

export const handoffDispatch: {
  (
    registry: Registry,
    input: {
      readonly options: RunOptions
      readonly activeSession: Option.Option<import("../../context/session.js").Service>
      readonly handoffState: Ref.Ref<HandoffRunState>
      readonly chat: Chat.Service
      readonly toolState: Ref.Ref<{
        readonly registry: Registry
        readonly activatedSkillBodies: Map<string, string>
      }>
      readonly resolvingToolCallIds?: ReadonlyArray<string>
    },
  ): (request: {
    readonly turn: number
    readonly call: AnyToolCall
  }) =>
    | Effect.Effect<
        Outcome,
        FrameworkFailure | import("../service.js").RunError,
        import("../../durable/driver/interpreter.js").DriverInterpreter
      >
    | undefined
  (
    request: { readonly turn: number; readonly call: AnyToolCall },
    registry: Registry,
    input: {
      readonly options: RunOptions
      readonly activeSession: Option.Option<import("../../context/session.js").Service>
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
        FrameworkFailure | import("../service.js").RunError,
        import("../../durable/driver/interpreter.js").DriverInterpreter
      >
    | undefined
} = Function.dual(
  3,
  (
    request: { readonly turn: number; readonly call: AnyToolCall },
    registry: Registry,
    input: {
      readonly options: RunOptions
      readonly activeSession: Option.Option<import("../../context/session.js").Service>
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
        FrameworkFailure | import("../service.js").RunError,
        import("../../durable/driver/interpreter.js").DriverInterpreter
      >
    | undefined => {
    const registered = get(registry, request.call.name)
    return registered?.dispatch === "Handoff"
      ? runHandoffTool({ turn: request.turn, call: request.call, ...input })
      : undefined
  },
)
