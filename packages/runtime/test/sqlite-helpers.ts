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
  registrationsFor,
} from "./helpers.js"
import { closedTestAgent } from "./identity.js"

export const tempDbPath = (label = "baton-runtime"): string => {
  const dir = `/tmp/${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  Bun.spawnSync(["mkdir", "-p", dir])
  return `${dir}/runtime.sqlite`
}

export const sqliteLayer = (filename: string) =>
  Runtime.layerSqlite({
    filename,
    resolver: ExecutableResolver.makeStatic([
      { executable: assistantRef, agent: closedTestAgent(assistant) },
      { executable: researcherRef, agent: closedTestAgent(researcher) },
      { executable: analystRef, agent: closedTestAgent(analyst) },
    ]),
    addresses: [
      { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
    ],
    subscriberQueueCapacity: 8,
  })
