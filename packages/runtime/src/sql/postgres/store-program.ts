import { Effect } from "effect"
import { ProgramCapabilities } from "@batonfx/core"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable } from "../../errors.js"
import type { Interface as RunStore } from "../../run-store.js"
import { requireExecutionClaim } from "../store-execution.js"
import {
  loadProgramState,
  getProgramOperation,
  reserveProgramOperation,
  admitProgramAgents,
  commitProgramLog,
  settleProgramOperation,
  suspendProgramOperation,
  startProgramOperation,
} from "../store-program.js"
import type { EventHub } from "../subscribers.js"
import { completeRun, requireRun } from "./pg-helpers.js"
import { suspend } from "./store-suspend.js"
import { admitProgramChild } from "../store-admit.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
type Run = <A, E>(
  effect: Effect.Effect<A, E, SqlR>,
) => Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable>

export const programStoreMethods = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: Run
  readonly runNoTxn: Run
}): Pick<
  RunStore,
  | "reserveProgramOperation"
  | "admitProgramChild"
  | "admitProgramChildAndSuspend"
  | "admitProgramAgents"
  | "settleProgramOperation"
  | "suspendProgramOperation"
  | "startProgramOperation"
  | "loadProgramState"
  | "completeProgram"
  | "getProgramOperation"
  | "commitProgramLog"
> => {
  const fenced = <A, E>(claim: import("../../run-store.js").ExecutionClaim, effect: Effect.Effect<A, E, SqlR>) =>
    input.run(
      input.sql`SELECT run_id FROM baton_runs WHERE run_id = ${claim.runId} FOR UPDATE`.pipe(
        Effect.andThen(requireExecutionClaim(claim)),
        Effect.andThen(effect),
      ),
    )
  return {
    admitProgramChild: (operation) => fenced(operation, admitProgramChild(input.hub, operation)),
    admitProgramChildAndSuspend: (operation) =>
      fenced(operation, admitProgramChild(input.hub, operation).pipe(Effect.tap(() => suspend(input.hub, operation)))),
    reserveProgramOperation: (operation) => fenced(operation, reserveProgramOperation(operation)),
    admitProgramAgents: (operation) => fenced(operation, admitProgramAgents(input.hub, operation, suspend)),
    suspendProgramOperation: (operation) => fenced(operation, suspendProgramOperation(input.hub, operation, suspend)),
    settleProgramOperation: (operation) => fenced(operation, settleProgramOperation(input.hub, operation)),
    startProgramOperation: (operation) => fenced(operation, startProgramOperation(operation)),
    loadProgramState: (runId) => input.runNoTxn(requireRun(runId).pipe(Effect.andThen(loadProgramState(runId)))),
    getProgramOperation: (operation) =>
      input.runNoTxn(requireRun(operation.runId).pipe(Effect.andThen(getProgramOperation(operation)))),
    commitProgramLog: (operation) => fenced(operation, commitProgramLog(input.hub, operation)),
    completeProgram: (operation) =>
      fenced(
        operation,
        Effect.gen(function* () {
          if (operation.outputBytes > operation.outputLimit)
            return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
              dimension: "outputBytes",
              limit: operation.outputLimit,
            })
          const loaded = yield* requireRun(operation.runId)
          yield* completeRun(input.hub, loaded, { _tag: "Program", value: operation.output })
          return { _tag: "Completed" as const }
        }),
      ),
  }
}
