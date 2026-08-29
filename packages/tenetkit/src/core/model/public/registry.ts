type ModelRegistryFacade = typeof import("../registry.js")
type CoreModelRegistry = import("../registry.js").ModelRegistry
type CoreModelRegistryRegistration = import("../registry.js").Registration

import {
  classifyFailure as ModelRegistry_classifyFailure,
  candidateRoute as ModelRegistry_candidateRoute,
  registrationIdentity as ModelRegistry_registrationIdentity,
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
  withModel as ModelRegistry_withModel,
  stream as ModelRegistry_stream,
} from "../registry.js"
export const ModelRegistry = {
  classifyFailure: ModelRegistry_classifyFailure,
  candidateRoute: ModelRegistry_candidateRoute,
  registrationIdentity: ModelRegistry_registrationIdentity,
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
  withModel: ModelRegistry_withModel,
  stream: ModelRegistry_stream,
} satisfies ModelRegistryFacade
export namespace ModelRegistry {
  export type classifyFailure = typeof import("../registry.js").classifyFailure
  export type candidateRoute = typeof import("../registry.js").candidateRoute
  export type registrationIdentity = typeof import("../registry.js").registrationIdentity
  export type toolJsonSchemaCompiler = typeof import("../registry.js").toolJsonSchemaCompiler
  export type withToolJsonSchemaCompiler = typeof import("../registry.js").withToolJsonSchemaCompiler
  export type withCandidateRoute = typeof import("../registry.js").withCandidateRoute
  export type LanguageModelNotRegistered = import("../registry.js").LanguageModelNotRegistered
  export type ModelRegistry = CoreModelRegistry
  export type registration = typeof import("../registry.js").registration
  export type layer = typeof import("../registry.js").layer
  export type layerCombined = typeof import("../registry.js").layerCombined
  export type layerTest = typeof import("../registry.js").layerTest
  export type register = typeof import("../registry.js").register
  export type registrations = typeof import("../registry.js").registrations
  export type withModel = typeof import("../registry.js").withModel
  export type stream = typeof import("../registry.js").stream
  export type FailureClassification = import("../registry.js").FailureClassification
  export type AvailabilityFailureClassifier = import("../registry.js").AvailabilityFailureClassifier
  export type FailureDisposition = import("../registry.js").FailureDisposition
  export type CandidateIdentity = import("../registry.js").CandidateIdentity
  export type CandidateRoute = import("../registry.js").CandidateRoute
  export type CandidateRouteInstrumentation = import("../registry.js").CandidateRouteInstrumentation
  export type FailureClassifier = import("../registry.js").FailureClassifier
  export type GovernanceOptions = import("../registry.js").GovernanceOptions
  export type Service = import("../registry.js").Service
  export type Metadata = import("../registry.js").Metadata
  export type ModelEnvironment = import("../registry.js").ModelEnvironment
  export type ModelSelection = import("../registry.js").ModelSelection
  export type RegisterInput = import("../registry.js").RegisterInput
  export type Registration = CoreModelRegistryRegistration
  export type ToolJsonSchemaCompiler = import("../registry.js").ToolJsonSchemaCompiler
}
