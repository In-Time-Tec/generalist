import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { Address } from "../../address.js"
import { nameScope, parseAddress, runAddress, AgentName, DirectoryEntry } from "../../execution/agent/directory.js"
import { AddressNotFound, AgentNameConflict, RunNotFound } from "../../errors.js"
import type { RunStatus } from "../../run.js"
import { loadRun } from "./statements.js"

interface NameRow {
  readonly scope: string
  readonly name: string
  readonly run_id: string
}

const entryFor = (input: {
  readonly runId: string
  readonly rootRunId: string
  readonly parentRunId?: string | undefined
  readonly sessionId: string
  readonly status: RunStatus
  readonly name?: AgentName | undefined
}): DirectoryEntry => {
  const entry = {
    address: runAddress(input.runId),
    runId: input.runId,
    rootRunId: input.rootRunId,
    sessionId: input.sessionId,
    status: input.status,
  }
  if (input.parentRunId !== undefined) Object.assign(entry, { parentRunId: input.parentRunId })
  if (input.name !== undefined) Object.assign(entry, { name: input.name })
  return Schema.decodeSync(DirectoryEntry)(entry)
}

const nameOf = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<NameRow>`SELECT * FROM generalist_agent_names WHERE run_id = ${runId}`
    return rows[0] === undefined ? undefined : yield* Schema.decodeEffect(AgentName)(rows[0].name).pipe(Effect.orDie)
  })

const directoryOfRun = (runId: string) =>
  Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined) return undefined
    const name = yield* nameOf(runId)
    return entryFor({
      runId: run.runId,
      rootRunId: run.rootRunId,
      sessionId: run.message.sessionId,
      status: run.status,
      parentRunId: run.parentRunId,
      name,
    })
  })

export const directory = (runId: string) =>
  Effect.gen(function* () {
    const entry = yield* directoryOfRun(runId)
    if (entry === undefined) return yield* RunNotFound.make({ runId })
    return entry
  })

/**
 * Resolve an Address to the Run that currently answers for it.
 *
 * A session address names an agent identity across successive Runs, so it resolves to that
 * session's newest Run. A run address names one exact execution. A name address resolves through
 * the naming scope that owns it. None of these read authority out of the Address text.
 */
export const resolveAddress = (address: Address) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const target = yield* parseAddress(address).pipe(Effect.catch(() => AddressNotFound.make({ address })))
    let runId: string | undefined
    if (target._tag === "Run") runId = target.runId
    else if (target._tag === "Name")
      runId = (yield* sql<NameRow>`
        SELECT * FROM generalist_agent_names WHERE scope = ${target.scope} AND name = ${target.name}
      `)[0]?.run_id
    else
      runId = (yield* sql<{ run_id: string }>`
        SELECT run_id FROM generalist_runs
        WHERE session_id = ${target.sessionId}
        ORDER BY created_at DESC, run_id DESC
        LIMIT 1
      `)[0]?.run_id
    if (runId === undefined) return yield* AddressNotFound.make({ address })
    const entry = yield* directoryOfRun(runId)
    if (entry === undefined) return yield* AddressNotFound.make({ address })
    return entry
  })

export const registerAgentName = (input: { readonly runId: string; readonly name: AgentName }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const scopeInput = { runId: run.runId }
    if (run.parentRunId !== undefined) Object.assign(scopeInput, { parentRunId: run.parentRunId })
    const scope = nameScope(scopeInput)
    const existing = yield* sql<NameRow>`
      SELECT * FROM generalist_agent_names WHERE scope = ${scope} AND name = ${input.name}
    `
    const prior = existing[0]
    if (prior !== undefined && prior.run_id !== input.runId) {
      return yield* AgentNameConflict.make({ scope, name: input.name, existingRunId: prior.run_id })
    }
    if (prior === undefined) {
      yield* sql`INSERT INTO generalist_agent_names (scope, name, run_id) VALUES (${scope}, ${input.name}, ${input.runId})`
    }
    return entryFor({
      runId: run.runId,
      rootRunId: run.rootRunId,
      sessionId: run.message.sessionId,
      status: run.status,
      parentRunId: run.parentRunId,
      name: input.name,
    })
  })

export const listRelated = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const parent = run.parentRunId
    const rows =
      parent === undefined
        ? yield* sql<{ run_id: string }>`SELECT run_id FROM generalist_runs WHERE parent_run_id = ${runId}`
        : yield* sql<{ run_id: string }>`
            SELECT run_id FROM generalist_runs
            WHERE parent_run_id = ${runId} OR run_id = ${parent} OR parent_run_id = ${parent}
          `
    const entries: Array<DirectoryEntry> = []
    for (const row of rows) {
      if (row.run_id === runId) continue
      const entry = yield* directoryOfRun(row.run_id)
      if (entry !== undefined) entries.push(entry)
    }
    return entries
  })
