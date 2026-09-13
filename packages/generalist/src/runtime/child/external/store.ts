import { Context, Effect, type Option } from "effect"
import type { DurabilityFailure } from "../../../durability/errors.js"
import type { Exhausted as RunBudgetExhausted } from "../../../core/durable/run-budget.js"
import type {
  ChildDepthExceeded,
  ChildLimitExceeded,
  PayloadTooLarge,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../errors.js"
import type {
  ExternalChildCapacityUnavailable,
  ExternalChildPlacementConflict,
  ExternalChildPlacementNotFound,
  ExternalChildSettlementConflict,
  ExternalRoot,
  ExternalRootConflict,
  ExternalRootExecutableMismatch,
  ExternalRootNotFound,
  ExternalRootSettlement,
  Placement,
  ParentPlacementPageInput,
  ReserveInput,
  RootAdmission,
  PageInput,
  ScopedCancelInput,
  ScopedReserveInput,
} from "./placement.js"
import type { RunOutcome, RunStatus } from "../../run.js"
import type { StartError } from "../../engine.js"
import type { StaleClaim, StaleSessionClaim } from "../../run/ownership-errors.js"

/** One bounded immutable-key scan window; an empty item page may still have a continuation. @experimental */
export interface Page<A> {
  readonly items: ReadonlyArray<A>
  readonly cursor?: string
}

/** The receiver's real Run status paired with its immutable external-root record. */
export interface ExternalRootInspection {
  readonly root: ExternalRoot
  readonly status: RunStatus
}

/** Cross-partition child placement operations supported by single-partition stores. */
export interface Service {
  readonly inspectPlacement: (
    placementId: string,
  ) => Effect.Effect<Placement, ExternalChildPlacementNotFound | RuntimeUnavailable | DurabilityFailure>
  readonly outstandingPlacements: (
    input: PageInput,
  ) => Effect.Effect<Page<Placement>, RuntimeUnavailable | DurabilityFailure>
  readonly outstandingRoots: (
    input: PageInput,
  ) => Effect.Effect<Page<ExternalRoot>, RuntimeUnavailable | DurabilityFailure>
  readonly placementsByParent: (
    input: ParentPlacementPageInput,
  ) => Effect.Effect<Page<Placement>, RuntimeUnavailable | DurabilityFailure>
  readonly reserve: (
    input: ReserveInput,
  ) => Effect.Effect<
    Placement,
    | RunNotFound
    | RunTerminal
    | ExternalChildCapacityUnavailable
    | ExternalChildPlacementConflict
    | StaleClaim
    | StaleSessionClaim
    | PayloadTooLarge
    | RuntimeUnavailable
    | DurabilityFailure
  >
  /** Native fenced reservation which derives parent policy and budget inside the canonical mutation. */
  readonly reserveScoped: (
    input: ScopedReserveInput,
  ) => Effect.Effect<
    Placement,
    | RunNotFound
    | RunTerminal
    | ChildDepthExceeded
    | ChildLimitExceeded
    | RunBudgetExhausted
    | ExternalChildPlacementConflict
    | StaleClaim
    | StaleSessionClaim
    | PayloadTooLarge
    | RuntimeUnavailable
    | DurabilityFailure
  >
  readonly acknowledge: (
    placementId: string,
  ) => Effect.Effect<Placement, ExternalChildPlacementNotFound | RuntimeUnavailable | DurabilityFailure>
  readonly settle: (input: {
    readonly placementId: string
    readonly settlementId: string
    readonly outcome: RunOutcome
    readonly spend?: import("../../../core/durable/run-budget.js").Spend
  }) => Effect.Effect<
    Placement,
    ExternalChildPlacementNotFound | ExternalChildSettlementConflict | RuntimeUnavailable | DurabilityFailure
  >
  readonly cancel: (
    placementId: string,
  ) => Effect.Effect<Placement, ExternalChildPlacementNotFound | RuntimeUnavailable | DurabilityFailure>
  /** Cancel one external child only while its issuing Run and Session claims still own the mutation. */
  readonly cancelScoped: (
    input: ScopedCancelInput,
  ) => Effect.Effect<
    Placement,
    | ExternalChildPlacementNotFound
    | ExternalChildPlacementConflict
    | StaleClaim
    | StaleSessionClaim
    | PayloadTooLarge
    | RuntimeUnavailable
    | DurabilityFailure
  >
  /** Admit an independently executable depth-zero root, initially fenced from execution. */
  readonly admitRoot: (
    input: RootAdmission,
  ) => Effect.Effect<ExternalRoot, ExternalRootConflict | ExternalRootExecutableMismatch | StartError>
  /** Release one admitted root's durable execution gate. Exact retries are no-ops. */
  readonly activateRoot: (
    placementId: string,
  ) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable | DurabilityFailure>
  readonly inspectRoot: (
    placementId: string,
  ) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable | DurabilityFailure>
  /** Read the receiver's actual Run status without deriving it from delivery checkpoints. */
  readonly inspectRootRun: (
    placementId: string,
  ) => Effect.Effect<ExternalRootInspection, ExternalRootNotFound | RuntimeUnavailable | DurabilityFailure>
  /** Request authoritative cancellation on the child partition, including before activation. */
  readonly cancelRoot: (
    placementId: string,
    reason?: string,
  ) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable | DurabilityFailure>
  /** Read the stable terminal delivery. None means the root is not terminal yet. */
  readonly rootSettlement: (
    placementId: string,
  ) => Effect.Effect<
    Option.Option<ExternalRootSettlement>,
    ExternalRootNotFound | RuntimeUnavailable | DurabilityFailure
  >
  /** Acknowledge exactly the terminal identity received by the parent. */
  readonly acknowledgeRootSettlement: (input: {
    readonly placementId: string
    readonly settlementId: string
  }) => Effect.Effect<
    ExternalRootSettlement,
    ExternalRootNotFound | ExternalChildSettlementConflict | RuntimeUnavailable | DurabilityFailure
  >
}

/** Atomic cross-partition child placement capability. */
export class ExternalChildStore extends Context.Service<ExternalChildStore, Service>()(
  "generalist/runtime/child/external/store/ExternalChildStore",
) {}
