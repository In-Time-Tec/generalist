import {
  register as Handoff_register,
  transferTool as Handoff_transferTool,
  fanOut as Handoff_fanOut,
  supervisor as Handoff_supervisor,
  RegistrationError as Handoff_RegistrationError,
} from "./handoff.js"
export const Handoff = {
  register: Handoff_register,
  transferTool: Handoff_transferTool,
  fanOut: Handoff_fanOut,
  supervisor: Handoff_supervisor,
  RegistrationError: Handoff_RegistrationError,
} as typeof import("./handoff.js")
export namespace Handoff {
  export type register = typeof import("./handoff.js").register
  export type transferTool = typeof import("./handoff.js").transferTool
  export type fanOut = typeof import("./handoff.js").fanOut
  export type supervisor = typeof import("./handoff.js").supervisor
  export type Registration = import("./handoff.js").Registration
  export type RegistrationError = import("./handoff.js").RegistrationError
  export type FanOutChild = import("./handoff.js").FanOutChild
  export type FanOutOptions = import("./handoff.js").FanOutOptions
  export type Supervisor<R> = import("./handoff.js").Supervisor<R>
  export type SupervisorOptions = import("./handoff.js").SupervisorOptions
  export type TransferOptions<
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = typeof import("effect").Schema.String,
  > = import("./handoff.js").TransferOptions<Parameters, Success>
}
