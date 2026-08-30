import { fileURLToPath } from "node:url"

export * as BunKernelPool from "./pool.js"
export * as BunKernelSnapshotStore from "./snapshot-store.js"

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
