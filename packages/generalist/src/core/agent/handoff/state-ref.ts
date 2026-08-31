import { Effect, Function, Ref, Schema } from "effect"
import { AgentPin } from "../../durable/pin.js"
import type { Any as AnyAgent } from "../closure.js"
import { type ControlState, type HandoffRunState, fromControlState, initialHandoffRunState } from "./state.js"

export const make: {
  (activePin?: AgentPin, restored?: ControlState): (agent: AnyAgent) => Effect.Effect<Ref.Ref<HandoffRunState>>
  (agent: AnyAgent, activePin?: AgentPin, restored?: ControlState): Effect.Effect<Ref.Ref<HandoffRunState>>
} = Function.dual(
  (args) => args.length >= 1 && !Schema.is(AgentPin)(args[0]),
  (agent: AnyAgent, activePin?: AgentPin, restored?: ControlState): Effect.Effect<Ref.Ref<HandoffRunState>> =>
    Ref.make(
      restored === undefined
        ? initialHandoffRunState(agent, activePin)
        : fromControlState(
            restored,
            activePin === undefined ? { name: agent.name, agent } : { name: agent.name, agent, pin: activePin },
          ),
    ),
)

export { type HandoffRunState, takePendingContinuation } from "./state.js"
