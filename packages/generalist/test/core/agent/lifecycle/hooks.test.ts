import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AddContext, Continue, type Declaration, Hooks, layer, make, onRunStart } from "../../../../src/hooks/index.js"
import { evaluate } from "../../../../src/core/agent/lifecycle/hooks.js"
import {
  DriverInterpreter,
  make as makeInterpreter,
  journalNoop,
} from "../../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver } from "../../../../src/core/durable/loop-driver.js"
import { make as makeBudget } from "../../../../src/core/durable/run-budget.js"
import type { OperationOutcome } from "../../../../src/core/durable/driver/contract.js"
import { Suspended } from "../../../../src/core/tools/nested-operation.js"
import { LoopDriverState } from "../../../../src/core/durable/loop-driver-state.js"
import { DriverError } from "../../../../src/core/durable/service.js"

const setup = Effect.gen(function* () {
  const driver = makeDriver({ logicalOperationId: "hook-recovery", sessionId: "hook-recovery" })
  const initial = yield* driver.initial({ prompt: Prompt.make("input"), budget: makeBudget({}) })
  return { driver, initial }
})

const run = (interpreter: typeof DriverInterpreter.Service, declarations: ReadonlyArray<Declaration>) =>
  evaluate({
    key: "hook:run:start",
    event: "RunStart",
    input: { runId: "ephemeral-core-run", agentName: "hook-recovery", input: Prompt.make("input") },
    applyDecision: (current) => current,
  }).pipe(Effect.provideService(DriverInterpreter, interpreter), Effect.provideService(Hooks, make({ declarations })))

it.effect("retains a completed remember cursor across hooks and advances it only for the next real operation", () =>
  Effect.gen(function* () {
    const interpreter = yield* makeInterpreter(yield* setup)
    yield* interpreter.run(
      {
        kind: "memory",
        key: "remember",
        input: { turn: 0, terminal: true },
        replayPolicy: "pure",
        success: Schema.Void,
        failure: Schema.String,
      },
      Effect.void,
    )
    const declaration = onRunStart({
      key: "cursor-test",
      version: "1",
      replayPolicy: "pure",
      hook: () => Effect.succeed(Continue()),
    })
    yield* run(interpreter, [declaration])
    const afterHook = yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* interpreter.checkpoint).state)
    expect(afterHook.pending).toMatchObject({ kind: "memory", key: "remember", completed: true })
    yield* interpreter.abortPending("cancelled")
    expect(yield* interpreter.recorded).toHaveLength(2)
    yield* interpreter.run(
      {
        kind: "model",
        key: "next-model",
        input: { modelCallOrdinal: 0 },
        replayPolicy: "pure",
        success: Schema.String,
        failure: Schema.String,
      },
      Effect.succeed("next"),
    )
    const next = yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* interpreter.checkpoint).state)
    expect(next.pending).toBeUndefined()
    expect(next.modelCallOrdinal).toBe(1)
  }),
)

it.effect("replays an accepted unsafe hook outcome after interruption before its decision checkpoint", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const checkpoint = yield* Ref.make(input.initial)
    const outcomes = yield* Ref.make(new Map<string, OperationOutcome>())
    let calls = 0
    const declaration = onRunStart({
      key: "external-effect",
      version: "1",
      replayPolicy: "never",
      hook: () =>
        Effect.sync(() => {
          calls += 1
          return AddContext("accepted")
        }),
    })
    const first = yield* makeInterpreter({
      ...input,
      journal: {
        ...journalNoop,
        onCheckpoint: (next) => Ref.set(checkpoint, next),
        onCompleted: (operation, outcome, next) =>
          Ref.update(outcomes, (entries) => new Map(entries).set(operation.key, outcome)).pipe(
            Effect.andThen(Ref.set(checkpoint, next)),
            Effect.andThen(Effect.interrupt),
          ),
      },
    })
    expect(Exit.isFailure(yield* Effect.exit(run(first, [declaration])))).toBe(true)
    const persisted = yield* Ref.get(checkpoint)
    expect(persisted.state).toMatchObject({ hooks: [{ complete: false, decisions: [] }] })
    const reopened = yield* makeInterpreter({
      ...input,
      initial: persisted,
      journal: {
        ...journalNoop,
        onScheduled: (operation) => Ref.get(outcomes).pipe(Effect.map((entries) => entries.get(operation.key))),
        onCompleted: () => Effect.die("Accepted hook must not complete twice"),
      },
    })
    expect((yield* run(reopened, [declaration])).decisions).toMatchObject([{ _tag: "AddContext" }])
    expect(calls).toBe(1)
    expect((yield* reopened.checkpoint).state).toMatchObject({
      hooks: [{ complete: true, decisions: [{ _tag: "AddContext" }] }],
    })
  }),
)

it.effect("does not redispatch an unsafe hook with an unknown outcome", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const outcomes = yield* Ref.make(new Map<string, OperationOutcome>())
    let calls = 0
    const declaration = onRunStart({
      key: "unsafe",
      version: "1",
      replayPolicy: "never",
      hook: () =>
        Effect.sync(() => {
          calls += 1
        }).pipe(Effect.andThen(Effect.interrupt)),
    })
    const first = yield* makeInterpreter({
      ...input,
      journal: {
        ...journalNoop,
        onCompleted: (operation, outcome) =>
          Ref.update(outcomes, (entries) => new Map(entries).set(operation.key, outcome)),
      },
    })
    yield* Effect.exit(run(first, [declaration]))
    const reopened = yield* makeInterpreter({
      ...input,
      initial: yield* first.checkpoint,
      journal: {
        ...journalNoop,
        onScheduled: (operation) => Ref.get(outcomes).pipe(Effect.map((entries) => entries.get(operation.key))),
      },
    })
    expect(yield* run(reopened, [declaration]).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/core/DriverUnknownReplay",
    })
    expect(calls).toBe(1)
  }),
)

it.effect("rejects removed, reordered, or version-changed hooks even when decisions are complete", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const firstDeclaration = onRunStart({
      key: "first",
      version: "1",
      replayPolicy: "pure",
      hook: () => Effect.succeed(Continue()),
    })
    const secondDeclaration = onRunStart({
      key: "second",
      version: "1",
      replayPolicy: "pure",
      hook: () => Effect.succeed(Continue()),
    })
    const first = yield* makeInterpreter(input)
    yield* run(first, [firstDeclaration, secondDeclaration])
    const initial = yield* first.checkpoint
    for (const declarations of [
      [],
      [secondDeclaration, firstDeclaration],
      [{ ...firstDeclaration, version: "2" }, secondDeclaration],
    ]) {
      const reopened = yield* makeInterpreter({ ...input, initial })
      expect(yield* run(reopened, declarations).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/core/DriverStateInvalid",
      })
      expect(yield* reopened.checkpoint).toEqual(initial)
    }
    expect(
      Exit.isFailure(yield* Effect.exit(Effect.scoped(Layer.build(layer([firstDeclaration, firstDeclaration]))))),
    ).toBe(true)
  }),
)

it.effect("leaves an idempotent hook resumable when its nested operation suspends", () =>
  Effect.gen(function* () {
    const input = yield* setup
    let calls = 0
    const declaration = onRunStart({
      key: "nested",
      version: "1",
      replayPolicy: "provider-idempotent",
      hook: () =>
        Effect.suspend(() => {
          calls += 1
          return calls === 1
            ? Suspended.make({ token: "approval", operationKey: "nested-operation", ordinal: 0, capability: "test" })
            : Effect.succeed(Continue())
        }),
    })
    const first = yield* makeInterpreter(input)
    expect(yield* run(first, [declaration]).pipe(Effect.flip)).toMatchObject({ _tag: "generalist/core/HookFailed" })
    expect(yield* first.recorded).toEqual([])
    const reopened = yield* makeInterpreter({ ...input, initial: yield* first.checkpoint })
    expect((yield* run(reopened, [declaration])).decisions).toEqual([Continue()])
    expect(calls).toBe(2)
  }),
)

it.effect("does not invoke a hook after its schedule is rejected and fences later writes", () =>
  Effect.gen(function* () {
    let calls = 0
    let writes = 0
    const failure = DriverError.make({ message: "Hook schedule rejected" })
    const interpreter = yield* makeInterpreter({
      ...(yield* setup),
      journal: {
        ...journalNoop,
        onCheckpoint: () =>
          Effect.sync(() => {
            writes += 1
          }),
        onScheduled: () => failure,
      },
    })
    const declaration = onRunStart({
      key: "rejected-schedule",
      version: "1",
      replayPolicy: "never",
      hook: () =>
        Effect.sync(() => {
          calls += 1
          return Continue()
        }),
    })
    expect(yield* run(interpreter, [declaration]).pipe(Effect.flip)).toBe(failure)
    const checkpoint = yield* interpreter.checkpoint
    expect(yield* interpreter.setBudget(checkpoint.budget).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/core/DriverError",
      message: "Journal acknowledgement failed; reconstruct the interpreter before continuing",
    })
    expect(yield* interpreter.checkpoint).toEqual(checkpoint)
    expect(calls).toBe(0)
    expect(writes).toBe(1)
  }),
)

it.effect("does not checkpoint a decision after its outcome journal rejects completion", () =>
  Effect.gen(function* () {
    let calls = 0
    let writes = 0
    const failure = DriverError.make({ message: "Hook completion rejected" })
    const interpreter = yield* makeInterpreter({
      ...(yield* setup),
      journal: {
        ...journalNoop,
        onCheckpoint: () =>
          Effect.sync(() => {
            writes += 1
          }),
        onCompleted: () => failure,
      },
    })
    const declaration = onRunStart({
      key: "rejected-completion",
      version: "1",
      replayPolicy: "never",
      hook: () =>
        Effect.sync(() => {
          calls += 1
          return AddContext("not accepted")
        }),
    })
    expect(yield* run(interpreter, [declaration]).pipe(Effect.flip)).toBe(failure)
    const checkpoint = yield* interpreter.checkpoint
    expect(checkpoint.state).toMatchObject({ hooks: [{ decisions: [], complete: false }] })
    expect(yield* run(interpreter, [declaration]).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/core/DriverError",
      message: "Journal acknowledgement failed; reconstruct the interpreter before continuing",
    })
    expect(yield* interpreter.recorded).toEqual([])
    expect(yield* interpreter.checkpoint).toEqual(checkpoint)
    expect(calls).toBe(1)
    expect(writes).toBe(1)
  }),
)
