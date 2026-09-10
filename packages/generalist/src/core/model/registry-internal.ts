import { Context, Effect, Function, type JsonSchema } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { ModelEnvironment, ModelSelection, Registration } from "./registry.js"
import { classify as classifyContextOverflow } from "./result/context-overflow.js"
import { registerMetadataCopier } from "./service.js"

export interface CandidateIdentity extends ModelSelection {
  readonly candidate: number
}

export type FailureDisposition = "retry" | "fallback" | "terminal"

export interface CandidateRouteInstrumentation {
  readonly instrument: (model: LanguageModel.LanguageModel, identity: CandidateIdentity) => LanguageModel.LanguageModel
  readonly settleFailure: (disposition: FailureDisposition) => Effect.Effect<void>
  readonly fallbackScheduled: (input: {
    readonly from: CandidateIdentity
    readonly to: CandidateIdentity
    readonly error: unknown
  }) => Effect.Effect<void>
}

export type CandidateRoute = (instrumentation: CandidateRouteInstrumentation) => LanguageModel.LanguageModel
export type FailureClassification = "context-overflow" | "other"
export type FailureClassifier = (cause: unknown) => FailureClassification
export type ToolJsonSchemaCompiler = (tool: Tool.Any) => Effect.Effect<JsonSchema.JsonSchema, AiError.AiError>

const failureClassifiers = new WeakMap<LanguageModel.LanguageModel, FailureClassifier>()
const toolJsonSchemaCompilers = new WeakMap<LanguageModel.LanguageModel, ToolJsonSchemaCompiler>()
const candidateRoutes = new WeakMap<LanguageModel.LanguageModel, CandidateRoute>()
const registrationIdentities = new WeakMap<LanguageModel.LanguageModel, ModelSelection>()

registerMetadataCopier((source, target) => {
  const classifier = failureClassifiers.get(source)
  if (classifier !== undefined) failureClassifiers.set(target, classifier)
  const compiler = toolJsonSchemaCompilers.get(source)
  if (compiler !== undefined) toolJsonSchemaCompilers.set(target, compiler)
  const route = candidateRoutes.get(source)
  if (route !== undefined) candidateRoutes.set(target, route)
  const identity = registrationIdentities.get(source)
  if (identity !== undefined) registrationIdentities.set(target, identity)
})

export const classifyFailure: {
  (cause: unknown): (model: LanguageModel.LanguageModel) => FailureClassification
  (model: LanguageModel.LanguageModel, cause: unknown): FailureClassification
} = Function.dual(2, (model: LanguageModel.LanguageModel, cause: unknown): FailureClassification => {
  const classified = failureClassifiers.get(model)?.(cause)
  return classified !== undefined && classified !== "other" ? classified : classifyContextOverflow(cause)
})

export const toolJsonSchemaCompiler = (model: LanguageModel.LanguageModel): ToolJsonSchemaCompiler | undefined =>
  toolJsonSchemaCompilers.get(model)

export const withToolJsonSchemaCompiler: {
  (compiler: ToolJsonSchemaCompiler): (model: LanguageModel.LanguageModel) => LanguageModel.LanguageModel
  (model: LanguageModel.LanguageModel, compiler: ToolJsonSchemaCompiler): LanguageModel.LanguageModel
} = Function.dual(
  2,
  (model: LanguageModel.LanguageModel, compiler: ToolJsonSchemaCompiler): LanguageModel.LanguageModel => {
    const wrapped = { ...model }
    toolJsonSchemaCompilers.set(wrapped, compiler)
    const classifier = failureClassifiers.get(model)
    if (classifier !== undefined) failureClassifiers.set(wrapped, classifier)
    return wrapped
  },
)

export const withCandidateRoute: {
  (route: CandidateRoute): (model: LanguageModel.LanguageModel) => LanguageModel.LanguageModel
  (model: LanguageModel.LanguageModel, route: CandidateRoute): LanguageModel.LanguageModel
} = Function.dual(2, (model: LanguageModel.LanguageModel, route: CandidateRoute): LanguageModel.LanguageModel => {
  const wrapped = { ...model }
  candidateRoutes.set(wrapped, route)
  const classifier = failureClassifiers.get(model)
  if (classifier !== undefined) failureClassifiers.set(wrapped, classifier)
  const compiler = toolJsonSchemaCompilers.get(model)
  if (compiler !== undefined) toolJsonSchemaCompilers.set(wrapped, compiler)
  return wrapped
})

export const candidateRoute = (model: LanguageModel.LanguageModel): CandidateRoute | undefined =>
  candidateRoutes.get(model)

export const attachRegistrationMetadata: {
  (registration: Registration): (context: Context.Context<ModelEnvironment>) => Context.Context<ModelEnvironment>
  (context: Context.Context<ModelEnvironment>, registration: Registration): Context.Context<ModelEnvironment>
} = Function.dual(2, (context: Context.Context<ModelEnvironment>, registration: Registration) => {
  const model = Context.get(context, LanguageModel.LanguageModel)
  const registered = { ...model }
  const identity = Object.assign(
    { provider: registration.provider, model: registration.model },
    registration.registrationKey === undefined ? {} : { registrationKey: registration.registrationKey },
  )
  registrationIdentities.set(registered, identity)
  const classifier = registration.classifyFailure ?? failureClassifiers.get(model)
  if (classifier !== undefined) failureClassifiers.set(registered, classifier)
  const compiler = registration.toolJsonSchemaCompiler ?? toolJsonSchemaCompilers.get(model)
  if (compiler !== undefined) toolJsonSchemaCompilers.set(registered, compiler)
  const route = candidateRoutes.get(model)
  if (route !== undefined) candidateRoutes.set(registered, route)
  return Context.add(context, LanguageModel.LanguageModel, registered)
})

export const registrationIdentity = (model: LanguageModel.LanguageModel): ModelSelection | undefined =>
  registrationIdentities.get(model)
