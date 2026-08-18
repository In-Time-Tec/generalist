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
} from "./model/test-model.js"
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
} as typeof import("./model/test-model.js")
export namespace TestModel {
  export type text = typeof import("./model/test-model.js").text
  export type reasoning = typeof import("./model/test-model.js").reasoning
  export type toolCall = typeof import("./model/test-model.js").toolCall
  export type turn = typeof import("./model/test-model.js").turn
  export type truncated = typeof import("./model/test-model.js").truncated
  export type failure = typeof import("./model/test-model.js").failure
  export type make = typeof import("./model/test-model.js").make
  export type layer = typeof import("./model/test-model.js").layer
  export type layerRegistry = typeof import("./model/test-model.js").layerRegistry
  export type FailureStep = import("./model/test-model.js").FailureStep
  export type Fixture = import("./model/test-model.js").Fixture
  export type MakeOptions = import("./model/test-model.js").MakeOptions
  export type ObjectStep = import("./model/test-model.js").ObjectStep
  export type Operation = import("./model/test-model.js").Operation
  export type Part = import("./model/test-model.js").Part
  export type ReasoningPart = import("./model/test-model.js").ReasoningPart
  export type Request = import("./model/test-model.js").Request
  export type Step = import("./model/test-model.js").Step
  export type StepOptions = import("./model/test-model.js").StepOptions
  export type TextPart = import("./model/test-model.js").TextPart
  export type ToolCallOptions = import("./model/test-model.js").ToolCallOptions
  export type ToolCallPart = import("./model/test-model.js").ToolCallPart
  export type TruncatedStep = import("./model/test-model.js").TruncatedStep
  export type TruncationPoint = import("./model/test-model.js").TruncationPoint
  export type TurnStep = import("./model/test-model.js").TurnStep
}
