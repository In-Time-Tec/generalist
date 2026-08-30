/** @experimental */
import {
  text as TestModel_text,
  reasoning as TestModel_reasoning,
  toolCall as TestModel_toolCall,
  turn as TestModel_turn,
  truncated as TestModel_truncated,
  object as TestModel_object,
  failure as TestModel_failure,
  make as TestModel_make,
  layer as TestModel_layer,
  layerRegistry as TestModel_layerRegistry,
} from "./model/service.js"
export const TestModel = {
  text: TestModel_text,
  reasoning: TestModel_reasoning,
  toolCall: TestModel_toolCall,
  turn: TestModel_turn,
  truncated: TestModel_truncated,
  object: TestModel_object,
  failure: TestModel_failure,
  make: TestModel_make,
  layer: TestModel_layer,
  layerRegistry: TestModel_layerRegistry,
}
export namespace TestModel {
  export type text = typeof import("./model/service.js").text
  export type reasoning = typeof import("./model/service.js").reasoning
  export type toolCall = typeof import("./model/service.js").toolCall
  export type turn = typeof import("./model/service.js").turn
  export type truncated = typeof import("./model/service.js").truncated
  export type failure = typeof import("./model/service.js").failure
  export type make = typeof import("./model/service.js").make
  export type layer = typeof import("./model/service.js").layer
  export type layerRegistry = typeof import("./model/service.js").layerRegistry
  export type FailureStep = import("./model/service.js").FailureStep
  export type Fixture = import("./model/service.js").Fixture
  export type MakeOptions = import("./model/service.js").MakeOptions
  export type ObjectStep = import("./model/service.js").ObjectStep
  export type Operation = import("./model/service.js").Operation
  export type Part = import("./model/service.js").Part
  export type ReasoningPart = import("./model/service.js").ReasoningPart
  export type Request = import("./model/service.js").Request
  export type Step = import("./model/service.js").Step
  export type StepOptions = import("./model/service.js").StepOptions
  export type TextPart = import("./model/service.js").TextPart
  export type ToolCallOptions = import("./model/service.js").ToolCallOptions
  export type ToolCallPart = import("./model/service.js").ToolCallPart
  export type TruncatedStep = import("./model/service.js").TruncatedStep
  export type TruncationPoint = import("./model/service.js").TruncationPoint
  export type TurnStep = import("./model/service.js").TurnStep
}

export { codeExecutorConformance } from "./code-executor.js"
export type { Options as CodeExecutorConformanceOptions } from "./code-executor.js"

/** @experimental Reusable KernelPool provider lifecycle and remote ownership conformance. */
export * as KernelProviderConformance from "./repl/kernel-provider.js"
