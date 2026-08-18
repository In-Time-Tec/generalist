import { Effect, Ref } from "effect"
import { makeSendClock } from "../model/prompt-cache.js"
import type { ModelSelection } from "../model/model-registry.js"
import type { ToolSchedulingPolicy } from "./agent.js"
import type { HandoffRunState } from "./handoff-state.js"

/** @internal Resolve turn-scoped authority from the current handoff state. */
export const makeActiveTurn = (input: {
  readonly agent: { readonly name: string; readonly toolScheduling: ToolSchedulingPolicy }
  readonly handoffStateRef?: Ref.Ref<HandoffRunState>
  readonly agentModel: ModelSelection | undefined
}) => ({
  activeAgentName: (): Effect.Effect<string> =>
    input.handoffStateRef === undefined
      ? Effect.succeed(input.agent.name)
      : Ref.get(input.handoffStateRef).pipe(
          Effect.map((handoffRun) => handoffRun.active.name),
          Effect.orElseSucceed(() => input.agent.name),
        ),
  activeModelSelection: (): Effect.Effect<ModelSelection | undefined> =>
    input.handoffStateRef === undefined
      ? Effect.succeed(input.agentModel)
      : Ref.get(input.handoffStateRef).pipe(
          Effect.map((handoffRun) => handoffRun.active.agent.model ?? input.agentModel),
          Effect.orElseSucceed(() => input.agentModel),
        ),
  activeToolScheduling: (): Effect.Effect<ToolSchedulingPolicy> =>
    input.handoffStateRef === undefined
      ? Effect.succeed(input.agent.toolScheduling)
      : Ref.get(input.handoffStateRef).pipe(
          Effect.map((handoffRun) => handoffRun.active.agent.toolScheduling),
          Effect.orElseSucceed(() => input.agent.toolScheduling),
        ),
  sendClock: makeSendClock(),
})
