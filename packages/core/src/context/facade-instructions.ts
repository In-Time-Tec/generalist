import {
  Instructions as Instructions_Instructions,
  staticSource as Instructions_staticSource,
  openEpoch as Instructions_openEpoch,
  layer as Instructions_layer,
  layerTest as Instructions_layerTest,
} from "./instructions.js"
export const Instructions = {
  Instructions: Instructions_Instructions,
  staticSource: Instructions_staticSource,
  openEpoch: Instructions_openEpoch,
  layer: Instructions_layer,
  layerTest: Instructions_layerTest,
} as typeof import("./instructions.js")
export namespace Instructions {
  export type Instructions = import("./instructions.js").Instructions
  export type staticSource = typeof import("./instructions.js").staticSource
  export type openEpoch = typeof import("./instructions.js").openEpoch
  export type layer = typeof import("./instructions.js").layer
  export type layerTest = typeof import("./instructions.js").layerTest
  export type ContextSource = import("./instructions.js").ContextSource
  export type Interface = import("./instructions.js").Interface
  export type RenderContext = import("./instructions.js").RenderContext
}
