import { expect, layer } from "@effect/vitest"
import { Effect, Layer, pipe, Ref } from "effect"
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
import { makeObjectStorage, objectRuntimeLayer } from "../../../execution/object.js"
import { closedTestAgent } from "../../../run/identity.js"

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

const resolverLayer = (resolver: ExecutableResolver.Service) =>
  Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)

const assistantResolverLayer = ExecutableResolver.layerStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
]).pipe(Layer.orDie)

const objectLayerFor = (
  addresses: Parameters<typeof objectRuntimeLayer>[0]["addresses"],
  resolver: Layer.Layer<ExecutableResolver.ExecutableResolver, never, never> = assistantResolverLayer,
) =>
  objectRuntimeLayer({ addresses }, makeObjectStorage()).pipe(Layer.provide(resolver))

const objectAdmissions = Ref.makeUnsafe(0)
layer(
  objectLayerFor(
    [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    pipe(staticResolver(objectAdmissions), resolverLayer),
  ),
)("attests an addressed binding before object admission", (it) => {
  it.effect("attests before object admission", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send(input)
      expect(receipt.duplicate).toBe(false)
      expect(yield* Ref.get(objectAdmissions)).toBe(1)
    }),
  )
})

layer(
  objectLayerFor([
    {
      address: assistantAddress,
      executable: assistantRef,
      registrations: [{ pin: "capability:invalid", codec: "test", version: "1", payload: {} }],
    },
  ]),
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
  objectLayerFor([{ address: assistantAddress, executable: assistantRef, registrations: [] }]),
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
  objectLayerFor(
    [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolverLayer(
      ExecutableResolver.ExecutableResolver.of({
        resolve: (resolved) => Effect.fail(Errors.ExecutablePinMissing.make({ runId: resolved.runId, ref: resolved.ref })),
      }),
    ),
  ),
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
  objectLayerFor(
    [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    resolverLayer(
      ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.succeed({
            _tag: "Agent" as const,
            agent: closedTestAgent(alternateAssistant),
            attestation: { ref: alternateAssistantRef.ref, manifest: alternateAssistantRef.manifest },
          }),
      }),
    ),
  ),
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
