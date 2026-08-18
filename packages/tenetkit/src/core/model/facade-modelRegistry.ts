type ModelRegistryFacade = typeof import("./model-registry.js")
type CoreModelRegistry = import("./model-registry.js").ModelRegistry
type CoreModelRegistryRegistration = import("./model-registry.js").Registration

import {
  classifyFailure as ModelRegistry_classifyFailure,
  toolJsonSchemaCompiler as ModelRegistry_toolJsonSchemaCompiler,
  withToolJsonSchemaCompiler as ModelRegistry_withToolJsonSchemaCompiler,
  withCandidateRoute as ModelRegistry_withCandidateRoute,
  LanguageModelNotRegistered as ModelRegistry_LanguageModelNotRegistered,
  ModelRegistry as ModelRegistry_ModelRegistry,
  registration as ModelRegistry_registration,
  layer as ModelRegistry_layer,
  layerCombined as ModelRegistry_layerCombined,
  layerTest as ModelRegistry_layerTest,
  register as ModelRegistry_register,
  registrations as ModelRegistry_registrations,
  operate as ModelRegistry_operate,
  stream as ModelRegistry_stream,
} from "./model-registry.js"
export const ModelRegistry = {
  classifyFailure: ModelRegistry_classifyFailure,
  toolJsonSchemaCompiler: ModelRegistry_toolJsonSchemaCompiler,
  withToolJsonSchemaCompiler: ModelRegistry_withToolJsonSchemaCompiler,
  withCandidateRoute: ModelRegistry_withCandidateRoute,
  LanguageModelNotRegistered: ModelRegistry_LanguageModelNotRegistered,
  ModelRegistry: ModelRegistry_ModelRegistry,
  registration: ModelRegistry_registration,
  layer: ModelRegistry_layer,
  layerCombined: ModelRegistry_layerCombined,
  layerTest: ModelRegistry_layerTest,
  register: ModelRegistry_register,
  registrations: ModelRegistry_registrations,
  operate: ModelRegistry_operate,
  stream: ModelRegistry_stream,
} as ModelRegistryFacade
export namespace ModelRegistry {
  export type classifyFailure = typeof import("./model-registry.js").classifyFailure
  export type toolJsonSchemaCompiler = typeof import("./model-registry.js").toolJsonSchemaCompiler
  export type withToolJsonSchemaCompiler = typeof import("./model-registry.js").withToolJsonSchemaCompiler
  export type withCandidateRoute = typeof import("./model-registry.js").withCandidateRoute
  export type LanguageModelNotRegistered = import("./model-registry.js").LanguageModelNotRegistered
  export type ModelRegistry = CoreModelRegistry
  export type registration = typeof import("./model-registry.js").registration
  export type layer = typeof import("./model-registry.js").layer
  export type layerCombined = typeof import("./model-registry.js").layerCombined
  export type layerTest = typeof import("./model-registry.js").layerTest
  export type register = typeof import("./model-registry.js").register
  export type registrations = typeof import("./model-registry.js").registrations
  export type operate = typeof import("./model-registry.js").operate
  export type stream = typeof import("./model-registry.js").stream
  export type FailureClassification = import("./model-registry.js").FailureClassification
  export type AvailabilityFailureClassifier = import("./model-registry.js").AvailabilityFailureClassifier
  export type FailureDisposition = import("./model-registry.js").FailureDisposition
  export type CandidateIdentity = import("./model-registry.js").CandidateIdentity
  export type CandidateRoute = import("./model-registry.js").CandidateRoute
  export type CandidateRouteInstrumentation = import("./model-registry.js").CandidateRouteInstrumentation
  export type FailureClassifier = import("./model-registry.js").FailureClassifier
  export type GovernanceOptions = import("./model-registry.js").GovernanceOptions
  export type Interface = import("./model-registry.js").Interface
  export type Metadata = import("./model-registry.js").Metadata
  export type ModelEnvironment = import("./model-registry.js").ModelEnvironment
  export type ModelSelection = import("./model-registry.js").ModelSelection
  export type RegisterInput = import("./model-registry.js").RegisterInput
  export type Registration = CoreModelRegistryRegistration
  export type ToolJsonSchemaCompiler = import("./model-registry.js").ToolJsonSchemaCompiler
}
