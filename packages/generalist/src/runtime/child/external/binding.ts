import { Function, type Option } from "effect"
import type { Service as RuntimeService } from "../../service.js"
import type { Service as RoutesService } from "../coordination.js"
import type { Service as ExternalChildStoreService } from "./store.js"

/** @internal Current-host placement authority retained beside the ready Runtime identity. */
export interface RuntimePlacement {
  readonly partition: string
  readonly store: ExternalChildStoreService
  readonly routes: Option.Option<RoutesService>
}

const bindings = new WeakMap<RuntimeService, RuntimePlacement>()

/** @internal Bind the current HOST's local store and authorization policy. */
const bindRuntime = (runtime: RuntimeService, placement: RuntimePlacement): void => {
  bindings.set(runtime, Object.freeze(placement))
}
export const bind: {
  (placement: RuntimePlacement): (runtime: RuntimeService) => void
  (runtime: RuntimeService, placement: RuntimePlacement): void
} = Function.dual(2, bindRuntime)

/** @internal Resolve placement authority from the same ready Runtime issued to execution services. */
export const get = (runtime: RuntimeService): RuntimePlacement | undefined => bindings.get(runtime)
