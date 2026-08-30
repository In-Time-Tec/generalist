import { Effect, Option, Ref, Schema } from "effect"
import type { ExecutionResult } from "../execution/state.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore, WorkerMutationError } from "../run/store.js"
import type { RunFailure } from "../run/event.js"

export type DeferredProgramChildTerminal =
  | { readonly _tag: "Complete"; readonly result: ExecutionResult }
  | { readonly _tag: "Fail"; readonly error: RunFailure }

export const makeDeferredProgramChildTerminal = Ref.make<DeferredProgramChildTerminal | undefined>(undefined)

const ownsProgramChild = (store: RunStore, claimed: ExecutionRecord) => {
  const operation = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.String)(claimed.message.metadata?.programOperation),
  )
  if (claimed.parentRunId === undefined || operation === undefined) return Effect.succeed(false)
  return store
    .getProgramOperation({ runId: claimed.parentRunId, operation })
    .pipe(Effect.map((parent) => parent?.childRunIds.includes(claimed.runId) === true))
}

const commitDeferredProgramChildTerminal = (
  store: RunStore,
  claim: ExecutionClaim,
  terminal: Ref.Ref<DeferredProgramChildTerminal | undefined>,
  fail: (error: RunFailure) => Effect.Effect<void, WorkerMutationError>,
) =>
  Ref.get(terminal).pipe(
    Effect.flatMap((outcome) => {
      if (outcome === undefined) return Effect.void
      if (outcome._tag === "Complete") return store.complete({ ...claim, result: outcome.result }).pipe(Effect.asVoid)
      return fail(outcome.error)
    }),
  )

const makeProgramChildFailure =
  (
    store: RunStore,
    claim: ExecutionClaim,
    deferred: Ref.Ref<DeferredProgramChildTerminal | undefined>,
    isProgramChild: boolean,
  ) =>
  (error: RunFailure) => (isProgramChild ? Ref.set(deferred, { _tag: "Fail", error }) : store.fail({ ...claim, error }))

export const ProgramChildTerminal = {
  owns: ownsProgramChild,
  commit: commitDeferredProgramChildTerminal,
  makeFailure: makeProgramChildFailure,
}
