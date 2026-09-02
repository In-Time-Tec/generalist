import { Layer } from "effect"
import type { MessagingOverrides } from "../messaging/scenario.js"
import {
  assistantAddress,
  assistantRef,
  researcherAddress,
  researcherRef,
  registrationsFor,
  resolverLayer,
} from "../execution/fixtures.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
let tempPathCounter = 0
export const tempDbPath = (label = "generalist-runtime"): string => {
  const dir = `/tmp/${label}-${process.pid.toString(36)}-${(tempPathCounter += 1).toString(36)}`
  Bun.spawnSync(["mkdir", "-p", dir])
  return `${dir}/runtime.sqlite`
}

const options = {
  addresses: [
    { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
    { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
  ],
  subscriberQueueCapacity: 8,
} satisfies Omit<SqliteRuntime.Options, "filename">

export const sqliteLayer = (filename: string) =>
  SqliteRuntime.layerSqlite({ filename, ...options }).pipe(Layer.provide(resolverLayer))

/** A SQLite Runtime whose scheduler stays asleep while a test owns execution claims directly. */
export const sqliteManualClaimLayer = (filename: string) =>
  SqliteRuntime.layerSqlite({ filename, ...options, scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(resolverLayer),
  )

/**
 * A SQLite Runtime whose messaging policy the test chooses.
 *
 * Each policy variant is its own Runtime over its own database file rather than a mutation of a
 * shared one.
 */
export const sqliteMessagingLayer = (label: string) => (overrides: MessagingOverrides) =>
  SqliteRuntime.layerSqlite({ filename: tempDbPath(label), ...options, ...overrides }).pipe(
    Layer.provide(resolverLayer),
  )
