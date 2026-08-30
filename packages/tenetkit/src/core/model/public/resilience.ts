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
} from "../resilience.js"
export const ModelResilience = {
  Policy: ModelResilience_ModelResilience,
  Misconfigured: ModelResilience_ModelResilienceMisconfigured,
  defaultClassify: ModelResilience_defaultClassify,
  defaultPolicy: ModelResilience_defaultPolicy,
  none: ModelResilience_none,
  validate: ModelResilience_validate,
  make: ModelResilience_make,
  layer: ModelResilience_layer,
  layerTest: ModelResilience_layerTest,
  apply: ModelResilience_apply,
  defaultResolveFailure: ModelResilience_defaultResolveFailure,
}
export namespace ModelResilience {
  export type Policy = import("../resilience.js").ModelResilience
  export type Misconfigured = import("../resilience.js").ModelResilienceMisconfigured
  export type defaultClassify = typeof import("../resilience.js").defaultClassify
  export type defaultPolicy = typeof import("../resilience.js").defaultPolicy
  export type none = typeof import("../resilience.js").none
  export type validate = typeof import("../resilience.js").validate
  export type make = typeof import("../resilience.js").make
  export type layer = typeof import("../resilience.js").layer
  export type layerTest = typeof import("../resilience.js").layerTest
  export type apply = typeof import("../resilience.js").apply
  export type defaultResolveFailure = typeof import("../resilience.js").defaultResolveFailure
  export type Classification = import("../resilience.js").Classification
  export type FailureInput = import("../resilience.js").FailureInput
  export type FailureResolver = import("../resilience.js").FailureResolver
  export type Service = import("../resilience.js").Service
}
