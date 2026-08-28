import { fileURLToPath } from "node:url"
import {
  type Options as BunKernelPool_Options,
  layer as BunKernelPool_layer,
  make as BunKernelPool_make,
} from "./pool.js"
import {
  type Options as BunKernelStateStore_Options,
  layer as BunKernelStateStore_layer,
  make as BunKernelStateStore_make,
} from "./state-store.js"

const extension = import.meta.url.endsWith(".ts") ? "ts" : "js"

/**
 * @experimental Filesystem path of the kernel worker module a pool spawns. A host passes this as
 * `workerModule` when composing a pool; the worker is not an importable entrypoint, so this is the
 * only supported way to locate it.
 */
export const workerModule: string = fileURLToPath(new URL(`./worker.${extension}`, import.meta.url))

/** @experimental Modules a host relocating `workerModule` must copy beside it by basename. */
export const workerSupportModules: ReadonlyArray<string> = [
  fileURLToPath(new URL(`./command-lines.${extension}`, import.meta.url)),
  fileURLToPath(new URL(`./worker-error.${extension}`, import.meta.url)),
  fileURLToPath(new URL(`./text-result.${extension}`, import.meta.url)),
  fileURLToPath(new URL(`./value.${extension}`, import.meta.url)),
]

/** @experimental The Server-scoped pool of live Bun kernels, one per TenetKit Session. */
export const BunKernelPool = {
  layer: BunKernelPool_layer,
  make: BunKernelPool_make,
}
/** @experimental */
export namespace BunKernelPool {
  export type Options = BunKernelPool_Options
}

/** @experimental Best-effort namespace persistence for Bun kernels on the Effect filesystem. */
export const BunKernelStateStore = {
  layer: BunKernelStateStore_layer,
  make: BunKernelStateStore_make,
}
/** @experimental */
export namespace BunKernelStateStore {
  export type Options = BunKernelStateStore_Options
}
