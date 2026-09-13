import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Descriptor, make } from "../../../../src/core/durable/component.js"
import { validate } from "../../../../src/core/durable/component/state.js"
import { make as makeInterpreter } from "../../../../src/core/durable/driver/interpreter.js"
import { make as makeDriver } from "../../../../src/core/durable/loop-driver.js"
import { make as makeBudget } from "../../../../src/core/durable/run-budget.js"
import { LoopDriverState } from "../../../../src/core/durable/loop-driver-state.js"
import { emptySession } from "../../../../src/runtime/state/projection.js"
import { rewoundSession } from "../../../../src/runtime/state/store/fork/history.js"

const component = make({
  key: "session-state",
  instance: "default",
  schemaVersion: "1",
  handler: "replace",
  handlerVersion: "1",
  scope: "session",
  maxStateBytes: 64,
  maxCommandBytes: 64,
  maxReceiptBytes: 4096,
  state: Schema.NullOr(Schema.Int),
  command: Schema.NullOr(Schema.Int),
  initial: null,
  transition: (_, command) => command,
})
const command = { capability: component.registration.capability, id: "accepted", command: 1 }
const setup = Effect.gen(function* () {
  const driver = makeDriver({ logicalOperationId: "parent", sessionId: "parent" })
  const initial = yield* driver.initial({ prompt: Prompt.make("state"), budget: makeBudget({}) })
  return {
    driver,
    initial,
    components: [component.registration],
    sessionState: { sessionId: "parent", components: [] },
  }
})

it.effect("requires explicit Session owner access and no automatic child inheritance", () =>
  Effect.gen(function* () {
    const { access: _, inheritance: __, ...implicit } = component.registration.descriptor
    expect(Schema.is(Descriptor)(implicit)).toBe(false)
    expect(Schema.is(Descriptor)({ ...implicit, access: "parent-write", inheritance: "shared" })).toBe(false)
    const input = yield* setup
    const unbound = yield* makeInterpreter({ ...input, sessionState: undefined })
    expect(yield* unbound.componentRead(component.registration.capability).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentAccessDenied",
      scope: "session",
    })
    expect(yield* unbound.componentCommand(command).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentAccessDenied",
      scope: "session",
    })
    const child = yield* makeInterpreter({ ...input, sessionState: { sessionId: "child", components: [] } })
    expect(yield* child.componentRead(component.registration.capability).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentAccessDenied",
      sessionId: "parent",
    })
    expect(yield* child.componentCommand(command).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentAccessDenied",
      sessionId: "parent",
    })
    expect(yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* child.checkpoint).state)).toMatchObject({
      sessionId: "parent",
      components: [],
    })
  }),
)

it.effect("rejects missing Session registrations and changed pins before dispatch or mutation", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const writer = yield* makeInterpreter(input)
    yield* writer.componentCommand(command)
    const initial = yield* writer.checkpoint
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(initial.state)
    const sessionState = { sessionId: "parent", components: state.components ?? [] }
    expect(yield* validate(sessionState.components, []).pipe(Effect.flip)).toMatchObject({
      _tag: "generalist/components/ComponentUnavailable",
      reason: "not-registered",
    })
    const missing = yield* makeInterpreter({ ...input, initial, sessionState, components: [] })
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          missing.run(
            {
              kind: "tool",
              key: "must-not-dispatch",
              input: {},
              replayPolicy: "pure",
              success: Schema.String,
              failure: Schema.String,
            },
            Effect.die("missing registration dispatched"),
          ),
        ),
      ),
    ).toBe(true)
    expect(yield* missing.recorded).toEqual([])
    const changed = make({
      key: component.registration.descriptor.key,
      instance: component.registration.descriptor.instance,
      schemaVersion: component.registration.descriptor.schemaVersion,
      handler: component.registration.descriptor.handler,
      handlerVersion: "2",
      scope: component.registration.descriptor.scope,
      maxStateBytes: component.registration.descriptor.maxStateBytes,
      maxCommandBytes: component.registration.descriptor.maxCommandBytes,
      maxReceiptBytes: component.registration.descriptor.maxReceiptBytes,
      state: component.state,
      command: component.command,
      initial: null,
      transition: (_, value) => value,
    })
    const incompatible = yield* makeInterpreter({ ...input, initial, sessionState, components: [changed.registration] })
    expect(
      yield* incompatible
        .componentCommand({ ...command, capability: changed.registration.capability })
        .pipe(Effect.flip),
    ).toMatchObject({
      _tag: "generalist/components/ComponentUnavailable",
      reason: "wrong-version",
    })
  }),
)

it.effect("rewinds before first use to the retained initial value without erasing receipts", () =>
  Effect.gen(function* () {
    const input = yield* setup
    const interpreter = yield* makeInterpreter(input)
    yield* interpreter.componentCommand(command)
    yield* interpreter.componentCommand({ ...command, id: "second", command: 2 })
    const checkpoint = yield* interpreter.checkpoint
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
    const restored = yield* rewoundSession({
      session: { ...emptySession(), components: state.components ?? [] },
      leaf: null,
    })
    expect(restored.components?.[0]?.state).toBeNull()
    expect(restored.components?.[0]?.initialState).toBeNull()
    expect(restored.components?.[0]?.receipts).toHaveLength(2)
    const reopened = yield* makeInterpreter({
      ...input,
      sessionState: { sessionId: "parent", components: restored.components ?? [] },
    })
    expect(yield* reopened.componentCommand(command)).toBe(1)
    const replayed = yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* reopened.checkpoint).state)
    expect(replayed.components?.[0]?.state).toBeNull()
    expect(yield* reopened.componentCommand({ ...command, id: "new-branch", command: 3 })).toBe(3)
  }),
)
