import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeInterpreter, journalNoop } from "../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver } from "../../../src/core/durable/loop-driver.js"
import { make as makeBudget } from "../../../src/core/durable/run-budget.js"
import { LoopDriverState } from "../../../src/core/durable/loop-driver-state.js"
import { layerTest, make, validate } from "../../../src/core/durable/component.js"
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

it.effect("rejects duplicate component namespaces in the static test registry", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(Effect.scoped(Layer.build(layerTest([registration, registration]))))
    expect(Exit.isFailure(result)).toBe(true)
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
    expect(Exit.isFailure(yield* Effect.exit(reopened.componentCommand({ ...command, command: { items: [] } })))).toBe(
      true,
    )
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
    expect(Exit.isFailure(yield* Effect.exit(interpreter.componentCommand(command)))).toBe(true)
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
      descriptor: { ...registration.descriptor, handlerVersion: "2" },
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
    for (const invalid of [
      { ...command, capability: { ...command.capability, namespace: '["generalist.other","default"]' } },
      { ...command, command: { items: [], namespace: "other" } },
      { ...command, command: { items: [{ id: "large", title: "x".repeat(65_536), status: "todo" }] } },
    ]) {
      expect(Exit.isFailure(yield* Effect.exit(interpreter.componentCommand(invalid)))).toBe(true)
      expect(yield* interpreter.checkpoint).toEqual(input.initial)
    }
  }),
)
