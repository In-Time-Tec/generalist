import { expect, layer } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { Errors, ExecutableResolver, RunStore, Runtime } from "../../../../../src/runtime/index.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistant,
  assistantAddress,
  assistantRef,
  registrationsFor,
  textPrompt,
} from "../../../execution/fixtures.js"
import { closedTestAgent } from "../../../run/identity.js"
import { tempDbPath } from "../../scenario.js"

import { Runtime as SqliteRuntime } from "../../../../../src/runtime/sqlite-bun.js"
const input = {
  to: assistantAddress,
  sessionId: "send-attestation",
  idempotencyKey: "send-attestation",
  prompt: textPrompt("hello"),
}

const staticResolver = (admissions: Ref.Ref<number>) =>
  ExecutableResolver.ExecutableResolver.of({
    resolve: (resolved) =>
      (resolved.runId === "pending" ? Ref.update(admissions, (count) => count + 1) : Effect.void).pipe(
        Effect.as({
          _tag: "Agent" as const,
          agent: closedTestAgent(assistant),
          attestation: { ref: assistantRef.ref, manifest: assistantRef.manifest },
        }),
      ),
  })

const memoryAdmissions = Ref.makeUnsafe(0)
layer(
  Runtime.layerMemory({
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolver: staticResolver(memoryAdmissions),
  }),
)("attests an addressed binding before memory admission", (it) => {
  it.effect("attests before memory admission", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send(input)
      expect(receipt.duplicate).toBe(false)
      expect(yield* Ref.get(memoryAdmissions)).toBe(1)
    }),
  )
})

const sqliteAdmissions = Ref.makeUnsafe(0)
layer(
  SqliteRuntime.layerSqlite({
    filename: tempDbPath("send-attestation"),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolver: staticResolver(sqliteAdmissions),
  }),
)("attests an addressed binding before SQLite admission", (it) => {
  it.effect("attests before SQLite admission", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send(input)
      expect(receipt.duplicate).toBe(false)
      expect(yield* Ref.get(sqliteAdmissions)).toBe(1)
    }),
  )
})

layer(
  Runtime.layerMemory({
    addresses: [
      {
        address: assistantAddress,
        executable: assistantRef,
        registrations: [{ pin: "capability:invalid", codec: "test", version: "1", payload: {} }],
      },
    ],
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  }),
)("rejects invalid address registrations without admitting a Run", (it) => {
  it.effect("rejects invalid registrations", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }),
  )
})

layer(
  Runtime.layerMemory({
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: [] }],
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
  }),
)("rejects missing address registrations without admitting a Run", (it) => {
  it.effect("rejects missing registrations", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableRegistrationMissing)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }),
  )
})

layer(
  Runtime.layerMemory({
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolver: ExecutableResolver.ExecutableResolver.of({
      resolve: (resolved) =>
        Effect.fail(Errors.ExecutablePinMissing.make({ runId: resolved.runId, ref: resolved.ref })),
    }),
  }),
)("rejects an unsupported address binding without admitting a Run", (it) => {
  it.effect("rejects an unsupported binding", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutablePinMissing)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }),
  )
})

layer(
  Runtime.layerMemory({
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolver: ExecutableResolver.ExecutableResolver.of({
      resolve: () =>
        Effect.succeed({
          _tag: "Agent" as const,
          agent: closedTestAgent(alternateAssistant),
          attestation: { ref: alternateAssistantRef.ref, manifest: alternateAssistantRef.manifest },
        }),
    }),
  }),
)("rejects an identity mismatch without admitting a Run", (it) => {
  it.effect("rejects an identity mismatch", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableIdentityMismatch)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }),
  )
})
