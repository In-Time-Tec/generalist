import { Effect, Queue } from "effect"
import { SubscriberLagged } from "../../../errors.js"
import type { MemoryPublication, MemoryState } from "../../state.js"
import { publish as publishHostSession } from "../host-session.js"

/** Publish committed Run and Session events without blocking their producers. */
export const publish = (input: {
  readonly initial: MemoryState
  readonly publications: ReadonlyArray<MemoryPublication>
}) =>
  Effect.gen(function* () {
    let state = input.initial
    for (const publication of input.publications) {
      yield* Effect.forEach(publication.treeSubscribers.values(), (queue) => Queue.offer(queue, undefined), {
        discard: true,
      })
      for (const [subscriberId, queue] of publication.subscribers) {
        const run = state.runs.get(publication.runId)
        if (run?.subscribers.get(subscriberId) !== queue) continue
        const offered = yield* Queue.offer(queue, publication.event)
        if (offered) continue
        yield* Queue.fail(
          queue,
          SubscriberLagged.make({
            runId: publication.runId,
            lastDeliveredSequence: publication.lastDeliveredSequence,
          }),
        )
        const subscribers = new Map(run.subscribers)
        subscribers.delete(subscriberId)
        const runs = new Map(state.runs)
        runs.set(run.runId, { ...run, subscribers })
        state = Object.assign({}, state, { runs })
      }
      if (publication.hostSession !== undefined) {
        state = yield* publishHostSession({ state, publication: publication.hostSession })
      }
    }
    return state
  })
