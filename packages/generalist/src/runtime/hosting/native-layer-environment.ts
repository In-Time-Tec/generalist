import type { Layer } from "effect"

export type NativeLayerEnvironment<Requirements, EnvironmentError> = [Requirements] extends [never]
  ? { readonly environment?: never }
  : { readonly environment: Layer.Layer<Requirements, EnvironmentError, never> }

export type ClosedNativeError<LayerError, EnvironmentError> = LayerError | EnvironmentError
