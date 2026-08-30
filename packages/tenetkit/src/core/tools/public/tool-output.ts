import {
  ToolOutputStore as ToolOutput_ToolOutputStore,
  ToolOutputError as ToolOutput_ToolOutputError,
  layerNoop as ToolOutput_layerNoop,
  layerMemory as ToolOutput_layerMemory,
  layerTest as ToolOutput_layerTest,
  bound as ToolOutput_bound,
} from "../tool-output.js"
export const ToolOutput = {
  Store: ToolOutput_ToolOutputStore,
  Error: ToolOutput_ToolOutputError,
  layerNoop: ToolOutput_layerNoop,
  layerMemory: ToolOutput_layerMemory,
  layerTest: ToolOutput_layerTest,
  bound: ToolOutput_bound,
}
export namespace ToolOutput {
  export type Store = import("../tool-output.js").ToolOutputStore
  export type Error = import("../tool-output.js").ToolOutputError
  export type layerNoop = typeof import("../tool-output.js").layerNoop
  export type layerMemory = typeof import("../tool-output.js").layerMemory
  export type layerTest = typeof import("../tool-output.js").layerTest
  export type bound = typeof import("../tool-output.js").bound
  export type BoundedSuccess = import("../tool-output.js").BoundedSuccess
  export type StoreService = import("../tool-output.js").StoreService
  export type Output = import("../tool-output.js").ToolOutput
}
