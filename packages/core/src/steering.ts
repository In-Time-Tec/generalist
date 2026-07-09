import { Context, Effect, Exit, Layer, Queue } from "effect"
import { Prompt } from "effect/unstable/ai"
/** @experimental How many queued messages to drain at a boundary. */
export type QueueMode = "all" | "one-at-a-time"

/** @experimental Prompt injected into a live agent run. */
export interface Message {
  readonly prompt: Prompt.RawInput
}

/** @experimental Options for the in-memory steering layer. */
export interface MakeOptions {
  readonly steeringMode?: QueueMode
  readonly followUpMode?: QueueMode
}

/** @experimental In-process steering service boundary. */
export interface Interface {
  readonly steer: (message: Message) => Effect.Effect<void>
  readonly followUp: (message: Message) => Effect.Effect<void>
  readonly takeSteering: () => Effect.Effect<ReadonlyArray<Message>>
  readonly takeFollowUp: () => Effect.Effect<ReadonlyArray<Message>>
}

/** @experimental */
export class Steering extends Context.Service<Steering, Interface>()("@batonfx/core/Steering") {}

const drainOne = (queue: Queue.Queue<Message>): Effect.Effect<ReadonlyArray<Message>> =>
  Effect.sync(() => {
    const taken = Queue.takeUnsafe(queue)
    return taken === undefined || !Exit.isSuccess(taken) ? [] : [taken.value]
  })

const drain = (queue: Queue.Queue<Message>, mode: QueueMode): Effect.Effect<ReadonlyArray<Message>> =>
  mode === "all" ? Queue.clear(queue) : drainOne(queue)

/** @experimental In-memory steering backed by two unbounded queues. */
export const layer = (options: MakeOptions = {}): Layer.Layer<Steering> =>
  Layer.effect(
    Steering,
    Effect.gen(function* () {
      const steeringQueue = yield* Queue.unbounded<Message>()
      const followUpQueue = yield* Queue.unbounded<Message>()
      const steeringMode = options.steeringMode ?? "all"
      const followUpMode = options.followUpMode ?? "one-at-a-time"

      return Steering.of({
        steer: (message) => Queue.offer(steeringQueue, message).pipe(Effect.asVoid),
        followUp: (message) => Queue.offer(followUpQueue, message).pipe(Effect.asVoid),
        takeSteering: () => drain(steeringQueue, steeringMode),
        takeFollowUp: () => drain(followUpQueue, followUpMode),
      })
    }),
  )

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Steering> =>
  Layer.succeed(Steering, Steering.of(implementation))
