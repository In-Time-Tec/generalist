import type { DriverCheckpoint } from "../../../durable/driver/contract.js"
import type { ExecutableManifest, ExecutableRef } from "../../../durable/manifest/executable-manifest.js"
import type { RunOptions } from "../../service.js"

/** @internal Host-restored continuation state for one durable Agent execution. */
export interface HostedRunState {
  readonly initialSteering?: { readonly queue: "steering" | "followUp"; readonly count: number; readonly turn: number }
  readonly driverCheckpoint?: DriverCheckpoint
  readonly executableRef?: ExecutableRef
  readonly executableManifest?: ExecutableManifest
}

type IncludesHostedRunState<O extends object> = O extends unknown
  ? Extract<keyof O, keyof HostedRunState> extends never
    ? false
    : true
  : never

/** @internal Reject host-restoration state at public Agent entrypoints. */
export type PublicRunOptionGuard<O extends object> =
  true extends IncludesHostedRunState<O> ? [hostRestorationStateIsInternal: never] : []

/** @internal Discard host-restoration state injected across a public boundary. */
export const projectPublicRunOptions = <O extends object>(options: O): O => {
  const publicOptions = { ...options }
  Reflect.deleteProperty(publicOptions, "initialSteering")
  Reflect.deleteProperty(publicOptions, "driverCheckpoint")
  Reflect.deleteProperty(publicOptions, "executableRef")
  Reflect.deleteProperty(publicOptions, "executableManifest")
  return publicOptions
}

/** @internal Options accepted only by the hosted Agent execution path. */
export type HostedRunOptions = RunOptions & HostedRunState

/** @internal Durable host options exclude process-local memory and steering configuration. */
export type HostedExecutionOptions = Omit<HostedRunOptions, "memory" | "steering">
