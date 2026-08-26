type ToolExecutorFacade = typeof import("./tool-executor.js")

import {
  CancellationFailure as ToolExecutor_CancellationFailure,
  FrameworkStage as ToolExecutor_FrameworkStage,
  FrameworkFailure as ToolExecutor_FrameworkFailure,
  RemoteRetryMisconfigured as ToolExecutor_RemoteRetryMisconfigured,
  ToolExecutor as ToolExecutor_ToolExecutor,
  executeToolkit as ToolExecutor_executeToolkit,
  layerToolkit as ToolExecutor_layerToolkit,
  route as ToolExecutor_route,
  client as ToolExecutor_client,
  remote as ToolExecutor_remote,
  mcp as ToolExecutor_mcp,
  sandbox as ToolExecutor_sandbox,
  routeToolkit as ToolExecutor_routeToolkit,
  layerRouter as ToolExecutor_layerRouter,
  layerTest as ToolExecutor_layerTest,
} from "./tool-executor.js"
export const ToolExecutor = {
  CancellationFailure: ToolExecutor_CancellationFailure,
  FrameworkStage: ToolExecutor_FrameworkStage,
  FrameworkFailure: ToolExecutor_FrameworkFailure,
  RemoteRetryMisconfigured: ToolExecutor_RemoteRetryMisconfigured,
  ToolExecutor: ToolExecutor_ToolExecutor,
  executeToolkit: ToolExecutor_executeToolkit,
  layerToolkit: ToolExecutor_layerToolkit,
  route: ToolExecutor_route,
  client: ToolExecutor_client,
  remote: ToolExecutor_remote,
  mcp: ToolExecutor_mcp,
  sandbox: ToolExecutor_sandbox,
  routeToolkit: ToolExecutor_routeToolkit,
  layerRouter: ToolExecutor_layerRouter,
  layerTest: ToolExecutor_layerTest,
} as ToolExecutorFacade
export namespace ToolExecutor {
  export type CancellationFailure = import("./tool-executor.js").CancellationFailure
  export type CancellationRequest = import("./tool-executor.js").CancellationRequest
  export type CancellationOutcome = import("./tool-executor.js").CancellationOutcome
  export type TerminalOutcome = import("./tool-executor.js").TerminalOutcome
  export type FrameworkStage = import("./tool-executor.js").FrameworkStage
  export type FrameworkFailure = import("./tool-executor.js").FrameworkFailure
  export type RemoteRetryMisconfigured = import("./tool-executor.js").RemoteRetryMisconfigured
  export type ToolExecutor = import("./tool-executor.js").ToolExecutor
  export type executeToolkit = typeof import("./tool-executor.js").executeToolkit
  export type layerToolkit = typeof import("./tool-executor.js").layerToolkit
  export type route = typeof import("./tool-executor.js").route
  export type client = typeof import("./tool-executor.js").client
  export type remote = typeof import("./tool-executor.js").remote
  export type mcp = typeof import("./tool-executor.js").mcp
  export type sandbox = typeof import("./tool-executor.js").sandbox
  export type routeToolkit = typeof import("./tool-executor.js").routeToolkit
  export type layerRouter = typeof import("./tool-executor.js").layerRouter
  export type layerTest = typeof import("./tool-executor.js").layerTest
  export type DomainFailure = import("./tool-executor.js").DomainFailure
  export type Interface<R = import("./tool-context.js").ToolContext> = import("./tool-executor.js").Interface<R>
  export type Outcome = import("./tool-executor.js").Outcome
  export type ReplayPolicy = import("./tool-executor.js").ReplayPolicy
  export type Route<R = import("./tool-context.js").ToolContext> = import("./tool-placement.js").Route<R>
  export type Request = import("./tool-executor.js").Request
  export type Success = import("./tool-executor.js").Success
  export type Suspend = import("./tool-executor.js").Suspend
  export type ToolkitInput<Tools extends Record<string, import("effect/unstable/ai").Tool.Any>> =
    import("./tool-executor.js").ToolkitInput<Tools>
  export type ClosedToolSet<
    R = unknown,
    T extends import("./tool-result-codec.js").SchemaTool = import("./tool-result-codec.js").SchemaTool,
  > = import("./tool-executor.js").ClosedToolSet<R, T>
}
