import {
  ModelMetadataNotFound as ModelCatalog_ModelMetadataNotFound,
  ModelCatalog as ModelCatalog_ModelCatalog,
  bundled as ModelCatalog_bundled,
  layer as ModelCatalog_layer,
  layerTest as ModelCatalog_layerTest,
  lookup as ModelCatalog_lookup,
  require as ModelCatalog_require,
  all as ModelCatalog_all,
} from "./catalog/service.js"

/** @experimental */
export const ModelCatalog = {
  ModelMetadataNotFound: ModelCatalog_ModelMetadataNotFound,
  ModelCatalog: ModelCatalog_ModelCatalog,
  bundled: ModelCatalog_bundled,
  layer: ModelCatalog_layer,
  layerTest: ModelCatalog_layerTest,
  lookup: ModelCatalog_lookup,
  require: ModelCatalog_require,
  all: ModelCatalog_all,
}

/** @experimental */
export namespace ModelCatalog {
  export type ModelMetadataNotFound = import("./catalog/service.js").ModelMetadataNotFound
  export type ModelCatalog = import("./catalog/service.js").ModelCatalog
  export type bundled = typeof import("./catalog/service.js").bundled
  export type layer = typeof import("./catalog/service.js").layer
  export type layerTest = typeof import("./catalog/service.js").layerTest
  export type lookup = typeof import("./catalog/service.js").lookup
  export type require = typeof import("./catalog/service.js").require
  export type all = typeof import("./catalog/service.js").all
  export type Service = import("./catalog/service.js").Service
  export type ModelMetadata = import("./catalog/service.js").ModelMetadata
}

import { registration as Deterministic_registration, layer as Deterministic_layer } from "./provider/deterministic.js"

/** @experimental */
export const Deterministic = {
  registration: Deterministic_registration,
  layer: Deterministic_layer,
}

/** @experimental */
export namespace Deterministic {
  export type registration = typeof import("./provider/deterministic.js").registration
  export type layer = typeof import("./provider/deterministic.js").layer
  export type Options = import("./provider/deterministic.js").Options
}

import {
  AvailabilitySemanticsMissing as ModelRoute_AvailabilitySemanticsMissing,
  make as ModelRoute_make,
} from "./model/route.js"

/** @experimental */
export const ModelRoute = {
  AvailabilitySemanticsMissing: ModelRoute_AvailabilitySemanticsMissing,
  make: ModelRoute_make,
}

/** @experimental */
export namespace ModelRoute {
  export type AvailabilitySemanticsMissing = import("./model/route.js").AvailabilitySemanticsMissing
  export type make = typeof import("./model/route.js").make
  export type Input = import("./model/route.js").Input
  export type Route = import("./model/route.js").Route
}
