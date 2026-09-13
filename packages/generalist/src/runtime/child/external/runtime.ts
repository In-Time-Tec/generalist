import type { Option } from "effect"
import type { Service as RuntimeService } from "../../service.js"
import type { PeerRoutesService } from "./reconciliation.js"
import type { Service as ExternalChildStoreService } from "./store.js"

/** @internal Current-HOST placement authority retained beside the ready Runtime identity. */
export interface RuntimePlacement {
  readonly partition: string
  readonly store: ExternalChildStoreService
  readonly routes: Option.Option<PeerRoutesService>
}

const bindings = new WeakMap<RuntimeService, RuntimePlacement>()

/** @internal Bind the current HOST's local store and authorization policy. */
export const bind = (runtime: RuntimeService, placement: RuntimePlacement): void => {
  bindings.set(runtime, Object.freeze(placement))
}

/** @internal Resolve placement authority from the same ready Runtime issued to execution services. */
export const get = (runtime: RuntimeService): RuntimePlacement | undefined => bindings.get(runtime)
