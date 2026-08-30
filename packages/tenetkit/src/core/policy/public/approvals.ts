import {
  Approvals as Approvals_Approvals,
  layerAutoApprove as Approvals_layerAutoApprove,
  layerDenyAll as Approvals_layerDenyAll,
  layerTest as Approvals_layerTest,
} from "../approvals.js"
export const Approvals = {
  Approvals: Approvals_Approvals,
  layerAutoApprove: Approvals_layerAutoApprove,
  layerDenyAll: Approvals_layerDenyAll,
  layerTest: Approvals_layerTest,
}
export namespace Approvals {
  export type Approvals = import("../approvals.js").Approvals
  export type layerAutoApprove = typeof import("../approvals.js").layerAutoApprove
  export type layerDenyAll = typeof import("../approvals.js").layerDenyAll
  export type layerTest = typeof import("../approvals.js").layerTest
  export type Approved = import("../approvals.js").Approved
  export type Denied = import("../approvals.js").Denied
  export type Service = import("../approvals.js").Service
  export type Pending = import("../approvals.js").Pending
  export type Resolution = import("../approvals.js").Resolution
}
