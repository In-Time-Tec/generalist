import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ExecutionResolution } from "../../../../src/runtime/execution/resolution/resolve.js"
import { Runtime } from "../../../../src/runtime/engine.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import type { RunFailure } from "../../../../src/runtime/run/event.js"
import { closedTestAgent } from "../../run/identity.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  researcherRef,
  registrationsFor,
  resolverLayer,
} from "../fixtures.js"
import { objectRuntimeLayer } from "../object.js"
import { provideScoped } from "../scoped-provide.js"

it.effect("strictly rejects malformed and forged resolver attestations before returning a resolution", () =>
  provideScoped(
    objectRuntimeLayer({
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
      scheduler: { pollInterval: "1 day" },
    }).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const store = yield* RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "resolution-validation",
        idempotencyKey: "resolution-validation",
        prompt: "validate the attestation",
      })
      const claimed = yield* store.loadExecution(receipt.runId)
      const invalidVersion = { ...assistantRef, manifest: { ...assistantRef.manifest } }
      Object.assign(invalidVersion.manifest, { version: "invalid" })
      const forged = { ...assistantRef, manifest: { ...assistantRef.manifest, root: researcherRef.ref.active } }
      const failures: Array<RunFailure> = []
      const agent = closedTestAgent(assistant)
      for (const attestation of [invalidVersion, forged]) {
        const result = yield* ExecutionResolution.resolve(
          { resolve: () => Effect.succeed({ _tag: "Agent", agent, attestation }) },
          claimed,
          (failure) =>
            Effect.sync(() => {
              failures.push(failure)
            }),
          () => Effect.die("A malformed attestation is not an unknown Agent"),
        )
        expect(result).toBeUndefined()
      }
      expect(failures.map((failure) => failure._tag)).toEqual([
        "generalist/runtime/ExecutableIdentityMismatch",
        "generalist/runtime/ExecutableIdentityMismatch",
      ])
      const valid = yield* ExecutionResolution.resolve(
        { resolve: () => Effect.succeed({ _tag: "Agent", agent, attestation: assistantRef }) },
        claimed,
        () => Effect.die("A valid attestation must resolve"),
        () => Effect.die("A known Agent must resolve"),
      )
      expect(valid?._tag).toBe("Agent")
    }),
  ),
)
