import { Context, Effect, Exit, Layer, Queue, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
/** @experimental How many queued messages to drain at a boundary. */
export type DrainMode = "all" | "one-at-a-time"

/** @experimental What a bounded queue does when a producer offers while full. */
export type OverflowStrategy = "suspend" | "fail" | "drop-newest" | "drop-oldest"

/** @experimental Policy for one steering queue. */
export interface QueuePolicy {
  readonly mode?: DrainMode
  readonly capacity?: number
  readonly onFull?: OverflowStrategy
}

/** @experimental Queue identity for typed steering errors. */
export type QueueName = "steering" | "followUp"

/** @experimental Prompt injected into a live agent run. */
export interface Message {
  readonly prompt: Prompt.RawInput
}

/** @experimental Options for the in-memory steering layer. */
export interface MakeOptions {
  readonly steering?: QueuePolicy
  readonly followUp?: QueuePolicy
}

/** @experimental In-process steering service boundary. */
export interface Interface {
  readonly steer: (message: Message) => Effect.Effect<void, SteeringQueueFull>
  readonly followUp: (message: Message) => Effect.Effect<void, SteeringQueueFull>
  readonly takeSteering: Effect.Effect<ReadonlyArray<Message>>
  readonly takeFollowUp: Effect.Effect<ReadonlyArray<Message>>
}

/** @experimental */
export class Steering extends Context.Service<Steering, Interface>()("@batonfx/core/Steering") {}

/** @experimental Bounded steering queue rejected a message. */
export class SteeringQueueFull extends Schema.TaggedErrorClass<SteeringQueueFull>()("@batonfx/core/SteeringQueueFull", {
  queue: Schema.Literals(["steering", "followUp"]),
  capacity: Schema.Finite,
}) {}

interface ResolvedQueuePolicy {
  readonly mode: DrainMode
  readonly capacity?: number
  readonly onFull: OverflowStrategy
}

interface RuntimeQueue {
  readonly name: QueueName
  readonly queue: Queue.Queue<Message>
  readonly policy: ResolvedQueuePolicy
}

const resolvePolicy = (policy: QueuePolicy | undefined, mode: DrainMode): ResolvedQueuePolicy => ({
  mode: policy?.mode ?? mode,
  ...(policy?.capacity === undefined ? {} : { capacity: policy.capacity }),
  onFull: policy?.onFull ?? "fail",
})

const queueStrategy = (strategy: OverflowStrategy): "suspend" | "dropping" | "sliding" => {
  switch (strategy) {
    case "drop-oldest":
      return "sliding"
    case "drop-newest":
    case "fail":
      return "dropping"
    case "suspend":
      return "suspend"
  }
}

const makeQueue = (name: QueueName, policy: ResolvedQueuePolicy): Effect.Effect<RuntimeQueue> =>
  (policy.capacity === undefined
    ? Queue.unbounded<Message>()
    : Queue.make<Message>({ capacity: policy.capacity, strategy: queueStrategy(policy.onFull) })
  ).pipe(Effect.map((queue) => ({ name, queue, policy })))

const offer = (runtime: RuntimeQueue, message: Message): Effect.Effect<void, SteeringQueueFull> =>
  Queue.offer(runtime.queue, message).pipe(
    Effect.flatMap((offered) => {
      if (offered || runtime.policy.capacity === undefined || runtime.policy.onFull !== "fail") return Effect.void
      return SteeringQueueFull.make({ queue: runtime.name, capacity: runtime.policy.capacity })
    }),
  )

const drainOne = (queue: Queue.Queue<Message>): Effect.Effect<ReadonlyArray<Message>> =>
  Effect.sync(() => {
    const taken = Queue.takeUnsafe(queue)
    return taken === undefined || !Exit.isSuccess(taken) ? [] : [taken.value]
  })

const drain = (queue: Queue.Queue<Message>, mode: DrainMode): Effect.Effect<ReadonlyArray<Message>> =>
  mode === "all" ? Queue.clear(queue) : drainOne(queue)

/** @experimental In-memory steering backed by two Effect queues. */
export const layer = (options: MakeOptions = {}): Layer.Layer<Steering> =>
  Layer.effect(
    Steering,
    Effect.gen(function* () {
      const steeringQueue = yield* makeQueue("steering", resolvePolicy(options.steering, "all"))
      const followUpQueue = yield* makeQueue("followUp", resolvePolicy(options.followUp, "one-at-a-time"))

      return Steering.of({
        steer: (message) => offer(steeringQueue, message),
        followUp: (message) => offer(followUpQueue, message),
        takeSteering: drain(steeringQueue.queue, steeringQueue.policy.mode),
        takeFollowUp: drain(followUpQueue.queue, followUpQueue.policy.mode),
      })
    }),
  )

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Steering> =>
  Layer.succeed(Steering, Steering.of(implementation))
