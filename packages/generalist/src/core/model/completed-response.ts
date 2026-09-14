import { Context } from "effect"
import { LanguageModel, type Toolkit } from "effect/unstable/ai"
import { registerMetadataCopier } from "./service.js"

/** @internal Exact durable assignment supplied around one completed-response invocation. */
export interface Invocation {
  readonly turnId: string
  readonly assignmentId: string
  readonly toolkit: Toolkit.Any
}

/** @internal Invocation authority for models that return only a completed semantic response. */
export const CurrentInvocation: Context.Reference<Invocation | undefined> = Context.Reference<Invocation | undefined>(
  "generalist/core/model/CompletedResponse/CurrentInvocation",
  { defaultValue: () => undefined },
)

const completedResponseModels = new WeakSet<LanguageModel.Service>()
const retryForbiddenFailures = new WeakSet<object>()

registerMetadataCopier((source, target) => {
  if (completedResponseModels.has(source)) completedResponseModels.add(target)
})

/** @internal Mark a model whose semantic authority is its `generateText` response. */
export const mark = (model: LanguageModel.Service): LanguageModel.Service => {
  completedResponseModels.add(model)
  return model
}

/** @internal Whether the model must bypass provisional streaming output. */
export const isCompletedResponseModel = (model: LanguageModel.Service): boolean => completedResponseModels.has(model)

/** @internal Prevent retries when a remote turn may already have produced an outcome. */
export const forbidRetry = <A extends object>(failure: A): A => {
  retryForbiddenFailures.add(failure)
  return failure
}

/** @internal Whether retrying could duplicate an outcome with unknown authority. */
export const isRetryForbidden = (failure: unknown): boolean =>
  typeof failure === "object" && failure !== null && retryForbiddenFailures.has(failure)
