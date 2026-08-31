import { codeExecutorConformance } from "generalist/test"
import { Effect } from "effect"
import { layer } from "@generalist/cloudflare/dynamic-workers"
import { makeVmWorkerLoader } from "./dynamic-workers-vm-loader.js"

const loader = makeVmWorkerLoader()

codeExecutorConformance({
  name: "Cloudflare Dynamic Workers protocol fixture",
  layer: layer({
    loader,
    compatibilityDate: "2026-08-19",
    capabilityBinding: (rpc) => rpc,
  }),
  assertClean: Effect.sync(() => {
    if (loader.activeInvocations() !== 0)
      throw new Error(`${loader.activeInvocations()} Dynamic Worker invocation resources remain active`)
  }),
})
