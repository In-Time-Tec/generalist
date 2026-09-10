import { setup } from "rivetkit"
import { make as makeCodingAgentActor } from "./actor.js"
import type { CodingAgentConfig } from "./config.js"

export const make = (config: CodingAgentConfig) =>
  setup({
    use: { codingAgent: makeCodingAgentActor(config) },
    namespace: config.rivet.namespace,
    startEngine: config.rivet.startEngine,
    startServices: false,
    envoy: { poolName: config.rivet.poolName },
    shutdown: { disableSignalHandlers: true, gracePeriodMs: 10_000 },
    ...(config.rivet.endpoint === undefined ? undefined : { endpoint: config.rivet.endpoint }),
    ...(config.rivet.token === undefined ? undefined : { token: config.rivet.token }),
  })
