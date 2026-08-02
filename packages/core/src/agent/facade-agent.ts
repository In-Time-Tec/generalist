type AgentFacade = typeof import("./agent.js")

import {
  make as Agent_make,
  defaultObjectPrompt as Agent_defaultObjectPrompt,
  stream as Agent_stream,
  generate as Agent_generate,
  Runtime as Agent_Runtime,
  layerRuntime as Agent_layerRuntime,
} from "./agent.js"
export const Agent = {
  make: Agent_make,
  defaultObjectPrompt: Agent_defaultObjectPrompt,
  stream: Agent_stream,
  generate: Agent_generate,
  Runtime: Agent_Runtime,
  layerRuntime: Agent_layerRuntime,
} as AgentFacade
export namespace Agent {
  export type make = typeof import("./agent.js").make
  export type defaultObjectPrompt = typeof import("./agent.js").defaultObjectPrompt
  export type stream = typeof import("./agent.js").stream
  export type generate = typeof import("./agent.js").generate
  export type Runtime = import("./agent.js").Runtime
  export type layerRuntime = typeof import("./agent.js").layerRuntime
  export type Agent<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any> = {},
    R = import("effect/unstable/ai").LanguageModel.LanguageModel,
  > = import("./agent.js").Agent<Tools, R>
  export type HandoffAgent<R> = import("./agent.js").HandoffAgent<R>
  export type MakeOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any> = {},
    PolicyServices = never,
    AuthorizationServices = never,
  > = import("./agent.js").MakeOptions<Tools, PolicyServices, AuthorizationServices>
  export type MakeToolsOptions<
    StaticTools extends ReadonlyArray<import("effect/unstable/ai").Tool.Any>,
    PolicyServices = never,
    AuthorizationServices = never,
  > = import("./agent.js").MakeToolsOptions<StaticTools, PolicyServices, AuthorizationServices>
  export type ObjectResult<A> = import("./agent.js").ObjectResult<A>
  export type ProgressOverflowPolicy = import("./agent.js").ProgressOverflowPolicy
  export type Requirements<A> = import("./agent.js").Requirements<A>
  export type Result = import("./agent.js").Result
  export type Resume = import("./agent.js").Resume
  export type RunError = import("./agent.js").RunError
  export type RunOptions = import("./agent.js").RunOptions
  export type ToolDeclaration = import("./agent.js").ToolDeclaration
  export type ToolExecutionPolicy = import("./agent.js").ToolExecutionPolicy
  export type WithModelDefault = import("./agent.js").WithModelDefault
}
