import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { ForkRewindCapability, Options, Services } from "./contract.js"

interface Registration<LayerError, ClaimsLayerError> {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ForkRewindCapability
  readonly provide: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}

const semanticEvent = (event: { readonly runId: string; readonly rootRunId: string; readonly eventId: string }) => {
  const { runId: _runId, rootRunId: _rootRunId, eventId: _eventId, ...semantic } = event
  return semantic
}

/** Register the shared journal-prefix fork and retained-rewind-branch contract. */
export const registerForkRewind = <LayerError, ClaimsLayerError>(
  registration: Registration<LayerError, ClaimsLayerError>,
): void => {
  const { capability, options, provide } = registration
  it.effect("forks an exact prefix and retains the discarded rewind suffix as a branch", () =>
    provide((services) =>
      Effect.gen(function* () {
        const identity = `conformance:${options.name}:fork-rewind`
        const source = yield* services.runtime.send({
          to: options.address,
          sessionId: `session:${identity}`,
          idempotencyKey: identity,
          prompt: "fork and rewind",
        })
        const plainForkRunId = `${source.runId}:plain-fork`
        yield* services.store.fork({ runId: source.runId, newRunId: plainForkRunId, atSequence: 0 })
        expect((yield* services.store.inspect(source.runId)).branches).toContainEqual({
          runId: plainForkRunId,
          forkedAt: 0,
        })
        const claim = yield* capability.claim(services, { runId: source.runId, workerId: "fork-rewind" })
        yield* services.store.emitAgentEvent({
          ...claim,
          event: {
            _tag: "ToolProgress",
            turn: 0,
            toolCallId: "sandbox",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshotUnavailable" },
          },
        })
        const unavailableAt = (yield* services.store.inspect(source.runId)).lastSequence
        const noSnapshot = yield* services.store
          .fork({ runId: source.runId, newRunId: `${source.runId}:no-snapshot`, atSequence: unavailableAt })
          .pipe(Effect.flip)
        expect(noSnapshot._tag).toBe("generalist/runtime/NoSnapshot")
        yield* services.store.emitAgentEvent({
          ...claim,
          event: {
            _tag: "ToolProgress",
            turn: 0,
            toolCallId: "sandbox",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshot", snapshotId: "snapshot:fork-rewind" },
          },
        })
        const forkAt = (yield* services.store.inspect(source.runId)).lastSequence
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
        const forkRunId = `${source.runId}:fork`
        yield* services.store.fork({ runId: source.runId, newRunId: forkRunId, atSequence: forkAt })
        const sourcePrefix = yield* services.store.history({ runId: source.runId, cursor: -1, limit: forkAt + 1 })
        const forkPrefix = yield* services.store.history({ runId: forkRunId, cursor: -1, limit: forkAt + 1 })
        expect(forkPrefix.map(semanticEvent)).toEqual(sourcePrefix.map(semanticEvent))
        expect((yield* services.store.inspect(source.runId)).branches).toContainEqual({
          runId: forkRunId,
          forkedAt: forkAt,
        })

        const branchRunId = `${source.runId}:discarded`
        yield* services.store.rewind({ runId: source.runId, branchRunId, toSequence: forkAt })
        const inspection = yield* services.store.inspect(source.runId)
        expect(inspection.lastSequence).toBe(forkAt)
        expect(inspection.branches).toEqual(
          expect.arrayContaining([
            { runId: plainForkRunId, forkedAt: 0 },
            { runId: forkRunId, forkedAt: forkAt },
            { runId: branchRunId, forkedAt: forkAt },
          ]),
        )
        expect((yield* services.store.inspect(branchRunId)).lastSequence).toBeGreaterThan(forkAt)
      }),
    ),
  )
}
