import {
  ModelResilience as ModelResilience_ModelResilience,
  ModelResilienceMisconfigured as ModelResilience_ModelResilienceMisconfigured,
  defaultClassify as ModelResilience_defaultClassify,
  defaultPolicy as ModelResilience_defaultPolicy,
  none as ModelResilience_none,
  validate as ModelResilience_validate,
  make as ModelResilience_make,
  layer as ModelResilience_layer,
  layerTest as ModelResilience_layerTest,
  apply as ModelResilience_apply,
  defaultResolveFailure as ModelResilience_defaultResolveFailure,
} from "./model-resilience.js"
export const ModelResilience = {
  ModelResilience: ModelResilience_ModelResilience,
  ModelResilienceMisconfigured: ModelResilience_ModelResilienceMisconfigured,
  defaultClassify: ModelResilience_defaultClassify,
  defaultPolicy: ModelResilience_defaultPolicy,
  none: ModelResilience_none,
  validate: ModelResilience_validate,
  make: ModelResilience_make,
  layer: ModelResilience_layer,
  layerTest: ModelResilience_layerTest,
  apply: ModelResilience_apply,
  defaultResolveFailure: ModelResilience_defaultResolveFailure,
} as typeof import("./model-resilience.js")
export namespace ModelResilience {
  export type ModelResilience = import("./model-resilience.js").ModelResilience
  export type ModelResilienceMisconfigured = import("./model-resilience.js").ModelResilienceMisconfigured
  export type defaultClassify = typeof import("./model-resilience.js").defaultClassify
  export type defaultPolicy = typeof import("./model-resilience.js").defaultPolicy
  export type none = typeof import("./model-resilience.js").none
  export type validate = typeof import("./model-resilience.js").validate
  export type make = typeof import("./model-resilience.js").make
  export type layer = typeof import("./model-resilience.js").layer
  export type layerTest = typeof import("./model-resilience.js").layerTest
  export type apply = typeof import("./model-resilience.js").apply
  export type defaultResolveFailure = typeof import("./model-resilience.js").defaultResolveFailure
  export type Classification = import("./model-resilience.js").Classification
  export type FailureInput = import("./model-resilience.js").FailureInput
  export type FailureResolver = import("./model-resilience.js").FailureResolver
  export type Interface = import("./model-resilience.js").Interface
}
