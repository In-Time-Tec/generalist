import { BunCrypto } from "@effect/platform-bun"
import { Layer } from "effect"
import { adjust as adjustTestClock } from "effect/testing/TestClock"
import { layerMemo } from "../../src/durability/auxiliary.js"
import { ObjectStore } from "../../src/durability/object-store.js"
import { layerMemory } from "../../src/memo.js"
import { Testing } from "../../src/testing/index.js"
import { makeObjectStorage } from "../runtime/execution/object.js"

const memoStorage = makeObjectStorage()
const objectMemoLayer = layerMemo({
  environment: "test",
  tenant: "memo",
  partition: "conformance",
}).pipe(Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, memoStorage.store))))

Testing.memo({ layer: layerMemory(), adjustClock: adjustTestClock("1 hour") })
Testing.memo({ layer: objectMemoLayer, adjustClock: adjustTestClock("1 hour") })
