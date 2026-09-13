import { objectRuntimeLayer, makeObjectStorage } from "../object.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Queue, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ExecutableResolver } from "generalist/runtime"
import * as Runtime from "../../../../src/runtime/engine.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { LocalScheduler } from "../../../../src/runtime/execution/local-scheduler.js"
import { DurabilityFailure } from "../../../../src/durability/errors.js"
import { make as makeTriggerScheduler } from "../../../../src/runtime/execution/trigger/scheduler.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { provideScoped } from "../scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const agent = Agent.make({ name: "schedule-test", toolkit: Toolkit.empty })
const unusedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => Stream.empty,
  }),
)
const fixture = (schedulerMode: "poll" | "external" = "poll") =>
  Effect.gen(function* () {
    const calls = yield* Queue.unbounded<void>()
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.concat(
            Stream.fromEffect(Queue.offer(calls, undefined)).pipe(Stream.drain),
            Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "done", delta: "scheduled" }),
              Response.makePart("finish", { reason: "stop", usage, response: undefined }),
            ]),
          ),
      }),
    )
    return {
      called: Queue.take(calls),
      model,
      layer: Layer.mergeAll(
        objectRuntimeLayer({ addresses: [], schedulerMode, scheduler: { pollInterval: "100 millis" } }).pipe(
          Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
        ),
        model,
        allowAllAuthorization,
      ),
    }
  })

it.effect("does not persist empty automatic schedule claims while idle or before a schedule is due", () =>
  Effect.gen(function* () {
    const state = yield* fixture("external")
    const bucket = yield* makeSimulator()
    let writes = 0
    const storage = {
      faults: bucket.faults,
      maintenance: bucket.maintenance,
      store: {
        ...bucket.store,
        create: (key: string, bytes: Uint8Array) =>
          Effect.suspend(() => {
            writes++
            return bucket.store.create(key, bytes)
          }),
      },
    }
    const layer = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], schedulerMode: "external" }, storage).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      state.model,
      allowAllAuthorization,
    )
    yield* provideScoped(
      layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler
        const activatedWrites = writes
        for (let index = 0; index < 16; index++) yield* scheduler.tick
        expect(writes - activatedWrites).toBe(0)

        yield* runtime.register(agent)
        yield* runtime.schedule(agent, "not due yet", {
          rrule: "FREQ=HOURLY",
          sessionId: "future-schedule",
        })
        const registeredWrites = writes
        for (let index = 0; index < 16; index++) yield* scheduler.drain()
        expect(writes - registeredWrites).toBe(0)
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(0)
      }),
    )
  }),
)

it.effect("reconciles an attempted claim after its retained lease moves the next due time forward", () =>
  Effect.gen(function* () {
    const state = yield* fixture("external")
    yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore
        yield* runtime.register(agent)
        yield* runtime.schedule(agent, "retained claim", {
          rrule: "FREQ=SECONDLY",
          sessionId: "ambiguous-claim",
        })
        yield* TestClock.adjust("1 second")
        let nextScheduleAt = 1_000
        let loseResponse = true
        const commandIds: Array<string> = []
        const triggers = yield* makeTriggerScheduler({
          ownerId: "claim-owner",
          nextScheduleAt: Effect.sync(() => nextScheduleAt),
        }).pipe(
          Effect.provideService(RunStore, {
            ...store,
            claimSchedules: (input) =>
              store.claimSchedules(input).pipe(
                Effect.flatMap((claimed) => {
                  commandIds.push(input.commandId)
                  nextScheduleAt = 31_000
                  if (loseResponse) {
                    loseResponse = false
                    return DurabilityFailure.make({ reason: "indeterminate", message: "claim reply lost" })
                  }
                  return Effect.succeed(claimed)
                }),
              ),
          }),
        )
        const attempt = triggers.drain()
        expect(yield* attempt.pipe(Effect.flip)).toMatchObject({ reason: "indeterminate" })
        expect(yield* attempt).toMatchObject({ processed: 1 })
        expect(commandIds).toHaveLength(2)
        expect(commandIds[1]).toBe(commandIds[0])
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
        expect(yield* triggers.drain()).toEqual({ processed: 0, hasMore: false })
        expect(commandIds).toHaveLength(2)
      }),
    )
  }),
)

it.effect("fires fixed UTC recurrences from the Runtime-scoped scheduler under TestClock", () =>
  Effect.gen(function* () {
    const state = yield* fixture()
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler
        yield* runtime.register(agent)
        const receipt = yield* runtime.schedule(agent, "run", {
          rrule: "FREQ=SECONDLY",
          sessionId: "schedule-session",
        })
        expect(receipt.scheduleId).toMatch(/^schedule_/)
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(0)

        yield* TestClock.adjust("1100 millis")
        yield* state.called
        yield* scheduler.idle
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
        yield* TestClock.adjust("1 second")
        yield* state.called
        yield* scheduler.idle
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(2)
      }),
    )
  }),
)

it.effect("registers a stable schedule idempotently", () =>
  Effect.gen(function* () {
    const state = yield* fixture()
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const options = {
          rrule: "FREQ=SECONDLY",
          sessionId: "stable-schedule-session",
          scheduleId: "schedule_stable_test",
        } as const
        const first = yield* runtime.schedule(agent, "run", options)
        const second = yield* runtime.schedule(agent, "run", options)

        expect(second).toEqual(first)
        yield* TestClock.adjust("1100 millis")
        yield* state.called
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
      }),
    )
  }),
)

it.effect("re-registers a stable schedule id on a fresh host after wall-clock time passes", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const hostLayer = (workerId: string) =>
      objectRuntimeLayer({ addresses: [], workerId }, storage).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      )
    const options = {
      rrule: "FREQ=DAILY;BYHOUR=1",
      sessionId: "stable-restart-session",
      scheduleId: "schedule_stable_restart",
    } as const
    const first = yield* provideScoped(
      Layer.merge(hostLayer("stable-restart-a"), unusedModel),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        return yield* runtime.schedule(agent, "run", options)
      }),
    )

    // 30 minutes later the recomputed nextAt is still 1970-01-01T01:00:00.000Z, so only the
    // registration clock (createdAt) differs from the retained command input.
    yield* TestClock.adjust("30 minutes")

    const retry = yield* provideScoped(
      Layer.merge(hostLayer("stable-restart-b"), unusedModel),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const reregistered = yield* runtime.schedule(agent, "run", options)
        const changedRule = yield* runtime
          .schedule(agent, "run", { ...options, rrule: "FREQ=MINUTELY" })
          .pipe(Effect.flip)
        const changedInput = yield* runtime.schedule(agent, "changed", options).pipe(Effect.flip)
        return { reregistered, changedRule, changedInput }
      }),
    )

    expect(retry.reregistered).toEqual(first)
    expect(retry.changedRule).toMatchObject({
      _tag: "generalist/durability/DurabilityFailure",
      reason: "input-conflict",
    })
    expect(retry.changedInput).toMatchObject({
      _tag: "generalist/durability/DurabilityFailure",
      reason: "input-conflict",
    })
  }),
)

it.effect("rejects recurrence rules outside the documented interval subset", () =>
  Effect.gen(function* () {
    const state = yield* fixture()
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const failure = yield* runtime
          .schedule(agent, "run", { rrule: "FREQ=WEEKLY;BYDAY=MO", sessionId: "invalid-schedule" })
          .pipe(Effect.flip)
        expect(failure._tag).toBe("generalist/runtime/ScheduleInvalid")
      }),
    )
  }),
)

it.effect("rejects intervals whose first instant leaves the representable DateTime range", () =>
  Effect.gen(function* () {
    const state = yield* fixture()
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const overflowRules = [
          "FREQ=SECONDLY;INTERVAL=9007199254740991",
          "FREQ=MINUTELY;INTERVAL=9007199254740991",
          "FREQ=DAILY;INTERVAL=9007199254740991",
          "FREQ=DAILY;INTERVAL=9007199254740991;BYHOUR=0",
        ] as const
        for (const [index, rrule] of overflowRules.entries()) {
          const failure = yield* runtime
            .schedule(agent, "run", { rrule, sessionId: `overflow-${index}` })
            .pipe(Effect.flip)
          expect(failure._tag).toBe("generalist/runtime/ScheduleInvalid")
        }

        // Boundary controls: large-but-representable rules are accepted, so the
        // rejections above are DateTime range bounds rather than size heuristics.
        const validRules = [
          "FREQ=SECONDLY;INTERVAL=8000000000000",
          "FREQ=DAILY;BYHOUR=23",
          "FREQ=DAILY;INTERVAL=1000000;BYHOUR=1",
        ] as const
        for (const [index, rrule] of validRules.entries()) {
          const receipt = yield* runtime.schedule(agent, "run", {
            rrule,
            sessionId: `valid-${index}`,
            scheduleId: `schedule_valid_${index}`,
          })
          expect(receipt.scheduleId).toBe(`schedule_valid_${index}`)
        }

        const recovery = yield* runtime.schedule(agent, "run", {
          rrule: "FREQ=MINUTELY",
          sessionId: "after-overflow",
          scheduleId: "schedule_after_overflow",
        })
        expect(recovery.scheduleId).toBe("schedule_after_overflow")
      }),
    )
  }),
)

it.effect("fails typed when a stored recurrence cannot advance past the representable range", () =>
  Effect.gen(function* () {
    const state = yield* fixture("external")
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler
        const store = yield* RunStore
        yield* runtime.register(agent)
        yield* runtime.schedule(agent, "run", {
          rrule: "FREQ=SECONDLY",
          sessionId: "advance-session",
          scheduleId: "schedule_advance_base",
        })
        yield* TestClock.adjust("1100 millis")
        const claimed = yield* store.claimSchedules({
          commandId: "advance-claim",
          ownerId: "advance-owner",
          leaseMillis: 30_000,
          limit: 1,
        })
        const base = claimed[0]
        expect(base).toBeDefined()
        if (base === undefined) {
          return yield* Effect.die(new Error("expected one due schedule to seed the advance defect"))
        }
        yield* store.registerSchedule({
          ...base,
          scheduleId: "schedule_advance_overflow",
          rrule: "FREQ=DAILY;INTERVAL=9007199254740991",
          rule: { frequency: "DAILY", interval: 9007199254740991 },
          nextAt: "1970-01-01T00:00:01.000Z",
          occurrence: 0,
          status: "active",
          createdAt: "1970-01-01T00:00:00.000Z",
        })

        const failure = yield* scheduler.drain().pipe(Effect.flip)
        expect(failure._tag).toBe("generalist/runtime/ScheduleInvalid")
      }),
    )
  }),
)
