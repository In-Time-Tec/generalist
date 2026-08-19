import type { SandboxExecutor } from "tenetkit"

/** @experimental Minimal Worker Loader code contract used by this adapter. */
export interface WorkerCode {
  readonly compatibilityDate: string
  readonly mainModule: string
  readonly modules: Readonly<Record<string, string>>
  readonly globalOutbound: null
  readonly env: Readonly<Record<string, unknown>>
  readonly limits: { readonly cpuMs: number; readonly subrequests: number }
}

/** @experimental Minimal loaded Worker fetch entrypoint. */
export interface Fetcher {
  readonly fetch: (request: Request) => Promise<Response>
}

/** @experimental Minimal Worker Loader stub contract. */
export interface WorkerStub {
  readonly getEntrypoint: () => Fetcher
}

/** @experimental Minimal Worker Loader binding contract. */
export interface WorkerLoader {
  readonly load: (code: WorkerCode) => WorkerStub
}

/** @experimental One multiplexed, request-scoped capability RPC request. */
export interface CapabilityRpcRequest {
  readonly protocolVersion: "1"
  readonly requestId: string
  readonly operation: SandboxExecutor.CapabilityGrant["operation"]
  readonly input: unknown
}

/** @experimental Request-scoped capability RPC implementation. */
export interface CapabilityRpc {
  readonly call: (request: CapabilityRpcRequest) => Promise<unknown>
}

/** @experimental Cloudflare Worker Loader adapter construction options. */
export interface Options {
  readonly loader: WorkerLoader
  readonly compatibilityDate: string
  readonly capabilityBinding: (rpc: CapabilityRpc) => unknown
}
