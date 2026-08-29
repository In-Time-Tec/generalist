import { Effect } from "effect"
import { ExecutableIdentityMismatch } from "../errors.js"
import { verifyAttestation, verifyInput, type Service as ExecutableResolverService } from "../executable/resolver.js"
import { decodePinned, equals } from "../executable/manifest.js"
import type { ExecutionRecord, WorkerMutationError } from "../run/store.js"
import type { RunFailure } from "../run/event.js"

const resolveExecution = (
  resolver: ExecutableResolverService,
  claimed: ExecutionRecord,
  fail: (error: RunFailure) => Effect.Effect<void, WorkerMutationError>,
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
      .pipe(Effect.catch((error) => fail(error).pipe(Effect.as(undefined))))
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
