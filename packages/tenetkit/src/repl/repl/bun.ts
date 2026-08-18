import {
  type Options as BunKernelPool_Options,
  layer as BunKernelPool_layer,
  make as BunKernelPool_make,
} from "./bun-pool.js"
import {
  workerModule as BunKernel_workerModule,
  workerSupportModules as BunKernel_workerSupportModules,
} from "./bun-worker-module.js"
import {
  type Options as BunKernelStateStore_Options,
  layer as BunKernelStateStore_layer,
  make as BunKernelStateStore_make,
} from "./bun-state-store.js"

/**
 * @experimental Filesystem path of the kernel worker module a pool spawns. A host passes this as
 * `workerModule` when composing a pool; the worker is not an importable entrypoint, so this is the
 * only supported way to locate it.
 */
export const workerModule: string = BunKernel_workerModule

/** @experimental Modules a host relocating `workerModule` must copy beside it by basename. */
export const workerSupportModules: ReadonlyArray<string> = BunKernel_workerSupportModules

/** @experimental The Server-scoped pool of live Bun kernels, one per TenetKit Session. */
export const BunKernelPool = {
  layer: BunKernelPool_layer,
  make: BunKernelPool_make,
} as typeof import("./bun-pool.js")
/** @experimental */
export namespace BunKernelPool {
  export type Options = BunKernelPool_Options
}

/** @experimental Best-effort namespace persistence for Bun kernels on the Effect filesystem. */
export const BunKernelStateStore = {
  layer: BunKernelStateStore_layer,
  make: BunKernelStateStore_make,
} as typeof import("./bun-state-store.js")
/** @experimental */
export namespace BunKernelStateStore {
  export type Options = BunKernelStateStore_Options
}
