import { Effect, type Layer, Ref } from "effect"
import type { LanguageModel } from "effect/unstable/ai"
import { make as makeSendClock } from "../../model/send-clock.js"
import type { ModelSelection } from "../../model/registry.js"
import type { ToolSchedulingPolicy } from "../service.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { Closed } from "../closure.js"
import { isClosed } from "../lifecycle/closure-identity.js"

const isClosedAgent = (agent: HandoffRunState["active"]["agent"]): agent is Closed => isClosed(agent)
export const ActiveTurn = { isClosed: isClosedAgent }

/** @internal Resolve turn-scoped authority from the current handoff state. */
export const make = (input: {
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
  activeModelOverride: (): Effect.Effect<Layer.Layer<LanguageModel.LanguageModel> | undefined> =>
    input.handoffStateRef === undefined
      ? Effect.succeed(undefined)
      : Ref.get(input.handoffStateRef).pipe(
          Effect.map((handoffRun) => handoffRun.active.model),
          Effect.orElseSucceed(() => undefined),
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
