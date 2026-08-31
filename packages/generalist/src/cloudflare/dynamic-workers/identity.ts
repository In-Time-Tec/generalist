import { declareIdentity, type Identity, protocolVersion } from "../../core/program/code-executor.js"

export const identity = (compatibilityDate: string): Identity =>
  declareIdentity({
    provider: "cloudflare",
    implementation: { name: "generalist/cloudflare/dynamic-workers", version: "1" },
    runtime: { name: "cloudflare-workers-compatibility-date", version: compatibilityDate },
    template: { name: "generalist-program-runner", version: protocolVersion },
    physicalIsolation: "worker-isolate",
    persistence: "fresh-per-execution",
    network: {
      posture: "default-deny",
      enforcement: {
        status: "enforced",
        by: "provider",
        mechanism: "WorkerCode.globalOutbound is null",
      },
    },
    limits: {
      deadlineMillis: {
        status: "enforced",
        by: "adapter",
        mechanism: "request AbortSignal, deadline timer, and closed callback fence",
        maximum: 2_147_483_647,
      },
      cpuMillis: {
        status: "enforced",
        by: "provider",
        mechanism: "Dynamic Worker custom cpuMs limit",
        maximum: null,
      },
      subrequests: {
        status: "enforced",
        by: "provider",
        mechanism: "Dynamic Worker custom subrequest limit",
        maximum: null,
      },
      outputBytes: {
        status: "enforced",
        by: "adapter",
        mechanism: "response body is cancelled while streaming past the request byte limit",
        maximum: null,
      },
      filesystem: {
        status: "enforced",
        by: "runtime",
        mechanism: "exact ES module graph has no filesystem binding or host module imports",
      },
      processes: {
        status: "enforced",
        by: "runtime",
        mechanism: "Dynamic Workers expose no host process or process-spawn binding",
      },
    },
    knownLimitations: [
      "Protocol conformance does not prove Cloudflare's physical isolate implementation.",
      "Pinned local workerd cannot prove production CPU or subrequest enforcement; those are provider guarantees.",
    ],
  })
