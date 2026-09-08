import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeComponent } from "../../../core/durable/component.js"
import { make as makeDriver } from "../../../core/durable/loop-driver.js"
import { make as makeInterpreter, journalNoop } from "../../../core/durable/driver/interpreter.js"
import { make as makeBudget } from "../../../core/durable/run-budget.js"
import { DriverError } from "../../../core/durable/service.js"
import type { ForkRewindCapability, Options, Services } from "../contract.js"

export const registerSessionComponents = <E, ClaimsError>(input: {
  readonly options: Options<E, ClaimsError>
  readonly capability: ForkRewindCapability
  readonly prepare: <A, Error>(effect: Effect.Effect<A, Error>) => Effect.Effect<A, Error>
  readonly open: <A, Error>(use: (services: Services) => Effect.Effect<A, Error>) => Effect.Effect<A, Error | E>
}): void => {
  const component = makeComponent({
    descriptor: {
      version: "1",
      key: "session-counter",
      instance: "default",
      schemaVersion: "1",
      handler: "counter",
      handlerVersion: "1",
      scope: "session",
      access: "session-owner",
      inheritance: "none",
      branch: "restore",
      redaction: "visible",
      maxStateBytes: 64,
      maxCommandBytes: 64,
      maxReceiptBytes: 4096,
    },
    state: Schema.Int,
    command: Schema.Int,
    initial: 0,
    transition: (before, delta) => before + delta,
  })
  const openInterpreter = (services: Services, runId: string, commandId: string, loseAcknowledgement = false) =>
    Effect.gen(function* () {
      const claim = yield* input.capability.claim(services, { runId, commandId })
      const execution = yield* services.store.loadExecution(runId)
      const driver = makeDriver({ logicalOperationId: runId, sessionId: execution.message.sessionId })
      const initial =
        execution.checkpoint !== undefined && "driverVersion" in execution.checkpoint
          ? execution.checkpoint
          : yield* driver.initial({
              prompt: Prompt.make("counter"),
              budget: makeBudget({}),
              executable: execution.executableRef,
            })
      const interpreter = yield* makeInterpreter({
        driver,
        initial,
        components: [component.registration],
        sessionState: { sessionId: execution.message.sessionId, components: execution.sessionComponents ?? [] },
        journal: {
          ...journalNoop,
          onCheckpoint: (checkpoint, id) =>
            services.store
              .saveExecution({
                ...claim,
                checkpoint,
                commandId: id ?? commandId,
              })
              .pipe(
                Effect.mapError(() => DriverError.make({ message: "Component commit failed" })),
                Effect.andThen(
                  loseAcknowledgement ? DriverError.make({ message: "Lost acknowledgement" }) : Effect.void,
                ),
              ),
        },
      })
      return { interpreter, claim }
    })

  it.effect("retains Session commands across Runs and fresh Layers after acceptance before tool publication", () => {
    const sessionId = `session:components:${input.options.name}:reopen`
    const command = { capability: component.registration.capability, id: `${sessionId}:accepted`, command: 1 }
    return input.prepare(
      input
        .open((services) =>
          Effect.gen(function* () {
            const first = yield* services.runtime.send({
              to: input.options.address,
              sessionId,
              idempotencyKey: `${sessionId}:first`,
              prompt: "first",
            })
            const { interpreter, claim } = yield* openInterpreter(services, first.runId, "first", true)
            expect(Exit.isFailure(yield* Effect.exit(interpreter.componentCommand(command)))).toBe(true)
            expect((yield* services.store.loadExecution(first.runId)).sessionComponents?.[0]?.state).toBe(1)
            expect(yield* interpreter.recorded).toEqual([])
            yield* services.store.releaseExecution(claim)
            return first.runId
          }),
        )
        .pipe(
          Effect.flatMap((runId) =>
            input.open((services) =>
              Effect.gen(function* () {
                const { interpreter, claim } = yield* openInterpreter(services, runId, "recovered")
                expect(yield* interpreter.componentCommand(command)).toBe(1)
                expect((yield* services.store.loadExecution(runId)).sessionComponents?.[0]?.receipts).toHaveLength(1)
                yield* services.store.complete({
                  ...claim,
                  commandId: "complete",
                  result: {
                    text: "done",
                    output: "done",
                    turns: 1,
                    session: { sessionId, leafId: null },
                  },
                })
                yield* services.store.releaseExecution(claim)
                const next = yield* services.runtime.send({
                  to: input.options.address,
                  sessionId,
                  idempotencyKey: `${sessionId}:second`,
                  prompt: "second",
                })
                const second = yield* openInterpreter(services, next.runId, "second")
                expect(
                  yield* second.interpreter.componentCommand({
                    ...command,
                    id: `${sessionId}:second-command`,
                    command: 2,
                  }),
                ).toBe(3)
                expect((yield* services.store.loadExecution(next.runId)).sessionComponents?.[0]?.receipts).toHaveLength(
                  2,
                )
                yield* services.store.releaseExecution(second.claim)
                return next.runId
              }),
            ),
          ),
          Effect.flatMap((runId) =>
            input.open((services) =>
              Effect.gen(function* () {
                expect((yield* services.store.loadExecution(runId)).sessionComponents?.[0]?.state).toBe(3)
              }),
            ),
          ),
        ),
    )
  })

  it.effect("restores Session values while retaining abandoned command receipts and independent fork ownership", () => {
    const sessionId = `session:components:${input.options.name}:branch`
    const command = { capability: component.registration.capability, id: `${sessionId}:first`, command: 1 }
    return input.prepare(
      input
        .open((services) =>
          Effect.gen(function* () {
            const first = yield* services.runtime.send({
              to: input.options.address,
              sessionId,
              idempotencyKey: sessionId,
              prompt: "branch",
            })
            const { interpreter, claim } = yield* openInterpreter(services, first.runId, "branch")
            yield* interpreter.componentCommand(command)
            yield* services.store.emitAgentEvent({
              ...claim,
              commandId: "selected",
              event: { _tag: "TurnStarted", turn: 0 },
            })
            const selected = (yield* services.store.inspect(first.runId)).lastSequence
            yield* interpreter.componentCommand({ ...command, id: `${sessionId}:later`, command: 10 })
            yield* services.store.emitAgentEvent({
              ...claim,
              commandId: "later",
              event: { _tag: "TurnStarted", turn: 1 },
            })
            yield* services.store.releaseExecution(claim)
            const fork = `${first.runId}:fork`
            yield* services.store.fork({ runId: first.runId, commandId: "fork", newRunId: fork, atSequence: selected })
            yield* services.store.rewind({
              runId: first.runId,
              commandId: "rewind",
              branchRunId: `${first.runId}:abandoned`,
              toSequence: selected,
            })
            return { source: first.runId, fork }
          }),
        )
        .pipe(
          Effect.flatMap(({ source, fork }) =>
            input.open((services) =>
              Effect.gen(function* () {
                expect((yield* services.store.loadExecution(source)).sessionComponents?.[0]).toMatchObject({
                  state: 1,
                  receipts: [{ id: command.id }, { id: `${sessionId}:later` }],
                })
                expect((yield* services.store.loadExecution(fork)).sessionComponents?.[0]).toMatchObject({
                  state: 1,
                  receipts: [{ id: command.id }],
                })
                yield* services.runtime.activate({ runId: source, commandId: "activate-source" })
                const restored = yield* openInterpreter(services, source, "restored")
                expect(
                  yield* restored.interpreter.componentCommand({ ...command, id: `${sessionId}:later`, command: 10 }),
                ).toBe(11)
                expect((yield* services.store.loadExecution(source)).sessionComponents?.[0]?.state).toBe(1)
                yield* services.store.releaseExecution(restored.claim)
                yield* services.runtime.activate({ runId: fork, commandId: "activate-fork" })
                const branch = yield* openInterpreter(services, fork, "forked")
                expect(
                  yield* branch.interpreter.componentCommand({
                    ...command,
                    id: `${sessionId}:fork-command`,
                    command: 2,
                  }),
                ).toBe(3)
                expect((yield* services.store.loadExecution(source)).sessionComponents?.[0]?.state).toBe(1)
                yield* services.store.releaseExecution(branch.claim)
              }),
            ),
          ),
        ),
    )
  })
}
