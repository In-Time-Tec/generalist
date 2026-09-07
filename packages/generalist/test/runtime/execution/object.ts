import { BunCrypto } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as Durability from "../../../src/durability/index.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { make, type Client, type Simulator } from "../../../src/testing/durability/index.js"

export type ObjectRuntimeOptions = Pick<Durability.Options, "addresses"> & Partial<Omit<Durability.Options, "addresses">>

/** Default logical host identity; independent concurrent hosts must choose distinct workerIds. */
export const objectWorkerId = "object-test-worker"

/** A bucket shared only by the fresh hosts which explicitly receive it. */
export const makeObjectStorage = (): Simulator => Effect.runSync(make().pipe(Effect.orDie))

/** Each build gets a new bucket, unless a test explicitly shares persistent storage. */
export const objectRuntimeLayer = (
  options: ObjectRuntimeOptions,
  storage?: Client | Simulator,
  activate = true,
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const client = storage === undefined ? yield* make() : "connect" in storage ? yield* storage.connect : storage
      const reconstructed = Durability.layer({
        environment: "test",
        tenant: "runtime",
        partition: "conformance",
        schedulerMode: "external",
        ...options,
        workerId: options.workerId ?? objectWorkerId,
      }).pipe(Layer.provide(Layer.merge(Layer.succeed(ObjectStore, client.store), BunCrypto.layer)))
      return activate
        ? Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(reconstructed))
        : reconstructed
    }),
  )
