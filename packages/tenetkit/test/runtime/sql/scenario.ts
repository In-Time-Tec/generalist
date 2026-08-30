import { ExecutableResolver } from "../../../src/runtime/index.js"
import type { MessagingOverrides } from "../messaging/scenario.js"
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
} from "../execution/fixtures.js"
import { closedTestAgent } from "../run/identity.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
let tempPathCounter = 0
export const tempDbPath = (label = "tenetkit-runtime"): string => {
  const dir = `/tmp/${label}-${process.pid.toString(36)}-${(tempPathCounter += 1).toString(36)}`
  Bun.spawnSync(["mkdir", "-p", dir])
  return `${dir}/runtime.sqlite`
}

const options = {
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
} satisfies Omit<SqliteRuntime.Options, "filename">

export const sqliteLayer = (filename: string) => SqliteRuntime.layerSqlite({ filename, ...options })

/** A SQLite Runtime whose scheduler stays asleep while a test owns execution claims directly. */
export const sqliteManualClaimLayer = (filename: string) =>
  SqliteRuntime.layerSqlite({ filename, ...options, scheduler: { pollInterval: "1 hour" } })

/**
 * A SQLite Runtime whose mailbox bounds and messaging policy the test chooses.
 *
 * Bounds and policy are Runtime construction options, so each variant is its own Runtime over its
 * own database file rather than a mutation of a shared one.
 */
export const sqliteMessagingLayer = (label: string) => (overrides: MessagingOverrides) =>
  SqliteRuntime.layerSqlite({ filename: tempDbPath(label), ...options, ...overrides })
