import {
  register as Handoff_register,
  delegateTool as Handoff_delegateTool,
  sameRunHandoffTool as Handoff_sameRunHandoffTool,
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
  executeSameRunHandoff as Handoff_executeSameRunHandoff,
  HandoffRejected as Handoff_Rejected,
  FanOutUnsatisfied as Handoff_FanOutUnsatisfied,
} from "./handoff.js"
export const Handoff = {
  register: Handoff_register,
  delegateTool: Handoff_delegateTool,
  sameRunHandoffTool: Handoff_sameRunHandoffTool,
  fanOut: Handoff_fanOut,
  supervisor: Handoff_supervisor,
  target: Handoff_target,
  layerCatalog: Handoff_layerCatalog,
  HandoffCatalog: Handoff_Catalog,
  RegistrationError: Handoff_RegistrationError,
  HandoffInput: Handoff_Input,
  HandoffOutput: Handoff_Output,
  defaultContextProjection: Handoff_defaultContextProjection,
  filterContextProjection: Handoff_filterContextProjection,
  HandoffProjectionInvalid: Handoff_ProjectionInvalid,
  executeSameRunHandoff: Handoff_executeSameRunHandoff,
  HandoffRejected: Handoff_Rejected,
  FanOutUnsatisfied: Handoff_FanOutUnsatisfied,
} as typeof import("./handoff.js")
export namespace Handoff {
  export type register = typeof import("./handoff.js").register
  export type delegateTool = typeof import("./handoff.js").delegateTool
  export type sameRunHandoffTool = typeof import("./handoff.js").sameRunHandoffTool
  export type fanOut = typeof import("./handoff.js").fanOut
  export type supervisor = typeof import("./handoff.js").supervisor
  export type target = typeof import("./handoff.js").target
  export type layerCatalog = typeof import("./handoff.js").layerCatalog
  export type HandoffCatalog = typeof import("./handoff.js").HandoffCatalog
  export type Registration = import("./handoff.js").Registration
  export type RegistrationError = import("./handoff.js").RegistrationError
  export type FanOutChild = import("./handoff.js").FanOutChild
  export type FanOutOptions = import("./handoff.js").FanOutOptions
  export type FanOutAllSuccessOptions = import("./handoff.js").FanOutAllSuccessOptions
  export type FanOutCollectOptions = import("./handoff.js").FanOutCollectOptions
  export type FanOutJoin = import("./handoff.js").FanOutJoin
  export type FanOutRemainder = import("./handoff.js").FanOutRemainder
  export type FanOutMemberResult = import("./handoff.js").FanOutMemberResult
  export type FanOutUnsatisfied = import("./handoff.js").FanOutUnsatisfied
  export type Supervisor<R> = import("./handoff.js").Supervisor<R>
  export type SupervisorOptions = import("./handoff.js").SupervisorOptions
  export type HandoffTarget = import("./handoff.js").HandoffTarget
  export type HandoffToolOptions = import("./handoff.js").HandoffToolOptions
  export type DelegateOptions<
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = typeof import("effect").Schema.String,
  > = import("./handoff.js").DelegateOptions<Parameters, Success>
}
