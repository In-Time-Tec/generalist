import {
  ToolOutputStore as ToolOutput_ToolOutputStore,
  ToolOutputError as ToolOutput_ToolOutputError,
  layerNoop as ToolOutput_layerNoop,
  layerMemory as ToolOutput_layerMemory,
  layerTest as ToolOutput_layerTest,
  bound as ToolOutput_bound,
} from "../tool-output.js"
export const ToolOutput = {
  ToolOutputStore: ToolOutput_ToolOutputStore,
  ToolOutputError: ToolOutput_ToolOutputError,
  layerNoop: ToolOutput_layerNoop,
  layerMemory: ToolOutput_layerMemory,
  layerTest: ToolOutput_layerTest,
  bound: ToolOutput_bound,
}
export namespace ToolOutput {
  export type ToolOutputStore = import("../tool-output.js").ToolOutputStore
  export type ToolOutputError = import("../tool-output.js").ToolOutputError
  export type layerNoop = typeof import("../tool-output.js").layerNoop
  export type layerMemory = typeof import("../tool-output.js").layerMemory
  export type layerTest = typeof import("../tool-output.js").layerTest
  export type bound = typeof import("../tool-output.js").bound
  export type BoundedSuccess = import("../tool-output.js").BoundedSuccess
  export type StoreService = import("../tool-output.js").StoreService
  export type ToolOutput = import("../tool-output.js").ToolOutput
}
