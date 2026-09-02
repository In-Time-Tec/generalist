import { Effect } from "effect"
import { ExecutableIdentityMismatch, UnknownAgent } from "../../errors.js"
import {
  verifyAttestation,
  verifyInput,
  type Input as ResolverInput,
  type Resolution,
  type ResolveError,
} from "../../executable/resolver.js"
import { decodePinned, equals } from "../../executable/manifest-internal.js"
import type { ExecutionRecord, WorkerMutationError } from "../../run/store.js"
import type { RunFailure } from "../../run/event.js"

/** @internal Resolver used after process-local Agent registration is composed with the host resolver. */
export interface Resolver {
  readonly resolve: (
    input: ResolverInput,
  ) => Effect.Effect<Resolution, ResolveError | UnknownAgent, import("effect").Scope.Scope>
}

const resolveExecution = (
  resolver: Resolver,
  claimed: ExecutionRecord,
  fail: (error: RunFailure) => Effect.Effect<void, WorkerMutationError>,
  suspendUnknown: (error: UnknownAgent) => Effect.Effect<void, WorkerMutationError>,
) =>
  Effect.gen(function* () {
    const resolution = yield* resolver
      .resolve(
        verifyInput({
          runId: claimed.runId,
          ref: claimed.executableRef,
          manifest: claimed.executableManifest,
          registrations: claimed.registrations,
        }),
      )
      .pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            error._tag === "generalist/runtime/UnknownAgent"
              ? suspendUnknown(error).pipe(Effect.as(undefined))
              : fail(error).pipe(Effect.as(undefined)),
          onSuccess: Effect.succeed,
        }),
      )
    if (resolution === undefined) return undefined
    const identityMatches = yield* Effect.sync(() => {
      try {
        return equals(
          decodePinned({ ref: claimed.executableRef, manifest: claimed.executableManifest }),
          verifyAttestation(resolution.attestation),
        )
      } catch {
        return false
      }
    })
    if (identityMatches) return resolution
    yield* fail(
      ExecutableIdentityMismatch.make({
        runId: claimed.runId,
        expectedRef: claimed.executableRef,
        actualRef: resolution.attestation.ref,
      }),
    )
    return undefined
  })

export const ExecutionResolution = { resolve: resolveExecution }
