import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeInterpreter, journalNoop } from "../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver } from "../../../src/core/durable/loop-driver.js"
import { make as makeBudget } from "../../../src/core/durable/run-budget.js"
import { LoopDriverState } from "../../../src/core/durable/loop-driver-state.js"
import { layerTest, make, type Options } from "../../../src/core/durable/component.js"
import { validate } from "../../../src/core/durable/component/state.js"
import { DriverError } from "../../../src/core/durable/service.js"
import { declaration } from "../../../src/tasks/component.js"

const registration = declaration.registration
const command = {
  capability: registration.capability,
  id: "tool:tasks:1",
  command: { items: [{ id: "one", title: "First", status: "doing" }] },
}

const setup = Effect.gen(function* () {
  const driver = makeDriver({ logicalOperationId: "component-test", sessionId: "component-test" })
  const initial = yield* driver.initial({ prompt: Prompt.make("tasks"), budget: makeBudget({}) })
  return { driver, initial, components: [registration] }
})

const numberOptions = (overrides: Partial<Options<number, number>> = {}): Options<number, number> => ({
  key: "test.counter",
  instance: "default",
  schemaVersion: "1",
  handler: "increment",
  handlerVersion: "1",
  scope: "run",
  maxStateBytes: 64,
  maxCommandBytes: 64,
  maxReceiptBytes: 4096,
  state: Schema.Int,
  command: Schema.Int,
  initial: 0,
  transition: (state, amount) => state + amount,
  ...overrides,
})

it("derives fixed protocol policy without executing transitions", () => {
  let transitions = 0
  const component = make(
    numberOptions({
      transition: (state, amount) => {
        transitions++
        return state + amount
      },
    }),
  )

  expect(component.registration.descriptor).toEqual({
    version: "1",
    key: "test.counter",
    instance: "default",
    schemaVersion: "1",
    handler: "increment",
    handlerVersion: "1",
    scope: "run",
    branch: "restore",
    redaction: "visible",
    maxStateBytes: 64,
    maxCommandBytes: 64,
    maxReceiptBytes: 4096,
  })
  expect(transitions).toBe(0)
  expect(Object.isFrozen(component)).toBe(true)
  expect(Object.isFrozen(component.registration)).toBe(true)
  expect(Object.isFrozen(component.registration.descriptor)).toBe(true)
  expect(Object.isFrozen(component.registration.capability)).toBe(true)
})

it("reports precise sanitized declaration failures", () => {
  for (const [overrides, field, reason] of [
    [{ key: "bad key" }, "key", "malformed-identity"],
    [{ instance: "" }, "instance", "malformed-identity"],
    [{ scope: "tenant" }, "scope", "invalid-scope"],
    [{ maxStateBytes: 0 }, "maxStateBytes", "not-positive-safe-integer"],
    [{ maxCommandBytes: Number.MAX_SAFE_INTEGER + 1 }, "maxCommandBytes", "not-positive-safe-integer"],
    [{ maxReceiptBytes: Number.NaN }, "maxReceiptBytes", "not-positive-safe-integer"],
    [{ initial: 0.5 }, "initial", "initial-invalid"],
  ] as const) {
    let failure: unknown
    try {
      // @ts-expect-error this test deliberately crosses the typed constructor boundary to verify runtime validation.
      make(numberOptions(overrides))
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      _tag: "generalist/components/ComponentDeclarationInvalid",
      key: overrides.key ?? "test.counter",
      instance: overrides.instance ?? "default",
      field,
      reason,
    })
    expect(failure).not.toHaveProperty("state")
    expect(failure).not.toHaveProperty("command")
  }
})

it.effect("snapshots and deeply freezes the initial encoded state", () =>
  Effect.gen(function* () {
    const initial = { values: [1] }
    const State = Schema.Struct({ values: Schema.Array(Schema.Int) })
    const component = make({
      ...numberOptions(),
      state: State,
      initial,
      transition: (state, amount) => ({ values: [...state.values, amount] }),
    })
    initial.values.push(2)
    const retained = yield* component.registration.initial
    expect(retained).toEqual({ values: [1] })
    expect(Object.isFrozen(retained)).toBe(true)
    expect(Schema.is(State)(retained)).toBe(true)
    if (Schema.is(State)(retained)) expect(Object.isFrozen(retained.values)).toBe(true)
  }),
)

it.effect("rejects duplicate component namespaces in the static test registry", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.scoped(Layer.build(layerTest([registration, registration]))).pipe(Effect.flip)
    expect(failure).toMatchObject({
      _tag: "generalist/components/ComponentDeclarationInvalid",
      field: "key",
      reason: "duplicate-namespace",
    })
  }),
)

it.effect("reopens accepted component commands before tool completion without redispatching the transition", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const persisted = yield* Ref.make(input.initial)
    const identities = yield* Ref.make<ReadonlyArray<string | undefined>>([])
    const interpreter = yield* makeInterpreter({
      ...input,
      journal: {
        ...journalNoop,
        onCheckpoint: (checkpoint, id) =>
          Ref.set(persisted, checkpoint).pipe(Effect.andThen(Ref.update(identities, (ids) => [...ids, id]))),
      },
    })
    expect(yield* interpreter.componentCommand(command)).toEqual(command.command.items)
    expect(yield* interpreter.recorded).toEqual([])
    const reopened = yield* makeInterpreter({
      ...input,
      initial: yield* Ref.get(persisted),
      journal: { ...journalNoop, onCheckpoint: () => Effect.die("exact retry must not append") },
    })
    expect(yield* reopened.componentCommand(command)).toEqual(command.command.items)
    expect(yield* Ref.get(identities)).toEqual([
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(Schema.String)))([
        "component",
        command.capability.namespace,
        command.id,
      ]),
    ])
    expect(yield* reopened.componentCommand({ ...command, command: { items: [] } }).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentCommandConflict",
      commandId: command.id,
    })
  }),
)

it.effect("does not install an unacknowledged mutation and reconciles a lost acknowledgement on reopen", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const persisted = yield* Ref.make(input.initial)
    const interpreter = yield* makeInterpreter({
      ...input,
      journal: {
        ...journalNoop,
        onCheckpoint: (checkpoint) =>
          Ref.set(persisted, checkpoint).pipe(Effect.andThen(DriverError.make({ message: "lost acknowledgement" }))),
      },
    })
    expect(yield* interpreter.componentCommand(command).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentUnavailable",
      reason: "persistence",
    })
    expect(yield* interpreter.checkpoint).toEqual(input.initial)
    expect(
      Exit.isFailure(
        yield* Effect.exit(interpreter.componentCommand({ ...command, id: "sibling", command: { items: [] } })),
      ),
    ).toBe(true)
    expect(Exit.isFailure(yield* Effect.exit(interpreter.setToolBatch(undefined)))).toBe(true)
    const accepted = yield* Ref.get(persisted)
    const acceptedState = yield* Schema.decodeUnknownEffect(LoopDriverState)(accepted.state)
    expect(acceptedState.components?.[0]?.state).toEqual(command.command.items)
    const reopened = yield* makeInterpreter({ ...input, initial: yield* Ref.get(persisted) })
    expect(yield* reopened.componentCommand(command)).toEqual(command.command.items)
  }),
)

it.effect("restores selected component state and receipts while keeping branches independent", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const original = yield* makeInterpreter(input)
    yield* original.componentCommand(command)
    const selected = yield* original.checkpoint
    yield* original.componentCommand({ ...command, id: "tool:tasks:2", command: { items: [] } })
    const abandoned = yield* original.checkpoint
    const fork = yield* makeInterpreter({ ...input, initial: selected })
    const rewind = yield* makeInterpreter({ ...input, initial: selected })
    expect(yield* fork.componentCommand(command)).toEqual(command.command.items)
    expect(yield* rewind.componentCommand(command)).toEqual(command.command.items)
    yield* fork.componentCommand({ ...command, id: "fork:write", command: { items: [] } })
    expect(yield* rewind.checkpoint).toEqual(selected)
    expect(yield* original.checkpoint).toEqual(abandoned)
  }),
)

it.effect("rejects missing registrations and changed handler versions before scheduling execution", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const interpreter = yield* makeInterpreter(input)
    yield* interpreter.componentCommand(command)
    const initial = yield* interpreter.checkpoint
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(initial.state)
    const changed = make({
      key: registration.descriptor.key,
      instance: registration.descriptor.instance,
      schemaVersion: registration.descriptor.schemaVersion,
      handler: registration.descriptor.handler,
      handlerVersion: "2",
      scope: registration.descriptor.scope,
      maxStateBytes: registration.descriptor.maxStateBytes,
      maxCommandBytes: registration.descriptor.maxCommandBytes,
      maxReceiptBytes: registration.descriptor.maxReceiptBytes,
      state: declaration.state,
      command: declaration.command,
      initial: [],
      transition: (_, next) => next.items,
    })
    expect(Exit.isFailure(yield* Effect.exit(validate(state.components ?? [], [changed.registration])))).toBe(true)
    const reopened = yield* makeInterpreter({ driver: input.driver, initial, components: [] })
    const result = yield* Effect.exit(
      reopened.run(
        {
          kind: "tool",
          key: "missing",
          input: {},
          replayPolicy: "pure",
          success: Schema.String,
          failure: Schema.String,
        },
        Effect.die("missing code must reject before execution"),
      ),
    )
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* reopened.recorded).toEqual([])
    expect(yield* reopened.checkpoint).toEqual(initial)
  }),
)

it.effect("rejects namespace escape, excessive bytes, and undeclared command fields atomically", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const interpreter = yield* makeInterpreter(input)
    expect(
      yield* interpreter
        .componentCommand({
          ...command,
          capability: { ...command.capability, namespace: '["generalist.other","default"]' },
        })
        .pipe(Effect.flip),
    ).toMatchObject({ _tag: "generalist/components/ComponentUnavailable", reason: "not-registered" })
    expect(yield* interpreter.checkpoint).toEqual(input.initial)

    expect(
      yield* interpreter.componentCommand({ ...command, command: { items: [], namespace: "other" } }).pipe(Effect.flip),
    ).toMatchObject({ _tag: "generalist/components/ComponentCommandInvalid", reason: "decode" })
    expect(yield* interpreter.checkpoint).toEqual(input.initial)

    expect(
      yield* interpreter
        .componentCommand({
          ...command,
          command: { items: [{ id: "large", title: "x".repeat(65_536), status: "todo" }] },
        })
        .pipe(Effect.flip),
    ).toMatchObject({ _tag: "generalist/components/ComponentCommandInvalid", reason: "bounds" })
    expect(yield* interpreter.checkpoint).toEqual(input.initial)
  }),
)

it.effect("leaves no state or receipt when a transition or state encode fails", () =>
  Effect.gen(function* () {
    let reject = true
    let invalidState = false
    const component = make(
      numberOptions({
        transition: (state, amount) => {
          if (reject) throw new Error("reject")
          return invalidState ? 0.5 : state + amount
        },
      }),
    )
    const driver = makeDriver({ logicalOperationId: "atomic-component", sessionId: "atomic-component" })
    const initial = yield* driver.initial({ prompt: Prompt.make("atomic"), budget: makeBudget({}) })
    const interpreter = yield* makeInterpreter({
      driver,
      initial,
      components: [component.registration],
    })
    const input = { capability: component.registration.capability, id: "retryable", command: 1 }

    expect(yield* interpreter.componentCommand(input).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentStateInvalid",
      reason: "transition",
    })
    expect(yield* interpreter.checkpoint).toEqual(initial)

    reject = false
    invalidState = true
    expect(yield* interpreter.componentCommand(input).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentStateInvalid",
      reason: "encode",
    })
    expect(yield* interpreter.checkpoint).toEqual(initial)

    invalidState = false
    expect(yield* interpreter.componentCommand(input)).toBe(1)
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* interpreter.checkpoint).state)
    expect(state.components?.[0]?.receipts).toHaveLength(1)
  }),
)
