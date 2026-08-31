import { Effect, Scope, TxQueue, TxRef } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import type { RunId } from "../durable/run-id.js"
import {
  InboxFull,
  PolicyInvalid,
  RunClosed,
  defaultCapacity,
  defaultMaxPendingBytes,
  promptBytes,
  type DrainMode,
  type Input,
  type Options,
  type OverflowStrategy,
  type Producer,
  type QueueName,
  type QueuePolicy,
  type Receipt,
} from "./steering.js"

interface ResolvedQueuePolicy {
  readonly mode: DrainMode
  readonly capacity: number
  readonly onFull: OverflowStrategy
}

interface ResolvedOptions {
  readonly steering: ResolvedQueuePolicy
  readonly followUp: ResolvedQueuePolicy
  readonly maxPendingBytes: number
}

interface Lane {
  readonly queue: TxQueue.TxQueue<QueuedInput>
  readonly policy: ResolvedQueuePolicy
  readonly sequence: TxRef.TxRef<number>
}

interface QueuedInput extends Input {
  readonly bytes: number
  readonly sequence: number
}

type Lifecycle = "allocated" | "running" | "closed"

interface Drained {
  readonly inputs: ReadonlyArray<Input>
  readonly count: number
  readonly bytes: number
  readonly firstSequence: number | undefined
  readonly lastSequence: number | undefined
  readonly pendingBytes: number
  readonly remaining: number
}

/** @internal Loop-owned completion decision for one Run inbox. */
export type Completion =
  | { readonly _tag: "Closed" }
  | { readonly _tag: "Pending"; readonly queue: QueueName; readonly inputs: ReadonlyArray<Input> }

/** @internal Sole consumer capability held by one Agent loop. */
export interface RunInbox {
  readonly runId: RunId
  readonly start: Effect.Effect<boolean>
  readonly takeSteering: Effect.Effect<ReadonlyArray<Input>>
  readonly takeFollowUp: Effect.Effect<ReadonlyArray<Input>>
  readonly complete: Effect.Effect<Completion>
  readonly close: (reason: "execution-exit" | "scope") => Effect.Effect<void>
}

const positiveInteger = (
  value: number | undefined,
  fallback: number,
  field: string,
): Effect.Effect<number, PolicyInvalid> => {
  const resolved = value ?? fallback
  return !Number.isSafeInteger(resolved) || resolved <= 0
    ? PolicyInvalid.make({ field, value: String(resolved) })
    : Effect.succeed(resolved)
}

const resolvePolicy = (
  policy: QueuePolicy | undefined,
  mode: DrainMode,
  name: QueueName,
): Effect.Effect<ResolvedQueuePolicy, PolicyInvalid> =>
  Effect.gen(function* () {
    const capacity = yield* positiveInteger(policy?.capacity, defaultCapacity, `${name}.capacity`)
    return {
      mode: policy?.mode ?? mode,
      onFull: policy?.onFull ?? "fail",
      capacity,
    }
  })

const resolveOptions = (options: Options): Effect.Effect<ResolvedOptions, PolicyInvalid> =>
  Effect.gen(function* () {
    const steering = yield* resolvePolicy(options.steering, "all", "steering")
    const followUp = yield* resolvePolicy(options.followUp, "one-at-a-time", "followUp")
    const maxPendingBytes = yield* positiveInteger(options.maxPendingBytes, defaultMaxPendingBytes, "maxPendingBytes")
    return { steering, followUp, maxPendingBytes }
  })

/** @internal Allocate one scoped process-local Run inbox and its producer capability. */
export const allocateRunInbox: {
  (
    options: Options,
  ): (
    runId: RunId,
  ) => Effect.Effect<{ readonly inbox: RunInbox; readonly producer: Producer }, PolicyInvalid, Scope.Scope>
  (
    runId: RunId,
    options: Options,
  ): Effect.Effect<{ readonly inbox: RunInbox; readonly producer: Producer }, PolicyInvalid, Scope.Scope>
} = dual(2, (runId: RunId, options: Options) =>
  Effect.gen(function* () {
    const resolved = yield* resolveOptions(options)
    const steeringQueue = yield* TxQueue.dropping<QueuedInput>(resolved.steering.capacity)
    const followUpQueue = yield* TxQueue.dropping<QueuedInput>(resolved.followUp.capacity)
    const steeringSequence = yield* TxRef.make(0)
    const followUpSequence = yield* TxRef.make(0)
    const pendingBytes = yield* TxRef.make(0)
    const lifecycle = yield* TxRef.make<Lifecycle>("allocated")
    const steering: Lane = { queue: steeringQueue, policy: resolved.steering, sequence: steeringSequence }
    const followUp: Lane = { queue: followUpQueue, policy: resolved.followUp, sequence: followUpSequence }

    const drainTransaction = (lane: Lane): Effect.Effect<Drained> =>
      Effect.gen(function* () {
        const size = yield* TxQueue.size(lane.queue)
        const entries = size === 0 ? [] : yield* TxQueue.takeN(lane.queue, lane.policy.mode === "all" ? size : 1)
        const bytes = entries.reduce((total, entry) => total + entry.bytes, 0)
        const nextPendingBytes = (yield* TxRef.get(pendingBytes)) - bytes
        const first = entries[0]
        const last = entries.at(-1)
        yield* TxRef.set(pendingBytes, nextPendingBytes)
        return {
          inputs: entries.map(({ prompt }) => ({ prompt })),
          count: entries.length,
          bytes,
          firstSequence: first?.sequence,
          lastSequence: last?.sequence,
          pendingBytes: nextPendingBytes,
          remaining: size - entries.length,
        }
      })

    const observeDrain = (queue: QueueName, drained: Drained) =>
      Effect.annotateCurrentSpan({
        "generalist.agent.run_id": runId,
        "generalist.agent.inbox.queue": queue,
        "generalist.agent.inbox.drained_entries": drained.count,
        "generalist.agent.inbox.drained_bytes": drained.bytes,
        "generalist.agent.inbox.remaining_entries": drained.remaining,
        "generalist.agent.inbox.pending_bytes": drained.pendingBytes,
      }).pipe(
        Effect.andThen(
          drained.firstSequence === undefined
            ? Effect.void
            : Effect.annotateCurrentSpan("generalist.agent.inbox.first_sequence", drained.firstSequence),
        ),
        Effect.andThen(
          drained.lastSequence === undefined
            ? Effect.void
            : Effect.annotateCurrentSpan("generalist.agent.inbox.last_sequence", drained.lastSequence),
        ),
      )

    const drain = (queue: QueueName, lane: Lane): Effect.Effect<ReadonlyArray<Input>> =>
      Effect.tx(drainTransaction(lane)).pipe(
        Effect.tap((drained) => observeDrain(queue, drained)),
        Effect.map((drained) => drained.inputs),
        Effect.withSpan("Generalist.Agent.inbox.drain", {
          attributes: { "generalist.agent.run_id": runId, "generalist.agent.inbox.queue": queue },
        }),
      )

    const close = (reason: "execution-exit" | "scope") =>
      Effect.tx(
        Effect.gen(function* () {
          if ((yield* TxRef.get(lifecycle)) === "closed") {
            return { alreadyClosed: true, steeringEntries: 0, followUpEntries: 0, bytes: 0 }
          }
          const steeringSize = yield* TxQueue.size(steering.queue)
          const followUpSize = yield* TxQueue.size(followUp.queue)
          const bytes = yield* TxRef.get(pendingBytes)
          yield* TxRef.set(lifecycle, "closed")
          yield* TxQueue.shutdown(steering.queue)
          yield* TxQueue.shutdown(followUp.queue)
          yield* TxRef.set(pendingBytes, 0)
          return {
            alreadyClosed: false,
            steeringEntries: steeringSize,
            followUpEntries: followUpSize,
            bytes,
          }
        }),
      ).pipe(
        Effect.tap((closed) =>
          Effect.annotateCurrentSpan({
            "generalist.agent.run_id": runId,
            "generalist.agent.inbox.close_reason": reason,
            "generalist.agent.inbox.already_closed": closed.alreadyClosed,
            "generalist.agent.inbox.discarded_steering_entries": closed.steeringEntries,
            "generalist.agent.inbox.discarded_follow_up_entries": closed.followUpEntries,
            "generalist.agent.inbox.discarded_bytes": closed.bytes,
          }),
        ),
        Effect.asVoid,
        Effect.withSpan("Generalist.Agent.inbox.close", {
          attributes: { "generalist.agent.run_id": runId, "generalist.agent.inbox.close_reason": reason },
        }),
      )
    yield* Effect.addFinalizer(() => close("scope"))

    const offer = (queue: QueueName, input: Input): Effect.Effect<Receipt, InboxFull | RunClosed> => {
      const prompt = Prompt.make(input.prompt)
      const bytes = promptBytes(prompt)
      const lane = queue === "steering" ? steering : followUp
      return Effect.gen(function* () {
        const outcome = yield* Effect.tx(
          Effect.gen(function* () {
            const size = yield* TxQueue.size(lane.queue)
            const totalBytes = yield* TxRef.get(pendingBytes)
            if ((yield* TxRef.get(lifecycle)) === "closed") {
              return { _tag: "Closed" as const, size, totalBytes }
            }
            let fullDimension: "entries" | "bytes" | undefined
            if (size >= lane.policy.capacity) fullDimension = "entries"
            else if (totalBytes + bytes > resolved.maxPendingBytes) fullDimension = "bytes"
            if (fullDimension !== undefined) {
              const limit = fullDimension === "entries" ? lane.policy.capacity : resolved.maxPendingBytes
              if (lane.policy.onFull === "fail" || bytes > resolved.maxPendingBytes) {
                return { _tag: "Full" as const, dimension: fullDimension, limit, size, totalBytes }
              }
              return yield* Effect.txRetry
            }
            const sequence = yield* TxRef.get(lane.sequence)
            const accepted = yield* TxQueue.offer(lane.queue, { prompt, bytes, sequence })
            if (!accepted) return { _tag: "Closed" as const, size, totalBytes }
            yield* TxRef.set(lane.sequence, sequence + 1)
            yield* TxRef.set(pendingBytes, totalBytes + bytes)
            return {
              _tag: "Accepted" as const,
              receipt: { runId, queue, sequence, bytes },
              size: size + 1,
              totalBytes: totalBytes + bytes,
            }
          }),
        )
        yield* Effect.annotateCurrentSpan({
          "generalist.agent.run_id": runId,
          "generalist.agent.inbox.queue": queue,
          "generalist.agent.inbox.outcome": outcome._tag.toLowerCase(),
          "generalist.agent.inbox.pending_entries": outcome.size,
          "generalist.agent.inbox.pending_bytes": outcome.totalBytes,
          "generalist.agent.inbox.offered_bytes": bytes,
        })
        if (outcome._tag === "Closed") return yield* RunClosed.make({ runId })
        if (outcome._tag === "Full") {
          return yield* InboxFull.make({ runId, queue, dimension: outcome.dimension, limit: outcome.limit })
        }
        return outcome.receipt
      }).pipe(
        Effect.withSpan("Generalist.Agent.inbox.offer", {
          attributes: {
            "generalist.agent.run_id": runId,
            "generalist.agent.inbox.queue": queue,
            "generalist.agent.inbox.overflow": lane.policy.onFull,
          },
        }),
      )
    }

    const complete = Effect.tx(
      Effect.gen(function* () {
        if ((yield* TxRef.get(lifecycle)) === "closed") return { _tag: "Closed" } as const
        const followUpSize = yield* TxQueue.size(followUp.queue)
        if (followUpSize > 0) {
          return { _tag: "Pending", queue: "followUp", ...(yield* drainTransaction(followUp)) } as const
        }
        const steeringSize = yield* TxQueue.size(steering.queue)
        if (steeringSize > 0) {
          return { _tag: "Pending", queue: "steering", ...(yield* drainTransaction(steering)) } as const
        }
        yield* TxRef.set(lifecycle, "closed")
        yield* TxQueue.shutdown(steering.queue)
        yield* TxQueue.shutdown(followUp.queue)
        return { _tag: "Closed" } as const
      }),
    ).pipe(
      Effect.tap((completion) =>
        completion._tag === "Closed"
          ? Effect.annotateCurrentSpan({
              "generalist.agent.run_id": runId,
              "generalist.agent.inbox.outcome": "closed",
            })
          : observeDrain(completion.queue, completion).pipe(
              Effect.andThen(
                Effect.annotateCurrentSpan({
                  "generalist.agent.inbox.outcome": "pending",
                  "generalist.agent.inbox.queue": completion.queue,
                }),
              ),
            ),
      ),
      Effect.withSpan("Generalist.Agent.inbox.complete", {
        attributes: { "generalist.agent.run_id": runId },
      }),
    )
    const start = Effect.tx(
      TxRef.modify(lifecycle, (state): [returnValue: boolean, newValue: Lifecycle] =>
        state === "allocated" ? [true, "running"] : [false, state],
      ),
    )
    return {
      inbox: {
        runId,
        start,
        takeSteering: drain("steering", steering),
        takeFollowUp: drain("followUp", followUp),
        complete,
        close,
      },
      producer: {
        steer: (input: Input) => offer("steering", input),
        followUp: (input: Input) => offer("followUp", input),
      },
    }
  }),
)

/** @internal Adapt a Run-addressed durable inbox without exposing a Core producer. */
export const externalRunInbox = (input: {
  readonly runId: RunId
  readonly takeSteering: Effect.Effect<ReadonlyArray<Input>>
  readonly takeFollowUp: Effect.Effect<ReadonlyArray<Input>>
}): RunInbox => ({
  runId: input.runId,
  start: Effect.succeed(true),
  takeSteering: input.takeSteering,
  takeFollowUp: input.takeFollowUp,
  complete: input.takeFollowUp.pipe(
    Effect.map(
      (inputs): Completion =>
        inputs.length === 0
          ? { _tag: "Closed" }
          : {
              _tag: "Pending",
              queue: "followUp",
              inputs,
            },
    ),
  ),
  close: () => Effect.void,
})
