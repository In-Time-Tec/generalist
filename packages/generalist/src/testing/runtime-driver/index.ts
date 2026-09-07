import { beforeAll, describe, expect, it } from "@effect/vitest"
import { Context, Effect, Fiber, Layer, Option, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { RunExecutor } from "../../runtime/execution/run-executor.js"
import type { ExecutionResult } from "../../runtime/execution/state.js"
import { RunStore } from "../../runtime/run/store.js"
import { Runtime } from "../../runtime/service.js"
import { StaleClaim } from "../../runtime/run/ownership-errors.js"
import { checkpoint, replay } from "../../runtime/tree.js"
import { registerAdmission, registerAgentStart } from "./agent-start.js"
import { registerApprovalSuspend } from "./approval-suspend.js"
import { registerHostSessions } from "./host-sessions.js"
import { registerOperator } from "./operator.js"
import { registerTriggers } from "./triggers.js"
import { Suite, record } from "../report.js"
import { registerForkRewind } from "./fork-rewind.js"
import { registerComponents } from "./components.js"
import type {
  MultiWorkerClaimCapability,
  NotificationRecoveryCapability,
  Options,
  RunTreeCapability,
  Services,
  AtomicCommitCapability,
} from "./contract.js"
import { registerChildRuns } from "./children/runs.js"
import { registerSteering } from "./steering/recovery.js"
import { registerArtifacts } from "./artifact/index.js"
import { registerRuntime as registerRuntimeConformance } from "./runtime-registration.js"

export type * from "./contract.js"
export * from "./payload/model-response-fault.js"
const servicesFrom = (context: Context.Context<Runtime | RunStore>): Services => {
  const optionalExecutor = Context.getOption(context, RunExecutor)
  const services: Services = {
    runtime: Context.get(context, Runtime),
    store: Context.get(context, RunStore),
  }
  return {
    ...services,
    ...(Option.isSome(optionalExecutor) ? { executor: optionalExecutor.value } : undefined),
  }
}

const provideLayer = <A, E, LayerError>(
  layer: Layer.Layer<Runtime | RunStore, LayerError, never>,
  use: (services: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> =>
  Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => use(servicesFrom(context))))

const provideLayerPair = <A, E, LayerError>(
  layer: Layer.Layer<Runtime | RunStore, LayerError, never>,
  use: (left: Services, right: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer), (left) =>
      Effect.flatMap(Layer.build(layer), (right) => use(servicesFrom(left), servicesFrom(right))),
    ),
  )

const certification = <LayerError, ClaimsLayerError>(options: Options<LayerError, ClaimsLayerError>): Suite =>
  Suite.make({
    name: `runtimeDriver:${options.name}`,
    capabilities: Object.entries(options.capabilities).flatMap(([name, value]) =>
      value === undefined || value === false ? [] : [name],
    ),
  })

const prepare = <A, E, LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> => {
  const prepared = options.setup === undefined ? effect : Effect.andThen(options.setup, effect)
  return record(certification(options)).pipe(Effect.andThen(prepared))
}

const provide = <A, E, LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  use: (services: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> => prepare(options, provideLayer(options.layer, use))

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

const identity = (name: string, test: string) => {
  const prefix = `conformance:${slug(name)}:${test}`
  return {
    sessionId: `session:${prefix}`,
    idempotencyKey: prefix,
    runId: `run:${prefix}`,
  }
}

const completedResult = (sessionId: string, text: string): ExecutionResult => ({
  text,
  output: text,
  turns: 1,
  session: { sessionId, leafId: null },
})

const registerRunTree = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: RunTreeCapability,
) => {
  it.effect("paginates strictly after an opaque root-bound replay cursor", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "run-tree")
        const root = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "tree replay",
        })
        const before = yield* checkpoint(root.runId).pipe(Effect.provideService(Runtime, services.runtime))
        const claim = yield* capability.claim(services, { runId: root.runId, commandId: "tree" })
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: `${root.runId}:turn:1`,
          event: { _tag: "TurnStarted", turn: 1 },
        })
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: `${root.runId}:turn:2`,
          event: { _tag: "TurnStarted", turn: 2 },
        })
        const first = yield* replay({ rootRunId: root.runId, cursor: before.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const second = yield* replay({ rootRunId: root.runId, cursor: first.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const rest = yield* replay({ rootRunId: root.runId, cursor: second.cursor, limit: 100 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const tail = yield* replay({ rootRunId: root.runId, cursor: rest.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const replayed = [...first.events, ...second.events, ...rest.events]
        expect(first.events).toHaveLength(1)
        expect(first.hasMore).toBe(true)
        expect(new Set(replayed.map(({ event }) => event.eventId)).size).toBe(replayed.length)
        expect(replayed.filter(({ event }) => event._tag === "TurnStarted")).toHaveLength(2)
        expect(tail).toMatchObject({ events: [], cursor: rest.cursor, hasMore: false })

        const other = yield* services.runtime.send({
          to: options.address,
          sessionId: `${id.sessionId}:other`,
          idempotencyKey: `${id.idempotencyKey}:other`,
          prompt: "other tree",
        })
        const wrongRoot = yield* replay({ rootRunId: other.runId, cursor: first.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
          Effect.flip,
        )
        expect(wrongRoot._tag).toBe("generalist/runtime/TreeCursorRootMismatch")
      }),
    ),
  )
}

const registerAtomicCommits = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: AtomicCommitCapability,
) => {
  it.effect("keeps failed publication atomic and retries one exact completion", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "atomic-commit")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "atomic completion",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "atomic-commit" })
        const next = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: `${id.idempotencyKey}:next`,
          prompt: "next root",
        })
        const beforeNext = yield* services.runtime.history({ runId: next.runId, limit: 100 })
        expect((yield* services.runtime.inspect(next.runId)).status).toBe("queued")
        const before = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        const complete = {
          ...claim,
          commandId: `${receipt.runId}:complete`,
          result: completedResult(id.sessionId, "committed"),
        }
        yield* capability.failNextCommit(services)
        expect((yield* Effect.exit(services.store.complete(complete)))._tag).toBe("Failure")
        expect((yield* services.runtime.inspect(receipt.runId)).status).toBe("running")
        expect(yield* services.runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(before)
        expect(yield* services.runtime.history({ runId: next.runId, limit: 100 })).toEqual(beforeNext)
        expect((yield* services.runtime.inspect(next.runId)).status).toBe("queued")
        const first = yield* services.store.complete(complete)
        expect(yield* services.store.complete(complete)).toEqual(first)
        const committed = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        expect((yield* services.runtime.inspect(receipt.runId)).status).toBe("succeeded")
        expect(committed.filter((event) => event._tag === "RunCompleted")).toHaveLength(1)
        expect((yield* services.runtime.inspect(next.runId)).status).toBe("running")
      }),
    ),
  )
  for (const contended of [false, true]) {
    it.effect(
      `interrupts unpublished work${contended ? " after an independent writer wins its slot" : ""} without leaking state or blocking retry`,
      () =>
        prepare(
          options,
          provideLayerPair(options.layer, (left, right) =>
            Effect.gen(function* () {
              const id = identity(options.name, `interrupted-commit:${contended}`)
              const receipt = yield* left.runtime.send({
                to: options.address,
                sessionId: id.sessionId,
                idempotencyKey: id.idempotencyKey,
                prompt: "interrupt publication",
              })
              const claim = yield* capability.claim(left, { runId: receipt.runId, commandId: "interrupt-publication" })
              const before = yield* left.runtime.history({ runId: receipt.runId, limit: 100 })
              const command = {
                ...claim,
                commandId: `${receipt.runId}:complete`,
                result: completedResult(id.sessionId, "exact completion"),
              }
              const pause = yield* capability.pauseNextCommit(left)
              const pending = yield* left.store.complete(command).pipe(Effect.forkChild)
              yield* pause.entered
              if (contended) {
                const other = yield* right.runtime.send({
                  to: options.address,
                  sessionId: `${id.sessionId}:other`,
                  idempotencyKey: `${id.idempotencyKey}:other`,
                  prompt: "independent winner",
                })
                expect((yield* right.runtime.inspect(other.runId)).status).toBe("running")
              }
              yield* Fiber.interrupt(pending)
              yield* pause.release
              expect(yield* right.runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(before)
              expect((yield* right.runtime.inspect(receipt.runId)).status).toBe("running")
              const completed = yield* left.store.complete(command)
              expect(yield* left.store.complete(command)).toEqual(completed)
              expect(
                (yield* right.runtime.history({ runId: receipt.runId, limit: 100 })).filter(
                  (event) => event._tag === "RunCompleted",
                ),
              ).toHaveLength(1)
            }),
          ),
        ),
    )
  }
}

const registerMultiWorkerClaims = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: MultiWorkerClaimCapability<ClaimsLayerError>,
) => {
  it.effect("gives one independent activated worker each contested execution", () =>
    prepare(
      options,
      provideLayerPair(capability.layer, (left, right) =>
        Effect.gen(function* () {
          for (let index = 0; index < 6; index += 1) {
            const id = identity(options.name, `claims-concurrent-${index}`)
            const receipt = yield* left.runtime.send({
              to: options.address,
              sessionId: id.sessionId,
              idempotencyKey: id.idempotencyKey,
              prompt: `claim ${index}`,
            })
            const results = yield* Effect.all(
              [
                Effect.exit(capability.claim(left, { runId: receipt.runId, commandId: `left:${index}` })),
                Effect.exit(capability.claim(right, { runId: receipt.runId, commandId: `right:${index}` })),
              ],
              { concurrency: "unbounded" },
            )
            expect(results.map((result) => result._tag).toSorted()).toEqual(["Failure", "Success"])
            const first = results[0]
            const second = results[1]
            if (first === undefined || second === undefined) return yield* Effect.die("missing execution claim result")
            if (first._tag === "Success") {
              yield* left.store.complete({
                ...first.value,
                commandId: `${receipt.runId}:complete`,
                result: completedResult(id.sessionId, "winner"),
              })
            } else if (second._tag === "Success") {
              yield* right.store.complete({
                ...second.value,
                commandId: `${receipt.runId}:complete`,
                result: completedResult(id.sessionId, "winner"),
              })
            } else return yield* Effect.die("no execution claim won")
            expect((yield* right.runtime.inspect(receipt.runId)).status).toBe("succeeded")
          }
        }),
      ),
    ),
  )

  it.effect("raises run and Session fences after fresh-host recovery and rejects stale writes", () =>
    prepare(
      options,
      Effect.gen(function* () {
        const stale = yield* provideLayer(capability.layer, (services) =>
          Effect.gen(function* () {
            const id = identity(options.name, "claims-stale")
            const receipt = yield* services.runtime.send({
              to: options.address,
              sessionId: id.sessionId,
              idempotencyKey: id.idempotencyKey,
              prompt: "stale claim",
            })
            return yield* capability.claim(services, { runId: receipt.runId, commandId: "stale-before" })
          }),
        )
        yield* provideLayer(capability.layer, (services) =>
          Effect.gen(function* () {
            const fresh = yield* capability.claim(services, { runId: stale.runId, commandId: "stale-after" })
            expect(fresh.attemptFence).toBeGreaterThan(stale.attemptFence)
            expect(BigInt(fresh.session.epoch)).toBeGreaterThan(BigInt(stale.session.epoch))
            const session = Option.getOrThrow(yield* services.store.claimedSessionStore(stale))
            expect(
              (yield* Effect.exit(
                session.append(
                  { _tag: "Message", message: Prompt.make("stale").content[0]! },
                  { commandId: "stale-write" },
                ),
              ))._tag,
            ).toBe("Failure")
            yield* services.store.releaseExecution(stale)
            const error = yield* services.store
              .complete({
                ...stale,
                commandId: `${stale.runId}:stale-complete`,
                result: completedResult(stale.session.sessionId, "stale"),
              })
              .pipe(Effect.flip)
            expect(error).toBeInstanceOf(StaleClaim)
            yield* services.store.complete({
              ...fresh,
              commandId: `${fresh.runId}:fresh-complete`,
              result: completedResult(fresh.session.sessionId, "fresh"),
            })
            expect((yield* services.runtime.inspect(stale.runId)).status).toBe("succeeded")
          }),
        )
      }),
    ),
  )
}

const registerNotificationRecovery = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: NotificationRecoveryCapability,
) => {
  it.effect("recovers a committed event missed while no notification listener exists", () =>
    prepare(
      options,
      Effect.gen(function* () {
        const seeded = yield* provideLayer(options.layer, (services) =>
          Effect.gen(function* () {
            const id = identity(options.name, "notification-recovery")
            const receipt = yield* services.runtime.send({
              to: options.address,
              sessionId: id.sessionId,
              idempotencyKey: id.idempotencyKey,
              prompt: "notification recovery",
            })
            const events = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
            const cursor = events.at(-1)!.sequence
            const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "notification" })
            yield* services.store.emitAgentEvent({
              ...claim,
              commandId: `${receipt.runId}:missed-event`,
              event: { _tag: "TurnStarted", turn: 41 },
            })
            return { runId: receipt.runId, cursor }
          }),
        )
        const recovered = yield* provideLayer(options.layer, ({ runtime }) =>
          runtime.events(seeded).pipe(
            Stream.filter((event) => event._tag === "TurnStarted"),
            Stream.take(1),
            Stream.runCollect,
          ),
        )
        expect(Array.from(recovered, (event) => (event._tag === "TurnStarted" ? event.turn : undefined))).toEqual([41])
      }),
    ),
  )
}

/** Registers only the conformance suites selected by the supplied driver capabilities. */
export const runtimeDriver = <LayerError, ClaimsLayerError>(options: Options<LayerError, ClaimsLayerError>): void => {
  const suite = options.skip === true ? describe.skip : describe
  suite(`${options.name} Generalist Runtime driver conformance`, () => {
    // Suite `meta` reaches Vitest reporters; the repository certification reporter decodes it.
    // oxlint-disable-next-line no-empty-pattern -- Vitest requires a destructuring pattern for the fixture argument.
    beforeAll(({}, task) => {
      Object.assign(task.meta, { generalistCertification: certification(options) })
    })
    if (options.capabilities.admission === true) registerAdmission({ options, provide: (use) => provide(options, use) })
    if (options.capabilities.runtime !== undefined) {
      registerRuntimeConformance({
        options,
        capability: options.capabilities.runtime,
        provide: (use) => provide(options, use),
      })
    }
    if (options.capabilities["host-sessions"] !== undefined) {
      registerHostSessions({
        options,
        capability: options.capabilities["host-sessions"],
        provide: (use) => provide(options, use),
      })
    }
    registerAgentStart({ options, provide: (use) => provide(options, use) })
    if (options.capabilities.runTree !== undefined) registerRunTree(options, options.capabilities.runTree)
    if (options.capabilities["fork-rewind"] !== undefined) {
      registerComponents({
        options,
        capability: options.capabilities["fork-rewind"],
        prepare: (effect) => prepare(options, effect),
        open: (use) => provideLayer(options.layer, use),
      })
      registerForkRewind({
        options,
        capability: options.capabilities["fork-rewind"],
        prepare: (effect) => prepare(options, effect),
        open: (use) => provideLayer(options.layer, use),
        provide: (use) => provide(options, use),
      })
    }
    if (options.capabilities.artifacts === true) {
      registerArtifacts({ options, provide: (use) => provide(options, use) })
    }
    if (options.capabilities.steering !== undefined) {
      registerSteering({
        options,
        capability: options.capabilities.steering,
        prepare: (effect) => prepare(options, effect),
        open: (use) => provideLayer(options.layer, use),
      })
    }
    if (options.capabilities.atomicCommits !== undefined) {
      registerAtomicCommits(options, options.capabilities.atomicCommits)
    }
    if (options.capabilities.multiWorkerClaims !== undefined) {
      registerMultiWorkerClaims(options, options.capabilities.multiWorkerClaims)
    }
    if (options.capabilities.notificationRecovery !== undefined) {
      registerNotificationRecovery(options, options.capabilities.notificationRecovery)
    }
    if (options.capabilities["approval-suspend"] !== undefined) {
      registerApprovalSuspend({
        options,
        capability: options.capabilities["approval-suspend"],
        prepare: (effect) => prepare(options, effect),
        open: (use) => provideLayer(options.layer, use),
      })
    }
    registerTriggers({
      options,
      prepare: (effect) => prepare(options, effect),
      open: (use) => provideLayer(options.layer, use),
      openPair: (use) => provideLayerPair(options.layer, use),
    })
    if (options.capabilities["child-runs"] !== undefined) {
      registerChildRuns({
        options,
        capability: options.capabilities["child-runs"],
        prepare: (effect) => prepare(options, effect),
        open: (use) => provideLayer(options.layer, use),
      })
    }
    registerOperator({ options, open: (use) => provide(options, use) })
  })
}
