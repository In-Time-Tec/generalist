import { Effect, Ref } from "effect"
import { make as makeSendClock } from "../../model/send-clock.js"
import type { ModelSelection } from "../../model/registry.js"
import type { ToolSchedulingPolicy } from "../service.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { Closed } from "../closure.js"

const ClosedTypeId = Symbol.for("tenetkit/core/agent/closure/Closed")
const isClosed = (agent: HandoffRunState["active"]["agent"]): agent is Closed => ClosedTypeId in agent
export const ActiveTurn = { isClosed }

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
  activeToolScheduling: (): Effect.Effect<ToolSchedulingPolicy> =>
    input.handoffStateRef === undefined
      ? Effect.succeed(input.agent.toolScheduling)
      : Ref.get(input.handoffStateRef).pipe(
          Effect.map((handoffRun) => handoffRun.active.agent.toolScheduling),
          Effect.orElseSucceed(() => input.agent.toolScheduling),
        ),
  sendClock: makeSendClock(),
})
