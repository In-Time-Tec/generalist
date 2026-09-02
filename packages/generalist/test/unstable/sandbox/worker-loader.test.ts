import { layerWorkerLoader } from "../../../src/unstable/sandbox/worker-loader.js"
import { Testing } from "../../../src/testing/index.js"
import { makeVmWorkerLoader } from "../cloudflare/dynamic-workers-vm-loader.js"

Testing.sandbox({
  name: "Worker Loader",
  isolation: "v8-isolate",
  layer: layerWorkerLoader({
    loader: makeVmWorkerLoader(),
    compatibilityDate: "2026-08-19",
    capabilityBinding: (rpc) => rpc,
  }),
})
