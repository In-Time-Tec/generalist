import {
  Instructions as Instructions_Instructions,
  fromText as Instructions_fromText,
  render as Instructions_render,
  layer as Instructions_layer,
  layerTest as Instructions_layerTest,
} from "../instructions.js"
export const Instructions = {
  Instructions: Instructions_Instructions,
  fromText: Instructions_fromText,
  render: Instructions_render,
  layer: Instructions_layer,
  layerTest: Instructions_layerTest,
}
export namespace Instructions {
  export type Instructions = import("../instructions.js").Instructions
  export type fromText = typeof import("../instructions.js").fromText
  export type render = typeof import("../instructions.js").render
  export type layer = typeof import("../instructions.js").layer
  export type layerTest = typeof import("../instructions.js").layerTest
  export type Provider = import("../instructions.js").Provider
  export type Service = import("../instructions.js").Service
  export type RenderContext = import("../instructions.js").RenderContext
}
