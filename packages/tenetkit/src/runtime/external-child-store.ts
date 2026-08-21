import { Context, Effect, type Option } from "effect"
import type { RunNotFound, RunTerminal, RuntimeUnavailable } from "./errors.js"
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
  ExternalRunRef,
  Placement,
  ReserveInput,
} from "./external-child-placement.js"
import type { RunOutcome } from "./run.js"
import type { AdmitStartInput } from "./run-store.js"
import type { StartError } from "./runtime.js"
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
  /** Admit an independently executable depth-zero root, initially fenced from execution. */
  readonly admitRoot: (input: {
    readonly placementId: string
    readonly parent: ExternalRunRef
    readonly ref: ExternalRunRef
    readonly requestDigest: string
    readonly executableDigest: string
    readonly root: Omit<AdmitStartInput, "runId" | "initialChildren" | "initialFanOuts">
  }) => Effect.Effect<ExternalRoot, ExternalRootConflict | ExternalRootExecutableMismatch | StartError>
  /** Release one admitted root's durable execution gate. Exact retries are no-ops. */
  readonly activateRoot: (placementId: string) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable>
  readonly inspectRoot: (placementId: string) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable>
  /** Request authoritative cancellation on the child partition, including before activation. */
  readonly cancelRoot: (
    placementId: string,
    reason?: string,
  ) => Effect.Effect<ExternalRoot, ExternalRootNotFound | RuntimeUnavailable>
  /** Read the stable terminal delivery. None means the root is not terminal yet. */
  readonly rootSettlement: (
    placementId: string,
  ) => Effect.Effect<Option.Option<ExternalRootSettlement>, ExternalRootNotFound | RuntimeUnavailable>
  /** Acknowledge exactly the terminal identity received by the parent. */
  readonly acknowledgeRootSettlement: (input: {
    readonly placementId: string
    readonly settlementId: string
  }) => Effect.Effect<
    ExternalRootSettlement,
    ExternalRootNotFound | ExternalChildSettlementConflict | RuntimeUnavailable
  >
}

/** @experimental Atomic cross-partition child placement capability. */
export class ExternalChildStore extends Context.Service<ExternalChildStore, Interface>()(
  "tenetkit/runtime/external-child-store/ExternalChildStore",
) {}
