import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import type { HostSessionsCapability, Options, Services } from "./contract.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

/** @internal */
export const registerHostSessions = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: HostSessionsCapability
  readonly provide: Provide<LayerError>
}): void => {
  const { capability, options, provide } = input

  it.effect("persists Session metadata, root Runs, and strict replay-then-live cursors", () =>
    provide((services) =>
      Effect.scoped(
        Effect.gen(function* () {
          const suffix = slug(options.name)
          const sessionId = `session:conformance:${suffix}:host-sessions`
          const session = yield* services.runtime.createSession({
            id: sessionId,
            title: "Driver conformance",
          })
          expect(yield* services.runtime.session(sessionId)).toEqual(session)
          expect(yield* services.runtime.listSessions).toContainEqual(session)

          const receipt = yield* services.runtime.send({
            to: options.address,
            sessionId,
            idempotencyKey: `conformance:${suffix}:host-sessions`,
            prompt: "Session event replay",
          })
          expect(yield* services.runtime.sessionRuns(sessionId)).toEqual([
            expect.objectContaining({ runId: receipt.runId }),
          ])

          const replayedRunEvents = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
          const followed = yield* services.runtime.sessionEvents({ sessionId }).pipe(
            Stream.takeUntil(({ event }) => event._tag === "TurnStarted" && event.turn === 7),
            Stream.runCollect,
            Effect.forkScoped,
          )
          yield* Effect.yieldNow
          const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "host-sessions" })
          yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 7 } })
          const entries = Array.from(yield* Fiber.join(followed))

          expect(entries.map(({ cursor }) => cursor)).toEqual(entries.map((_, cursor) => cursor))
          expect(entries.slice(0, replayedRunEvents.length).map(({ event }) => event.eventId)).toEqual(
            replayedRunEvents.map(({ eventId }) => eventId),
          )
          expect(entries.at(-1)?.event).toMatchObject({ _tag: "TurnStarted", turn: 7 })
        }),
      ),
    ),
  )
}
