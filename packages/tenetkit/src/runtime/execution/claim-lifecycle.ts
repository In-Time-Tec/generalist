import { Effect } from "effect"
import type { ExecutionClaim, Interface as RunStore } from "../run/store.js"

const releaseAfter = <A, E, R>(
  store: RunStore,
  claim: ExecutionClaim,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => effect.pipe(Effect.ensuring(store.releaseExecution(claim).pipe(Effect.ignore)))

export const ExecutionClaimLifecycle = { releaseAfter }
