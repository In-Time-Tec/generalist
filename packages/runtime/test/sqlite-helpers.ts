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

let tempPathCounter = 0
export const tempDbPath = (label = "baton-runtime"): string => {
  const dir = `/tmp/${label}-${process.pid.toString(36)}-${(tempPathCounter += 1).toString(36)}`
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
