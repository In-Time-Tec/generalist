import {
  InvalidToolCallParameters as ModelToolCallValidation_InvalidToolCallParameters,
  ToolJsonSchemaCompilerMissing as ModelToolCallValidation_ToolJsonSchemaCompilerMissing,
  projectToolkit as ModelToolCallValidation_projectToolkit,
  decodeToolCall as ModelToolCallValidation_decodeToolCall,
  validateDecodedToolCall as ModelToolCallValidation_validateDecodedToolCall,
  wrap as ModelToolCallValidation_wrap,
  prepare as ModelToolCallValidation_prepare,
  isInvalidToolCallParameters as ModelToolCallValidation_isInvalidToolCallParameters,
} from "../tool-call-validation.js"
export const ModelToolCallValidation = {
  InvalidToolCallParameters: ModelToolCallValidation_InvalidToolCallParameters,
  ToolJsonSchemaCompilerMissing: ModelToolCallValidation_ToolJsonSchemaCompilerMissing,
  projectToolkit: ModelToolCallValidation_projectToolkit,
  decodeToolCall: ModelToolCallValidation_decodeToolCall,
  validateDecodedToolCall: ModelToolCallValidation_validateDecodedToolCall,
  wrap: ModelToolCallValidation_wrap,
  prepare: ModelToolCallValidation_prepare,
  isInvalidToolCallParameters: ModelToolCallValidation_isInvalidToolCallParameters,
} satisfies typeof import("../tool-call-validation.js")
export namespace ModelToolCallValidation {
  export type InvalidToolCallParameters = import("../tool-call-validation.js").InvalidToolCallParameters
  export type ToolJsonSchemaCompilerMissing = import("../tool-call-validation.js").ToolJsonSchemaCompilerMissing
  export type projectToolkit = typeof import("../tool-call-validation.js").projectToolkit
  export type decodeToolCall = typeof import("../tool-call-validation.js").decodeToolCall
  export type validateDecodedToolCall = typeof import("../tool-call-validation.js").validateDecodedToolCall
  export type wrap = typeof import("../tool-call-validation.js").wrap
  export type prepare = typeof import("../tool-call-validation.js").prepare
  export type isInvalidToolCallParameters = typeof import("../tool-call-validation.js").isInvalidToolCallParameters
  export type ProjectedToolkit = import("../tool-call-validation.js").ProjectedToolkit
}
