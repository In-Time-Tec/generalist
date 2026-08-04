import { Runtime } from "../src/index.js"
import { assistant, assistantAddress, assistantRef, researcher, researcherAddress, researcherRef } from "./helpers.js"

export const tempDbPath = (label = "baton-runtime"): string => {
  const dir = `/tmp/${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  Bun.spawnSync(["mkdir", "-p", dir])
  return `${dir}/runtime.sqlite`
}

export const sqliteLayer = (filename: string) =>
  Runtime.layerSqlite({
    filename,
    agents: [
      { ref: assistantRef, agent: assistant },
      { ref: researcherRef, agent: researcher },
    ],
    addresses: [
      { address: assistantAddress, agent: assistantRef },
      { address: researcherAddress, agent: researcherRef },
    ],
    subscriberQueueCapacity: 8,
  })
