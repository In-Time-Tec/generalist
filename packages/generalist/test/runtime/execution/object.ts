import { BunCrypto } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { activate as activateRuntime, layer, type Options } from "../../../src/durability/index.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { make, type Client, type Simulator } from "../../../src/testing/durability/index.js"

export type ObjectRuntimeOptions = Pick<Options, "addresses"> & Partial<Omit<Options, "addresses">>

/** Default logical host identity; independent concurrent hosts must choose distinct workerIds. */
export const objectWorkerId = "object-test-worker"

/** A bucket shared only by the fresh hosts which explicitly receive it. */
export const makeObjectStorage = (): Simulator => Effect.runSync(make().pipe(Effect.orDie))

/** Each build gets a new bucket, unless a test explicitly shares persistent storage. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal test fixture constructor has direct-style call sites with distinct options and storage inputs.
export const objectRuntimeLayer = (options: ObjectRuntimeOptions, storage?: Client | Simulator, activateHost = true) =>
  Layer.unwrap(
    Effect.gen(function* () {
      let client: Client
      if (storage === undefined) {
        client = yield* make()
      } else if ("connect" in storage) {
        client = yield* storage.connect
      } else {
        client = storage
      }
      const reconstructed = layer({
        environment: "test",
        tenant: "runtime",
        partition: "conformance",
        schedulerMode: "external",
        ...options,
        workerId: options.workerId ?? objectWorkerId,
      }).pipe(Layer.provide(Layer.merge(Layer.succeed(ObjectStore, client.store), BunCrypto.layer)))
      return activateHost ? Layer.effectDiscard(activateRuntime).pipe(Layer.provideMerge(reconstructed)) : reconstructed
    }),
  )
