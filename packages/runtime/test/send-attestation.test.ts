import { expect, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { Errors, ExecutableResolver, RunStore, Runtime } from "../src/index.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistant,
  assistantAddress,
  assistantRef,
  registrationsFor,
  textPrompt,
} from "./helpers.js"
import { closedTestAgent } from "./identity.js"
import { tempDbPath } from "./sqlite-helpers.js"

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

it.effect("attests an addressed binding before memory admission", () =>
  Effect.gen(function* () {
    const admissions = yield* Ref.make(0)
    const receipt = yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send(input)
      }).pipe(
        Effect.provide(
          Runtime.layerMemory({
            addresses: [
              { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
            ],
            resolver: staticResolver(admissions),
          }),
        ),
      ),
    )
    expect(receipt.duplicate).toBe(false)
    expect(yield* Ref.get(admissions)).toBe(1)
  }),
)

it.effect("attests an addressed binding before SQLite admission", () =>
  Effect.gen(function* () {
    const admissions = yield* Ref.make(0)
    const receipt = yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send(input)
      }).pipe(
        Effect.provide(
          Runtime.layerSqlite({
            filename: tempDbPath("send-attestation"),
            addresses: [
              { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
            ],
            resolver: staticResolver(admissions),
          }),
        ),
      ),
    )
    expect(receipt.duplicate).toBe(false)
    expect(yield* Ref.get(admissions)).toBe(1)
  }),
)

it.effect("rejects invalid address registrations without admitting a Run", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }).pipe(
      Effect.provide(
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
      ),
    ),
  ),
)

it.effect("rejects missing address registrations without admitting a Run", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableRegistrationMissing)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          addresses: [{ address: assistantAddress, executable: assistantRef, registrations: [] }],
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
        }),
      ),
    ),
  ),
)

it.effect("rejects an unsupported address binding without admitting a Run", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutablePinMissing)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          addresses: [
            { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
          ],
          resolver: ExecutableResolver.ExecutableResolver.of({
            resolve: (resolved) =>
              Effect.fail(Errors.ExecutablePinMissing.make({ runId: resolved.runId, ref: resolved.ref })),
          }),
        }),
      ),
    ),
  ),
)

it.effect("rejects an identity mismatch without admitting a Run", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.send(input).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ExecutableIdentityMismatch)
      expect(yield* store.list({ limit: 10 })).toHaveLength(0)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          addresses: [
            { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
          ],
          resolver: ExecutableResolver.ExecutableResolver.of({
            resolve: () =>
              Effect.succeed({
                _tag: "Agent" as const,
                agent: closedTestAgent(alternateAssistant),
                attestation: { ref: alternateAssistantRef.ref, manifest: alternateAssistantRef.manifest },
              }),
          }),
        }),
      ),
    ),
  ),
)
