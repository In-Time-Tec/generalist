import { expect, it } from "@effect/vitest"
import { Context, Layer, Schema } from "effect"
import type { ClosedNativeError, NativeLayerEnvironment } from "generalist/runtime/native-layer-environment"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Value extends true> = Value
type IsAssignable<Source, Target> = Source extends Target ? true : false

class Credentials extends Context.Service<Credentials, { readonly profile: string }>()(
  "generalist/test/runtime/hosting/native-layer-environment.test/Credentials",
) {}

class OtherService extends Context.Service<OtherService, { readonly value: string }>()(
  "generalist/test/runtime/hosting/native-layer-environment.test/OtherService",
) {}

class LayerFailure extends Schema.TaggedError<LayerFailure>()(
  "generalist/test/runtime/hosting/native-layer-environment.test/LayerFailure",
  { service: Schema.String },
) {}

class EnvironmentFailure extends Schema.TaggedError<EnvironmentFailure>()(
  "generalist/test/runtime/hosting/native-layer-environment.test/EnvironmentFailure",
  { profile: Schema.String },
) {}

const credentials = Layer.succeed(Credentials, { profile: "native" })
const wrong = Layer.succeed(OtherService, { value: "wrong" })

const nativeEnvironment: NativeLayerEnvironment<Credentials, never> = { environment: credentials }
const closedEnvironment: NativeLayerEnvironment<never, EnvironmentFailure> = {}

const proofs: ReadonlyArray<true> = [
  true satisfies Assert<Equal<NativeLayerEnvironment<never, EnvironmentFailure>, { readonly environment?: never }>>,
  true satisfies Assert<
    Equal<
      NativeLayerEnvironment<Credentials, EnvironmentFailure>,
      { readonly environment: Layer.Layer<Credentials, EnvironmentFailure, never> }
    >
  >,
  true satisfies Assert<Equal<ClosedNativeError<LayerFailure, EnvironmentFailure>, LayerFailure | EnvironmentFailure>>,
  true satisfies Assert<Equal<IsAssignable<Record<never, never>, NativeLayerEnvironment<Credentials, never>>, false>>,
  true satisfies Assert<
    Equal<IsAssignable<{ readonly environment: typeof wrong }, NativeLayerEnvironment<Credentials, never>>, false>
  >,
  true satisfies Assert<
    Equal<
      IsAssignable<{ readonly environment: typeof credentials }, NativeLayerEnvironment<never, EnvironmentFailure>>,
      false
    >
  >,
]

it("requires exactly the native Layer that closes remaining services", () => {
  expect(nativeEnvironment.environment).toBe(credentials)
  expect(closedEnvironment).toEqual({})
  expect(proofs.every(Boolean)).toBe(true)
})
