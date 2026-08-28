import {
  asTool as AgentTool_asTool,
  RegistrationError as AgentTool_RegistrationError,
  register as AgentTool_register,
} from "../tool.js"
export const AgentTool = {
  asTool: AgentTool_asTool,
  RegistrationError: AgentTool_RegistrationError,
  register: AgentTool_register,
} satisfies typeof import("../tool.js")
export namespace AgentTool {
  export type asTool = typeof import("../tool.js").asTool
  export type RegistrationError = import("../tool.js").RegistrationError
  export type register = typeof import("../tool.js").register
  export type AgentToolToolkit<
    Name extends string,
    Parameters extends import("effect").Schema.Top,
    Success extends import("effect").Schema.Top,
    R,
  > = import("../tool.js").AgentToolToolkit<Name, Parameters, Success, R>
  export type AsToolOptions<
    Name extends string = string,
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = import("effect").Schema.Top,
  > = import("../tool.js").AsToolOptions<Name, Parameters, Success>
}
