import { expect, it } from "@effect/vitest"
import { Clock, DateTime, Effect } from "effect"
import { AgentSuspended } from "../../core/agent/event.js"
import type { WakeEvent } from "../../core/agent/tools/wake-event.js"
import type { ScheduleRecord } from "../../runtime/execution/trigger/schedule.js"
import type { AwaitEventCapability, Options, SchedulesCapability, Services } from "./contract.js"

type Prepare = <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
type Open<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
type OpenPair<LayerError> = <A, E>(
  use: (left: Services, right: Services) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | LayerError>

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

const suspension = (waitId: string, deadline: string): AgentSuspended => {
  const call = {
    type: "tool-call" as const,
    id: waitId,
    name: "await_environment",
    params: {},
    providerExecuted: false,
    metadata: {},
  }
  const awaitEvent = { filter: { _tag: "Webhook" as const, source: "conformance" }, deadline }
  return AgentSuspended.make({
    checkpoint: {
      turn: 0,
      calls: [
        {
          call,
          operationKey: `conformance:${waitId}`,
          state: { _tag: "Waiting", reason: "tool-wait", waitId, token: waitId, awaitEvent },
        },
      ],
      activeTools: [call.name],
      authorizationContextDigest: "",
      activatedSkills: [],
      invocationPath: [],
    },
    waits: [{ waitId, token: waitId, reason: "tool-wait", callIndex: 0, call, awaitEvent }],
  })
}

/** Register durable environmental suspension, reopen, wake, and dedupe conformance. */
const registerAwaitEvent = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: AwaitEventCapability
  readonly prepare: Prepare
  readonly open: Open<LayerError>
}): void => {
  const { capability, open, options, prepare } = input
  it.effect("persists an event wait across recovery and resumes one matching delivery exactly once", () => {
    const prefix = `conformance:${slug(options.name)}:await-event`
    const waitId = `${prefix}:wait`
    const deadline = "2030-01-01T00:05:00.000Z"
    const filter = { _tag: "Webhook" as const, source: "conformance" }
    const event: WakeEvent = {
      _tag: "Webhook",
      dedupeKey: `${prefix}:delivery`,
      source: "conformance",
      payload: { value: "once" },
      headers: {},
    }
    const start = (services: Services) =>
      Effect.gen(function* () {
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: `session:${prefix}`,
          idempotencyKey: prefix,
          prompt: "wait for one environmental event",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "await-before" })
        yield* services.store.suspend({
          ...claim,
          waits: [
            {
              waitId,
              reason: { _tag: "AwaitEvent", filter, deadline },
              status: "open",
              openedAt: "2030-01-01T00:00:00.000Z",
            },
          ],
          suspension: suspension(waitId, deadline),
        })
        expect(yield* services.runtime.inspect(receipt.runId)).toMatchObject({
          status: "waiting",
          waits: [{ waitId, reason: { _tag: "AwaitEvent", deadline } }],
        })
        return receipt.runId
      })
    const wake = (services: Services, runId: string) =>
      Effect.gen(function* () {
        expect((yield* services.runtime.inspect(runId)).status).toBe("waiting")
        const first = yield* services.runtime.wake(runId, event)
        expect(first).toEqual({ _tag: "Resumed", waitId })
        return first
      })

    return prepare(
      Effect.gen(function* () {
        const runId = yield* open(start)
        const first = yield* open((services) => wake(services, runId))
        yield* open((services) =>
          Effect.gen(function* () {
            // A retry after host recovery returns the durable receipt, not a synthetic duplicate.
            expect(yield* services.runtime.wake(runId, event)).toEqual(first)
            const claim = yield* capability.claim(services, { runId, commandId: "await-after" })
            yield* services.store.complete({
              ...claim,
              commandId: `${claim.runId}:complete:${claim.attemptFence}`,
              result: {
                text: "resumed",
                output: "resumed",
                turns: 1,
                session: { sessionId: `session:${prefix}`, leafId: null },
              },
            })
            const history = yield* services.runtime.history({ runId, limit: 100 })
            expect(history.filter((item) => item._tag === "Awaiting")).toHaveLength(1)
            expect(history.filter((item) => item._tag === "WakeReceived")).toHaveLength(1)
            expect(history.filter((item) => item._tag === "Duplicate")).toHaveLength(0)
            expect(history.filter((item) => item._tag === "RunResumed")).toHaveLength(1)
            expect(history.filter((item) => item._tag === "RunCompleted")).toHaveLength(1)
          }),
        )
      }).pipe(Effect.orDie),
    )
  })
}

/** Register durable recurrence persistence and competing scheduler-claim conformance. */
export const registerSchedules = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: SchedulesCapability
  readonly prepare: Prepare
  readonly open: Open<LayerError>
  readonly openPair: OpenPair<LayerError>
}): void => {
  const { capability, open, openPair, options, prepare } = input
  it.effect("persists a schedule and admits one occurrence across two competing scheduler owners", () => {
    const prefix = `conformance:${slug(options.name)}:schedules`
    const register = (services: Services) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const record: ScheduleRecord = {
          scheduleId: `schedule:${prefix}`,
          rrule: "FREQ=SECONDLY",
          rule: { frequency: "SECONDLY", interval: 1 },
          definition: { ...capability.definition, sessionId: `session:${prefix}` },
          nextAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
          occurrence: 0,
          status: "active",
          createdAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
        }
        const receipt = yield* services.store.registerSchedule(record)
        expect(yield* services.store.registerSchedule(record)).toEqual(receipt)
        return { record, receipt }
      })
    const compete = (left: Services, right: Services) =>
      Effect.gen(function* () {
        const [leftClaims, rightClaims] = yield* Effect.all(
          [
            left.store.claimSchedules({
              commandId: `${prefix}:left:poll:0`,
              ownerId: "scheduler-left",
              leaseMillis: 30_000,
              limit: 1,
            }),
            right.store.claimSchedules({
              commandId: `${prefix}:right:poll:0`,
              ownerId: "scheduler-right",
              leaseMillis: 30_000,
              limit: 1,
            }),
          ],
          { concurrency: "unbounded" },
        )
        const claims = [...leftClaims, ...rightClaims]
        expect(claims).toHaveLength(1)
        const claimed = claims[0]!
        const owner = claimed.ownerId === "scheduler-left" ? left : right
        const first = yield* owner.runtime.startExecution({
          executable: claimed.definition.executable,
          registrations: claimed.definition.registrations,
          sessionId: claimed.definition.sessionId,
          idempotencyKey: `schedule:${claimed.scheduleId}:${claimed.occurrence}`,
          messageId: `schedule:${claimed.scheduleId}:${claimed.occurrence}`,
          prompt: claimed.definition.prompt,
          budget: claimed.definition.budget,
        })
        yield* owner.store.advanceSchedule({
          commandId: `${prefix}:advance:${claimed.occurrence}`,
          scheduleId: claimed.scheduleId,
          ownerId: claimed.ownerId,
          occurrence: claimed.occurrence,
          nextAt: DateTime.formatIso(
            DateTime.makeUnsafe(DateTime.toEpochMillis(DateTime.makeUnsafe(claimed.nextAt)) + 1_000),
          ),
        })
        const duplicate = yield* owner.runtime.startExecution({
          executable: claimed.definition.executable,
          registrations: claimed.definition.registrations,
          sessionId: claimed.definition.sessionId,
          idempotencyKey: `schedule:${claimed.scheduleId}:${claimed.occurrence}`,
          messageId: `schedule:${claimed.scheduleId}:${claimed.occurrence}`,
          prompt: claimed.definition.prompt,
          budget: claimed.definition.budget,
        })
        expect(duplicate).toEqual(first)
        const [leftRetry, rightRetry] = yield* Effect.all(
          [
            left.store.claimSchedules({
              commandId: `${prefix}:left:poll:1`,
              ownerId: "scheduler-left",
              leaseMillis: 30_000,
              limit: 1,
            }),
            right.store.claimSchedules({
              commandId: `${prefix}:right:poll:1`,
              ownerId: "scheduler-right",
              leaseMillis: 30_000,
              limit: 1,
            }),
          ],
          { concurrency: "unbounded" },
        )
        expect([...leftRetry, ...rightRetry]).toHaveLength(0)
        return { claimed, first }
      })

    return prepare(
      Effect.gen(function* () {
        const registered = yield* open(register)
        yield* open((services) =>
          Effect.gen(function* () {
            // Registration is also an exact command receipt across host retirement.
            expect(yield* services.store.registerSchedule(registered.record)).toEqual(registered.receipt)
          }),
        )
        const competed = yield* openPair(compete)
        yield* open((services) =>
          Effect.gen(function* () {
            const duplicate = yield* services.runtime.startExecution({
              executable: competed.claimed.definition.executable,
              registrations: competed.claimed.definition.registrations,
              sessionId: competed.claimed.definition.sessionId,
              idempotencyKey: `schedule:${competed.claimed.scheduleId}:${competed.claimed.occurrence}`,
              messageId: `schedule:${competed.claimed.scheduleId}:${competed.claimed.occurrence}`,
              prompt: competed.claimed.definition.prompt,
              budget: competed.claimed.definition.budget,
            })
            expect(duplicate).toEqual(competed.first)
            const history = yield* services.runtime.history({ runId: competed.first.runId, limit: 100 })
            expect(history.filter((item) => item._tag === "RunAccepted")).toHaveLength(1)
          }),
        )
      }).pipe(Effect.orDie),
    )
  })
}

/** Register only the environmental trigger capabilities implemented by this driver. */
export const registerTriggers = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly prepare: Prepare
  readonly open: Open<LayerError>
  readonly openPair: OpenPair<LayerError>
}): void => {
  const { open, openPair, options, prepare } = input
  if (options.capabilities["await-event"] !== undefined) {
    registerAwaitEvent({
      options,
      capability: options.capabilities["await-event"],
      prepare,
      open,
    })
  }
  if (options.capabilities.schedules !== undefined) {
    registerSchedules({
      options,
      capability: options.capabilities.schedules,
      prepare,
      open,
      openPair,
    })
  }
}
