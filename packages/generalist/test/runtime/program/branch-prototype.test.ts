import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  AgentProgram,
  CodeExecutor,
  ExecutableManifest,
  Pins,
  ProgramCapabilities,
  ProgramHandlers,
} from "../../../src/index.js"
import { Address, ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { provideScoped } from "../execution/scoped-provide.js"

const makeFixture = (name: string, operations: () => ReadonlyArray<string>, dispatched: () => void) => {
  const program = AgentProgram.make({
    name,
    source: "fixture",
    sandbox: Pins.makeCapability({ capability: `${name}-sandbox`, version: 1 }),
    input: Prompt.Prompt,
    inputPin: Pins.makeCapability({ capability: `${name}-input`, version: 1 }),
    output: Schema.String,
    outputPin: Pins.makeCapability({ capability: `${name}-output`, version: 1 }),
    tools: [{ name: "echo", pin: Pins.makeCapability({ capability: `${name}-echo`, version: 1 }) }],
    steps: [],
    agents: [],
    budget: {
      agentRuns: 0,
      concurrency: 1,
      toolCalls: 32,
      tokens: 0,
      wallClockMillis: 60_000,
      logBytes: 1_000,
      outputBytes: 1_000,
    },
  })
  const executable = ExecutableManifest.make({
    root: program.pinned.pin,
    entries: [{ _tag: "Program", ...program.pinned }],
  })
  const handlers = ProgramHandlers.make({
    tools: [
      ProgramHandlers.tool({
        name: "echo",
        pin: program.pinned.manifest.capabilities.tools[0]!.pin,
        input: Schema.String,
        output: Schema.String,
        replay: "idempotent",
        authorize: () => Effect.succeed(true),
        execute: (value: string) =>
          Effect.sync(() => {
            dispatched()
            return `${value}:done`
          }),
      }),
    ],
    steps: [],
    agents: [],
  })
  const executor = CodeExecutor.makeTest(() =>
    Effect.gen(function* () {
      const host = yield* ProgramCapabilities.ProgramCapabilities
      let result: unknown
      for (const operation of operations()) {
        result = yield* host.callTool({ operation, tool: "echo", input: "value" })
      }
      return String(result)
    }),
  )
  const address = Address.make(`program:${name}`)
  return {
    address,
    layer: objectRuntimeLayer({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([{ _tag: "Program", executable, program, executor, handlers }]).pipe(
          Layer.orDie,
        ),
      ),
    ),
  }
}

const lastSequence = (events: ReadonlyArray<{ readonly sequence: number }>): number => {
  const last = events[events.length - 1]
  if (last === undefined) throw new TypeError("expected at least one Run event")
  return last.sequence
}

// Every own `Object.prototype` member accepted by `ProgramOperationName`
// (`^[A-Za-z][A-Za-z0-9_-]{0,63}$`). The branch replay frontier is a decoded
// `Schema.Record`, so an own-property lookup is required or these inherited
// functions become operation identities instead of fresh branch namespaces.
const prototypeMemberOperations = [
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
] as const

it.effect("assigns a fresh identity to every prototype-member operation on a forked Program branch", () => {
  let operations: ReadonlyArray<string> = ["first"]
  let dispatches = 0
  const fixture = makeFixture(
    "program-branch-prototype",
    () => operations,
    () => {
      dispatches += 1
    },
  )
  return provideScoped(
    fixture.layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* RunExecutor.RunExecutor

      const source = yield* runtime.send({
        to: fixture.address,
        sessionId: "program-branch-prototype",
        idempotencyKey: "program-branch-prototype-source",
        prompt: "run",
      })
      yield* host.execute(
        yield* store.claimExecution({
          commandId: "program-branch-prototype:source-claim",
          runId: source.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect((yield* runtime.inspect(source.runId)).status).toBe("succeeded")

      // The branch replays `first` and adds every prototype-member operation as a fresh name.
      operations = ["first", ...prototypeMemberOperations]
      const branch = yield* runtime.fork(source.runId, {
        commandId: "program-branch-prototype:fork",
        atSequence: lastSequence(yield* runtime.history({ runId: source.runId, limit: 100 })),
        programBudget: {
          agentRuns: 0,
          concurrency: 1,
          toolCalls: 16,
          tokens: 0,
          wallClockMillis: 30_000,
          logBytes: 500,
          outputBytes: 500,
        },
      })
      yield* host.execute(
        yield* store.claimExecution({
          commandId: "program-branch-prototype:branch-claim",
          runId: branch.runId,
          ownerId: objectWorkerId,
        }),
      )

      expect((yield* runtime.inspect(branch.runId)).status).toBe("succeeded")
      const settled = (yield* runtime.history({ runId: branch.runId, limit: 100 })).filter(
        (event) => event._tag === "ProgramOperationSettled",
      )
      expect(settled.map((event) => event.operation)).toEqual([
        "first",
        ...prototypeMemberOperations.map(() => expect.stringMatching(/^b[0-9a-f]{63}$/)),
      ])
      expect(new Set(settled.map((event) => event.operation)).size).toBe(prototypeMemberOperations.length + 1)
      for (const [index, event] of settled.slice(1).entries()) {
        expect(event.status).toBe("succeeded")
        expect(yield* store.getProgramOperation({ runId: branch.runId, operation: event.operation })).toMatchObject({
          authoredOperation: prototypeMemberOperations[index]!,
          status: "succeeded",
        })
      }
      // `first` replays from the source record; every new operation reaches the tool handler again.
      expect(dispatches).toBe(prototypeMemberOperations.length + 1)
    }),
  )
})
