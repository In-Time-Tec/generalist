import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeDriver } from "../../core/durable/loop-driver.js"
import { make as makeInterpreter, journalNoop } from "../../core/durable/driver/interpreter.js"
import { make as makeBudget } from "../../core/durable/run-budget.js"
import { LoopDriverState } from "../../core/durable/loop-driver-state.js"
import { DriverError } from "../../core/durable/service.js"
import { declaration } from "../../tasks/component.js"
import type { ForkRewindCapability, Options, Services } from "./contract.js"

export const registerComponents = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ForkRewindCapability
  readonly prepare: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly open: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}): void => {
  it.effect("restores selected component state and command receipts across fork, rewind, and reopen", () => {
    const identity = `conformance:${input.options.name}:components`
    const scenario = (services: Services) =>
      Effect.gen(function* () {
        const source = yield* services.runtime.send({
          to: input.options.address,
          sessionId: `session:${identity}`,
          idempotencyKey: identity,
          prompt: "component branches",
        })
        const claim = yield* input.capability.claim(services, { runId: source.runId, commandId: "components" })
        const execution = yield* services.store.loadExecution(source.runId)
        const driver = makeDriver({ logicalOperationId: source.runId, sessionId: `session:${identity}` })
        const initial = yield* driver.initial({
          prompt: Prompt.make("components"),
          budget: makeBudget({}),
          executable: execution.executableRef,
        })
        const interpreter = yield* makeInterpreter({
          driver,
          initial,
          components: [declaration.registration],
          journal: {
            ...journalNoop,
            onCheckpoint: (checkpoint, commandId) =>
              services.store
                .saveExecution({
                  ...claim,
                  commandId: commandId ?? identity,
                  checkpoint,
                })
                .pipe(Effect.mapError(() => DriverError.make({ message: "Component checkpoint rejected" }))),
          },
        })
        const command = {
          capability: declaration.registration.capability,
          id: `${source.runId}:component:first`,
          command: { items: [{ id: "selected", title: "Selected state", status: "doing" }] },
        }
        yield* interpreter.componentCommand(command)
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: "component-selected",
          event: { _tag: "TurnStarted", turn: 0 },
        })
        const selected = (yield* services.store.inspect(source.runId)).lastSequence
        yield* interpreter.componentCommand({
          ...command,
          id: `${source.runId}:component:second`,
          command: { items: [] },
        })
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: "component-abandoned",
          event: { _tag: "TurnStarted", turn: 1 },
        })
        yield* services.store.releaseExecution(claim)
        const fork = `${source.runId}:component-fork`
        const branch = `${source.runId}:component-abandoned`
        yield* services.store.fork({
          runId: source.runId,
          commandId: "component-fork",
          newRunId: fork,
          atSequence: selected,
        })
        yield* services.store.rewind({
          runId: source.runId,
          commandId: "component-rewind",
          branchRunId: branch,
          toSequence: selected,
        })
        return { source: source.runId, fork, branch }
      })
    return input.prepare(
      input.open(scenario).pipe(
        Effect.flatMap((runs) =>
          input.open((services) =>
            Effect.gen(function* () {
              for (const runId of [runs.source, runs.fork, runs.branch]) {
                const execution = yield* services.store.loadExecution(runId)
                const checkpoint = execution.checkpoint
                if (checkpoint === undefined || !("driverVersion" in checkpoint))
                  return yield* Effect.die("Component checkpoint missing")
                const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
                const component = state.components?.[0]
                expect(component?.state).toEqual(
                  runId === runs.branch ? [] : [{ id: "selected", title: "Selected state", status: "doing" }],
                )
                expect(component?.receipts).toHaveLength(runId === runs.branch ? 2 : 1)
                expect(component?.receipts[0]?.id).toBe(`${runId}:component:first`)
              }
            }),
          ),
        ),
      ),
    )
  })
}
