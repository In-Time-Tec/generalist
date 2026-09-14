import { Function } from "effect"
import type { PeerEndpoint } from "./coordination.js"
import type { Service as ExternalChildStoreService } from "./external/store.js"

interface Binding {
  readonly partition: string
  readonly store: ExternalChildStoreService
}

const bindings = new WeakMap<PeerEndpoint, Binding>()

export const make: {
  (partition: string, store: ExternalChildStoreService): PeerEndpoint
  (store: ExternalChildStoreService): (partition: string) => PeerEndpoint
} = Function.dual(2, (partition: string, store: ExternalChildStoreService): PeerEndpoint => {
  // SAFETY: The empty frozen object is branded solely by this module's private WeakMap binding.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const endpoint = Object.freeze({}) as PeerEndpoint
  bindings.set(endpoint, { partition, store })
  return endpoint
})

export const resolve = (endpoint: PeerEndpoint): Binding | undefined => bindings.get(endpoint)
