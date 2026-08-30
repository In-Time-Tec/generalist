import {
  ToolContext as ToolContext_ToolContext,
  layerDefault as ToolContext_layerDefault,
  layerTest as ToolContext_layerTest,
} from "../tool-context.js"
export const ToolContext = {
  ToolContext: ToolContext_ToolContext,
  layerDefault: ToolContext_layerDefault,
  layerTest: ToolContext_layerTest,
}
export namespace ToolContext {
  export type ToolContext = import("../tool-context.js").ToolContext
  export type layerDefault = typeof import("../tool-context.js").layerDefault
  export type layerTest = typeof import("../tool-context.js").layerTest
  export type Service = import("../tool-context.js").Service
  export type Progress = import("../tool-context.js").Progress
}
