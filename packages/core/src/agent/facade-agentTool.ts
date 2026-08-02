import { asTool as AgentTool_asTool } from "./agent-tool.js"
export const AgentTool = {
  asTool: AgentTool_asTool,
} as typeof import("./agent-tool.js")
export namespace AgentTool {
  export type asTool = typeof import("./agent-tool.js").asTool
  export type AgentToolToolkit<
    Name extends string,
    Parameters extends import("effect").Schema.Top,
    Success extends import("effect").Schema.Top,
    R,
  > = import("./agent-tool.js").AgentToolToolkit<Name, Parameters, Success, R>
  export type AsToolOptions<
    Name extends string = string,
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = import("effect").Schema.Top,
  > = import("./agent-tool.js").AsToolOptions<Name, Parameters, Success>
}
