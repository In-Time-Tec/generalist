import { Effect, Stream } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { CursorExpired } from "tenetkit/runtime/driver/errors"
import type { Interface as RunStoreInterface } from "tenetkit/runtime/driver/run-store"
import { loadRunSnapshot, loadTreeInspection } from "tenetkit/runtime/driver/sql/inspection"
import { sessionRoots } from "tenetkit/runtime/driver/sql/session-lifecycle"
import { loadChildReadiness } from "tenetkit/runtime/driver/sql/store-child-capacity"
import { loadRunWait } from "tenetkit/runtime/driver/sql/store-helpers"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { loadTreeHistory } from "tenetkit/runtime/driver/sql/tree-history"
import { loadEventsAfter, loadRun, requireRun } from "./pg-helpers.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import type { RunFn } from "./store-ops.js"
import type { Run } from "./store-fan-out.js"

export const inspectionStoreMethods = (deps: {
  readonly hub: EventHub
  readonly pg: PgClient.PgClient
  readonly run: Run
  readonly runNoTxn: Run
  readonly runInspection: RunFn
}): Pick<
  RunStoreInterface,
  "inspect" | "snapshot" | "sessionRoots" | "inspectTree" | "history" | "treeHistory" | "treeChanges"
> => ({
  inspect: (runId) =>
    deps.runNoTxn(
      Effect.gen(function* () {
        const loaded = yield* requireRun(runId)
        const wait = yield* loadRunWait(runId, loaded.activeWaitId)
        const childReadiness = yield* loadChildReadiness(runId)
        return {
          runId: loaded.runId,
          status: loaded.status,
          executableRef: loaded.executableRef,
          executableManifest: loaded.executableManifest,
          depth: loaded.depth,
          treePolicy: loaded.treePolicy,
          lastSequence: loaded.lastSequence,
          durability: "durable" as const,
          ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
          ...(childReadiness === undefined ? {} : { childReadiness }),
          ...(wait === undefined ? {} : { wait }),
        }
      }),
    ),
  snapshot: (runId) => deps.runInspection(loadRunSnapshot(runId)),
  sessionRoots: (sessionId) => deps.runNoTxn(sessionRoots(sessionId)),
  inspectTree: (rootRunId) => deps.runInspection(loadTreeInspection(rootRunId)),
  history: (input) =>
    deps.runNoTxn(
      Effect.gen(function* () {
        const loaded = yield* requireRun(input.runId)
        if (input.cursor < -1 || input.cursor > loaded.lastSequence) {
          return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
        }
        return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
      }),
    ),
  treeHistory: (input) => deps.runNoTxn(loadTreeHistory(input)),
  treeChanges: (rootRunId) =>
    deps.hub.subscribeTree({
      rootRunId,
      onSubscribed: deps.pg.listen(NOTIFY_CHANNEL).pipe(
        Stream.runForEach((runId) =>
          deps.runNoTxn(loadRun(String(runId))).pipe(
            Effect.flatMap((loaded) => (loaded?.rootRunId === rootRunId ? deps.hub.wakeTree(rootRunId) : Effect.void)),
            Effect.ignore,
          ),
        ),
        Effect.ignore,
      ),
    }),
})
