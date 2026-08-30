import { type Layer, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { AgentError } from "../event.js"
import type { LanguageModelNotRegistered, ModelRegistry, ModelSelection } from "../../model/registry.js"

/** @internal Exact source that scopes every low-level model operation. */
export type ModelSource =
  | { readonly _tag: "Ambient"; readonly model: LanguageModel.Service }
  | {
      readonly _tag: "Registry"
      readonly selection: ModelSelection
      readonly registry: typeof ModelRegistry.Service
    }

interface ModelOperationError<E> {
  readonly _tag: "ModelOperation"
  readonly error: E
}

function scope<A, E, R>(
  source: ModelSource,
  stream: Stream.Stream<A, E, R | LanguageModel.LanguageModel>,
  selection: ModelSelection | undefined,
  override: Layer.Layer<LanguageModel.LanguageModel> | undefined,
  onMissing: (error: LanguageModelNotRegistered) => AgentError,
): Stream.Stream<A, E | AgentError, R>
function scope<A, E, R>(
  source: ModelSource,
  stream: Stream.Stream<A, E, R | LanguageModel.LanguageModel>,
  selection: ModelSelection | undefined,
  override: Layer.Layer<LanguageModel.LanguageModel> | undefined,
  onMissing: (error: LanguageModelNotRegistered) => AgentError,
) {
  if (override !== undefined) return stream.pipe(Stream.provide(override))
  if (source._tag === "Ambient") {
    return stream.pipe(Stream.provideService(LanguageModel.LanguageModel, source.model))
  }
  const isolated = stream.pipe(Stream.mapError((error): ModelOperationError<E> => ({ _tag: "ModelOperation", error })))
  return source.registry
    .stream(selection ?? source.selection, isolated)
    .pipe(Stream.mapError((error) => (error._tag === "ModelOperation" ? error.error : onMissing(error))))
}

export const ModelSource = { scope }
