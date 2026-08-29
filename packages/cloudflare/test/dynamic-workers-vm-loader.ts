/* oxlint-disable anti-slop/no-reflect-apply, anti-slop/no-reflect-get, anti-slop/no-runtime-typeof, effecttsgo/async-function, effecttsgo/global-timers, effecttsgo/new-promise */
import { createContext, SourceTextModule } from "node:vm"
import type { WorkerCode, WorkerLoader } from "@tenetkit/cloudflare/dynamic-workers"

export interface VmWorkerLoader extends WorkerLoader {
  readonly activeInvocations: () => number
}

const moduleName = (specifier: string, referencing: string): string => {
  if (!specifier.startsWith("./")) return specifier
  const parent = referencing.lastIndexOf("/")
  return `${parent === -1 ? "" : referencing.slice(0, parent + 1)}${specifier.slice(2)}`
}

/** Protocol-shaped Worker Loader fixture; it is not evidence of Cloudflare's physical isolate implementation. */
export const makeVmWorkerLoader = (): VmWorkerLoader => {
  let activeInvocations = 0
  return {
    activeInvocations: () => activeInvocations,
    load: (code: WorkerCode) => {
      if (code.globalOutbound !== null) throw new Error("VM Worker Loader fixture requires default-deny networking")
      const timers = new Set<ReturnType<typeof setTimeout>>()
      const context = createContext({
        AbortController,
        atob,
        btoa,
        console,
        crypto,
        Headers,
        queueMicrotask,
        ReadableStream,
        Request,
        Response,
        structuredClone,
        TextDecoder,
        TextEncoder,
        TransformStream,
        URL,
        URLSearchParams,
        clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
          clearTimeout(timer)
          timers.delete(timer)
        },
        fetch: () => Promise.reject(new TypeError("outbound network is disabled")),
        setTimeout: (
          callback: (...arguments_: Array<unknown>) => void,
          milliseconds?: number,
          ...arguments_: unknown[]
        ) => {
          const timer = setTimeout(() => {
            timers.delete(timer)
            callback(...arguments_)
          }, milliseconds)
          timers.add(timer)
          return timer
        },
      })
      const modules = new Map<string, SourceTextModule>()
      const getModule = (name: string): SourceTextModule => {
        const existing = modules.get(name)
        if (existing !== undefined) return existing
        const source = code.modules[name]
        if (source === undefined) throw new Error(`module not found: ${name}`)
        const created = new SourceTextModule(source, { context, identifier: name })
        modules.set(name, created)
        return created
      }
      let initialized: Promise<SourceTextModule> | undefined
      const initialize = async (): Promise<SourceTextModule> => {
        const main = getModule(code.mainModule)
        await main.link((specifier, referencing) => getModule(moduleName(specifier, referencing.identifier)))
        await main.evaluate()
        return main
      }
      const clearInvocation = () => {
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
      }
      return {
        getEntrypoint: () => ({
          fetch: async (request) => {
            activeInvocations += 1
            const aborted = new Promise<never>((_, reject) => {
              request.signal.addEventListener("abort", () => reject(new Error("worker invocation aborted")), {
                once: true,
              })
            })
            try {
              initialized ??= initialize()
              const main = await initialized
              const entrypoint: unknown = Reflect.get(main.namespace, "default")
              if (typeof entrypoint !== "object" || entrypoint === null)
                throw new Error("default Worker entrypoint is missing")
              const fetch: unknown = Reflect.get(entrypoint, "fetch")
              if (typeof fetch !== "function") throw new Error("default Worker fetch entrypoint is missing")
              const response: unknown = await Promise.race([
                Reflect.apply(fetch, entrypoint, [request, code.env]),
                aborted,
              ])
              if (!(response instanceof Response)) throw new Error("default Worker fetch returned an invalid response")
              return response
            } finally {
              clearInvocation()
              activeInvocations -= 1
            }
          },
        }),
      }
    },
  }
}
