import { ExecutableResolver, Runtime } from "../src/index.js"
import {
  analyst,
  analystRef,
  assistant,
  assistantAddress,
  assistantRef,
  researcher,
  researcherAddress,
  researcherRef,
} from "./helpers.js"

export const tempDbPath = (label = "baton-runtime"): string => {
  const dir = `/tmp/${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  Bun.spawnSync(["mkdir", "-p", dir])
  return `${dir}/runtime.sqlite`
}

export const sqliteLayer = (filename: string) =>
  Runtime.layerSqlite({
    filename,
    resolver: ExecutableResolver.makeStatic([
      { executable: assistantRef, agent: assistant },
      { executable: researcherRef, agent: researcher },
      { executable: analystRef, agent: analyst },
    ]),
    addresses: [
      { address: assistantAddress, executable: assistantRef },
      { address: researcherAddress, executable: researcherRef },
    ],
    subscriberQueueCapacity: 8,
  })
