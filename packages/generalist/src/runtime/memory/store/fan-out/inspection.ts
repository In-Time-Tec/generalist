import { Effect, Function } from "effect"
import { FanOutNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { FanOutInspection } from "../../../child/fan-out.js"
import type { MemoryState, StoredFanOut } from "../../state.js"

const inspection = (fanOut: StoredFanOut): FanOutInspection => ({
  fanOutId: fanOut.fanOutId,
  parentRunId: fanOut.parentRunId,
  idempotencyKey: fanOut.idempotencyKey,
  status: fanOut.status,
  join: fanOut.join,
  remainder: fanOut.remainder,
  concurrency: fanOut.concurrency,
  members: fanOut.members,
})

export const inspectFanOut: {
  (fanOutId: string): (state: MemoryState) => Effect.Effect<FanOutInspection, FanOutNotFound | RuntimeUnavailable>
  (state: MemoryState, fanOutId: string): Effect.Effect<FanOutInspection, FanOutNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, fanOutId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const fanOut = state.fanOuts.get(fanOutId)
  return fanOut === undefined ? Effect.fail(FanOutNotFound.make({ fanOutId })) : Effect.succeed(inspection(fanOut))
})
