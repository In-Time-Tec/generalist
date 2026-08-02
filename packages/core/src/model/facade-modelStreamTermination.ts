import {
  EmittedOutput as ModelStreamTermination_EmittedOutput,
  ModelStreamTruncated as ModelStreamTermination_ModelStreamTruncated,
  ModelStreamTimeout as ModelStreamTermination_ModelStreamTimeout,
  isTerminationFailure as ModelStreamTermination_isTerminationFailure,
  isModelStreamTimeout as ModelStreamTermination_isModelStreamTimeout,
  requireTerminal as ModelStreamTermination_requireTerminal,
} from "./model-stream-termination.js"
export const ModelStreamTermination = {
  EmittedOutput: ModelStreamTermination_EmittedOutput,
  ModelStreamTruncated: ModelStreamTermination_ModelStreamTruncated,
  ModelStreamTimeout: ModelStreamTermination_ModelStreamTimeout,
  isTerminationFailure: ModelStreamTermination_isTerminationFailure,
  isModelStreamTimeout: ModelStreamTermination_isModelStreamTimeout,
  requireTerminal: ModelStreamTermination_requireTerminal,
} as typeof import("./model-stream-termination.js")
export namespace ModelStreamTermination {
  export type EmittedOutput = import("./model-stream-termination.js").EmittedOutput
  export type ModelStreamTruncated = import("./model-stream-termination.js").ModelStreamTruncated
  export type ModelStreamTimeout = import("./model-stream-termination.js").ModelStreamTimeout
  export type isTerminationFailure = typeof import("./model-stream-termination.js").isTerminationFailure
  export type isModelStreamTimeout = typeof import("./model-stream-termination.js").isModelStreamTimeout
  export type requireTerminal = typeof import("./model-stream-termination.js").requireTerminal
  export type Origin = import("./model-stream-termination.js").Origin
  export type TerminationFailure = import("./model-stream-termination.js").TerminationFailure
}
