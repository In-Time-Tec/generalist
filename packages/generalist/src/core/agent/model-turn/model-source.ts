import { type Layer, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { AgentError } from "../event.js"
import type { LanguageModelNotRegistered, ModelRegistry, ModelSelection } from "../../model/registry.js"

/** @internal Exact source that scopes every low-level model operation. */
export type ModelSource =
  | {
      readonly _tag: "Ambient"
      readonly model: LanguageModel.Service
      /** Registry captured at setup so a handoff specialist's declared selection still resolves. */
      readonly registry?: typeof ModelRegistry.Service
    }
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
  onRegistryMissing: (selection: ModelSelection) => AgentError,
): Stream.Stream<A, E | AgentError, R>
function scope<A, E, R>(
  source: ModelSource,
  stream: Stream.Stream<A, E, R | LanguageModel.LanguageModel>,
  selection: ModelSelection | undefined,
  override: Layer.Layer<LanguageModel.LanguageModel> | undefined,
  onMissing: (error: LanguageModelNotRegistered) => AgentError,
  onRegistryMissing: (selection: ModelSelection) => AgentError,
) {
  if (override !== undefined) return stream.pipe(Stream.provide(override))
  const scoped = (registry: typeof ModelRegistry.Service, resolved: ModelSelection) => {
    const isolated = stream.pipe(
      Stream.mapError((error): ModelOperationError<E> => ({ _tag: "ModelOperation", error })),
    )
    return registry
      .stream(resolved, isolated)
      .pipe(Stream.mapError((error) => (error._tag === "ModelOperation" ? error.error : onMissing(error))))
  }
  if (source._tag === "Registry") return scoped(source.registry, selection ?? source.selection)
  if (selection === undefined) {
    return stream.pipe(Stream.provideService(LanguageModel.LanguageModel, source.model))
  }
  return source.registry === undefined ? Stream.fail(onRegistryMissing(selection)) : scoped(source.registry, selection)
}

export const ModelSource = { scope }
