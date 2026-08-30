import {
  ApprovalRequirement as NestedOperation_ApprovalRequirement,
  Identity as NestedOperation_Identity,
  NestedOperationDenied as NestedOperation_NestedOperationDenied,
  NestedOperationDivergence as NestedOperation_NestedOperationDivergence,
  NestedOperationSuspended as NestedOperation_NestedOperationSuspended,
  NestedOperationUnknown as NestedOperation_NestedOperationUnknown,
  NestedOperations as NestedOperation_NestedOperations,
  NestedReplayPolicy as NestedOperation_NestedReplayPolicy,
  Progress as NestedOperation_Progress,
  ProgressStatus as NestedOperation_ProgressStatus,
  Render as NestedOperation_Render,
  catchSuspension as NestedOperation_catchSuspension,
  layerDirect as NestedOperation_layerDirect,
  layerTest as NestedOperation_layerTest,
  maxRenderBytes as NestedOperation_maxRenderBytes,
  operationId as NestedOperation_operationId,
  payloadDigest as NestedOperation_payloadDigest,
  progressData as NestedOperation_progressData,
  progressKey as NestedOperation_progressKey,
  run as NestedOperation_run,
} from "../nested-operation.js"

export const NestedOperation = {
  ApprovalRequirement: NestedOperation_ApprovalRequirement,
  Identity: NestedOperation_Identity,
  Denied: NestedOperation_NestedOperationDenied,
  Divergence: NestedOperation_NestedOperationDivergence,
  Suspended: NestedOperation_NestedOperationSuspended,
  Unknown: NestedOperation_NestedOperationUnknown,
  Operations: NestedOperation_NestedOperations,
  ReplayPolicy: NestedOperation_NestedReplayPolicy,
  Progress: NestedOperation_Progress,
  ProgressStatus: NestedOperation_ProgressStatus,
  Render: NestedOperation_Render,
  catchSuspension: NestedOperation_catchSuspension,
  layerDirect: NestedOperation_layerDirect,
  layerTest: NestedOperation_layerTest,
  maxRenderBytes: NestedOperation_maxRenderBytes,
  operationId: NestedOperation_operationId,
  payloadDigest: NestedOperation_payloadDigest,
  progressData: NestedOperation_progressData,
  progressKey: NestedOperation_progressKey,
  run: NestedOperation_run,
}

export namespace NestedOperation {
  export type ApprovalRequirement = import("../nested-operation.js").ApprovalRequirement
  export type Failure = import("../nested-operation.js").Failure
  export type Identity = import("../nested-operation.js").Identity
  export type Service = import("../nested-operation.js").Service
  export type Denied = import("../nested-operation.js").NestedOperationDenied
  export type Divergence = import("../nested-operation.js").NestedOperationDivergence
  export type Suspended = import("../nested-operation.js").NestedOperationSuspended
  export type Unknown = import("../nested-operation.js").NestedOperationUnknown
  export type Operations = import("../nested-operation.js").NestedOperations
  export type ReplayPolicy = import("../nested-operation.js").NestedReplayPolicy
  export type Progress = import("../nested-operation.js").Progress
  export type ProgressStatus = import("../nested-operation.js").ProgressStatus
  export type Render = import("../nested-operation.js").Render
  export type Request<A = unknown> = import("../nested-operation.js").Request<A>
}
