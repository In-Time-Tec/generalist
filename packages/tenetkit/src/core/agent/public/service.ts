type AgentFacade = typeof import("../service.js")

import {
  make as Agent_make,
  defaultObjectPrompt as Agent_defaultObjectPrompt,
  stream as Agent_stream,
  generate as Agent_generate,
  Runtime as Agent_Runtime,
  layerRuntime as Agent_layerRuntime,
  ResumeResolution as Agent_ResumeResolution,
  AgentTypeId as Agent_AgentTypeId,
  close as Agent_close,
  withTools as Agent_withTools,
} from "../service.js"
export const Agent = {
  make: Agent_make,
  defaultObjectPrompt: Agent_defaultObjectPrompt,
  stream: Agent_stream,
  generate: Agent_generate,
  Runtime: Agent_Runtime,
  layerRuntime: Agent_layerRuntime,
  ResumeResolution: Agent_ResumeResolution,
  AgentTypeId: Agent_AgentTypeId,
  close: Agent_close,
  withTools: Agent_withTools,
} satisfies AgentFacade
export namespace Agent {
  export type make = typeof import("../service.js").make
  export type defaultObjectPrompt = typeof import("../service.js").defaultObjectPrompt
  export type stream = typeof import("../service.js").stream
  export type generate = typeof import("../service.js").generate
  export type Runtime = import("../service.js").Runtime
  export type layerRuntime = typeof import("../service.js").layerRuntime
  export type close = typeof import("../service.js").close
  export type withTools = typeof import("../service.js").withTools
  export type Any = import("../service.js").Any
  export type Closed = import("../service.js").Closed
  export type ClosedServices<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    R,
  > = import("../service.js").ClosedServices<Tools, R>
  export type Opened<A> = import("../service.js").Opened<A>
  export type Agent<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any> = Record<never, never>,
    R = import("effect/unstable/ai").LanguageModel.LanguageModel,
    PolicyServices = R,
    AuthorizationServices = R,
  > = import("../service.js").Agent<Tools, R, PolicyServices, AuthorizationServices>
  export type HandoffAgent<R> = import("../service.js").HandoffAgent<R>
  export type MakeOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any> = Record<never, never>,
    PolicyServices = never,
    AuthorizationServices = never,
  > = import("../service.js").MakeOptions<Tools, PolicyServices, AuthorizationServices>
  export type MakeToolsOptions<
    StaticTools extends ReadonlyArray<import("effect/unstable/ai").Tool.Any>,
    PolicyServices = never,
    AuthorizationServices = never,
  > = import("../service.js").MakeToolsOptions<StaticTools, PolicyServices, AuthorizationServices>
  export type ObjectResult<A> = import("../service.js").ObjectResult<A>
  export type ProgressOverflowPolicy = import("../service.js").ProgressOverflowPolicy
  export type Requirements<A> = import("../service.js").Requirements<A>
  export type Result = import("../service.js").Result
  export type Resume = import("../service.js").Resume
  export type ResumeResolution = import("../service.js").ResumeResolution
  export type RunError = import("../service.js").RunError
  export type RunOptions = import("../service.js").RunOptions
  export type RunRequirements<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    R,
    O,
  > = import("../service.js").RunRequirements<Tools, R, O>
  export type RunResult<O> = import("../service.js").RunResult<O>
  export type ToolDeclaration = import("../service.js").ToolDeclaration
  export type ToolSchedulingPolicy = import("../service.js").ToolSchedulingPolicy
  export type WithModelDefault = import("../service.js").WithModelDefault
}
