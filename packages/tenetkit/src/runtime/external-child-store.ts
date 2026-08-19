import { Context, Effect } from "effect"
import type { RunNotFound, RunTerminal, RuntimeUnavailable } from "./errors.js"
import type {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  Placement,
  ReserveInput,
} from "./external-child-placement.js"
import type { RunOutcome } from "./run.js"
import type { StaleClaim } from "./sql/errors.js"

/** @experimental Cross-partition child placement operations supported by single-partition stores. */
export interface Interface {
  readonly reserve: (
    input: ReserveInput,
  ) => Effect.Effect<
    Placement,
    | RunNotFound
    | RunTerminal
    | ExternalChildCapacityUnavailable
    | ExternalChildPlacementConflict
    | StaleClaim
    | RuntimeUnavailable
  >
  readonly acknowledge: (
    placementId: string,
  ) => Effect.Effect<Placement, ExternalChildPlacementNotFound | RuntimeUnavailable>
  readonly settle: (input: {
    readonly placementId: string
    readonly settlementId: string
    readonly outcome: RunOutcome
  }) => Effect.Effect<Placement, ExternalChildPlacementNotFound | ExternalChildSettlementConflict | RuntimeUnavailable>
  readonly cancel: (
    placementId: string,
  ) => Effect.Effect<Placement, ExternalChildPlacementNotFound | RuntimeUnavailable>
}

/** @experimental Atomic cross-partition child placement capability. */
export class ExternalChildStore extends Context.Service<ExternalChildStore, Interface>()(
  "tenetkit/runtime/external-child-store/ExternalChildStore",
) {}
