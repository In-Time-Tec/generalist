import {
  register as Handoff_register,
  delegateTool as Handoff_delegateTool,
  transferTool as Handoff_transferTool,
  fanOut as Handoff_fanOut,
  supervisor as Handoff_supervisor,
  target as Handoff_target,
  layerCatalog as Handoff_layerCatalog,
  HandoffCatalog as Handoff_Catalog,
  RegistrationError as Handoff_RegistrationError,
  HandoffInput as Handoff_Input,
  HandoffOutput as Handoff_Output,
  defaultContextProjection as Handoff_defaultContextProjection,
  filterContextProjection as Handoff_filterContextProjection,
  HandoffProjectionInvalid as Handoff_ProjectionInvalid,
  HandoffRejected as Handoff_Rejected,
  FanOutUnsatisfied as Handoff_FanOutUnsatisfied,
  HandoffCommit as Handoff_Commit,
  HandoffControlState as Handoff_ControlState,
} from "../handoff.js"
export const Handoff = {
  register: Handoff_register,
  delegateTool: Handoff_delegateTool,
  transferTool: Handoff_transferTool,
  fanOut: Handoff_fanOut,
  supervisor: Handoff_supervisor,
  target: Handoff_target,
  layerCatalog: Handoff_layerCatalog,
  Catalog: Handoff_Catalog,
  RegistrationError: Handoff_RegistrationError,
  Input: Handoff_Input,
  Output: Handoff_Output,
  defaultContextProjection: Handoff_defaultContextProjection,
  filterContextProjection: Handoff_filterContextProjection,
  ProjectionInvalid: Handoff_ProjectionInvalid,
  Rejected: Handoff_Rejected,
  FanOutUnsatisfied: Handoff_FanOutUnsatisfied,
  Commit: Handoff_Commit,
  ControlState: Handoff_ControlState,
}
export namespace Handoff {
  export type register = typeof import("../handoff.js").register
  export type delegateTool = typeof import("../handoff.js").delegateTool
  export type transferTool = typeof import("../handoff.js").transferTool
  export type fanOut = typeof import("../handoff.js").fanOut
  export type supervisor = typeof import("../handoff.js").supervisor
  export type target = typeof import("../handoff.js").target
  export type layerCatalog = typeof import("../handoff.js").layerCatalog
  export type Catalog = typeof import("../handoff.js").HandoffCatalog
  export type Registration = import("../handoff.js").Registration
  export type RegistrationError = import("../handoff.js").RegistrationError
  export type FanOutChild = import("../handoff.js").FanOutChild
  export type FanOutOptions = import("../handoff.js").FanOutOptions
  export type FanOutAllSuccessOptions = import("../handoff.js").FanOutAllSuccessOptions
  export type FanOutCollectOptions = import("../handoff.js").FanOutCollectOptions
  export type FanOutJoin = import("../handoff.js").FanOutJoin
  export type FanOutRemainder = import("../handoff.js").FanOutRemainder
  export type FanOutMemberResult = import("../handoff.js").FanOutMemberResult
  export type FanOutUnsatisfied = import("../handoff.js").FanOutUnsatisfied
  export type Supervisor<R> = import("../handoff.js").Supervisor<R>
  export type SupervisorOptions = import("../handoff.js").SupervisorOptions
  export type Target = import("../handoff.js").HandoffTarget
  export type ToolOptions = import("../handoff.js").HandoffToolOptions
  export type Input = import("../handoff.js").HandoffInput
  export type Output = import("../handoff.js").HandoffOutput
  export type ProjectionInvalid = import("../handoff.js").HandoffProjectionInvalid
  export type Rejected = import("../handoff.js").HandoffRejected
  export type Commit = import("../handoff.js").HandoffCommit
  export type ControlState = import("../handoff.js").HandoffControlState
  export type DelegateOptions<
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = typeof import("effect").Schema.String,
  > = import("../handoff.js").DelegateOptions<Parameters, Success>
}
