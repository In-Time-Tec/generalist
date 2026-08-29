import {
  ModelMetadataNotFound as Catalog_ModelMetadataNotFound,
  ModelCatalog as Catalog_ModelCatalog,
  bundled as Catalog_bundled,
  layer as Catalog_layer,
  layerTest as Catalog_layerTest,
  lookup as Catalog_lookup,
  require as Catalog_require,
  all as Catalog_all,
} from "./catalog/service.js"

/** @experimental */
export const Catalog = {
  ModelMetadataNotFound: Catalog_ModelMetadataNotFound,
  ModelCatalog: Catalog_ModelCatalog,
  bundled: Catalog_bundled,
  layer: Catalog_layer,
  layerTest: Catalog_layerTest,
  lookup: Catalog_lookup,
  require: Catalog_require,
  all: Catalog_all,
}

/** @experimental */
export namespace Catalog {
  export type ModelMetadataNotFound = import("./catalog/service.js").ModelMetadataNotFound
  export type ModelCatalog = import("./catalog/service.js").ModelCatalog
  export type bundled = typeof import("./catalog/service.js").bundled
  export type layer = typeof import("./catalog/service.js").layer
  export type layerTest = typeof import("./catalog/service.js").layerTest
  export type lookup = typeof import("./catalog/service.js").lookup
  export type require = typeof import("./catalog/service.js").require
  export type all = typeof import("./catalog/service.js").all
  export type Interface = import("./catalog/service.js").Interface
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
  export type DeterministicInput = import("./provider/deterministic.js").DeterministicInput
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
