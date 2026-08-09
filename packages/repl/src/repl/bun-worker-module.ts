import { fileURLToPath } from "node:url"

const extension = import.meta.url.endsWith(".ts") ? "ts" : "js"

/**
 * @experimental Filesystem path of the kernel worker module, resolved against this module rather
 * than a caller's working directory. A host composing a pool needs a spawnable path to the worker;
 * the worker is not an importable entrypoint, so this is the only supported way to locate it and
 * its layout stays an implementation detail of this package. The worker is emitted beside this
 * module, so it always carries the same extension: compiled in a published build, TypeScript when
 * running against this repository's sources.
 */
export const workerModule: string = fileURLToPath(new URL(`./bun-worker.${extension}`, import.meta.url))
