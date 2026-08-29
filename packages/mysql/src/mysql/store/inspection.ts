import { Effect } from "effect"
import { CursorExpired, RunNotFound } from "tenetkit/runtime/driver/errors"
import type { Service as RunStoreService } from "tenetkit/runtime/driver/run/store"
import { loadRunSnapshot, loadTreeCheckpoint } from "tenetkit/runtime/driver/sql/inspection/service"
import { sessionRoots } from "tenetkit/runtime/driver/sql/session/lifecycle"
import { loadChildReadiness } from "tenetkit/runtime/driver/sql/store/child/capacity"
import { loadEventsAfter, loadRun, loadRunWait } from "tenetkit/runtime/driver/sql/store/statements"
import { listRuns } from "tenetkit/runtime/driver/sql/store/list"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { loadTreeReplay } from "tenetkit/runtime/driver/sql/tree-replay"
import type { RunFn } from "../transaction/events.js"

export const inspectionStoreMethods = (deps: {
  readonly hub: EventHub
  readonly runNoTxn: RunFn
  readonly runInspection: RunFn
}): Pick<
  RunStoreService,
  "inspect" | "snapshot" | "sessionRoots" | "treeCheckpoint" | "history" | "treeReplay" | "treeChanges" | "list"
> => ({
  inspect: (runId) =>
    deps.runNoTxn(
      Effect.gen(function* () {
        const loaded = yield* loadRun(runId)
        if (loaded === undefined) return yield* RunNotFound.make({ runId })
        const activeWait = yield* loadRunWait(runId, loaded.activeWaitId)
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
          ...(loaded.parentRunId === undefined ? undefined : { parentRunId: loaded.parentRunId }),
          ...(childReadiness === undefined ? undefined : { childReadiness }),
          ...(activeWait === undefined ? undefined : { wait: activeWait }),
        }
      }),
    ),
  snapshot: (runId) => deps.runInspection(loadRunSnapshot(runId)),
  sessionRoots: (sessionId) => deps.runNoTxn(sessionRoots(sessionId)),
  treeCheckpoint: (rootRunId) => deps.runInspection(loadTreeCheckpoint(rootRunId)),
  history: (input) =>
    deps.runNoTxn(
      Effect.gen(function* () {
        const loaded = yield* loadRun(input.runId)
        if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
        if (input.cursor < -1 || input.cursor > loaded.lastSequence)
          return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
        return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
      }),
    ),
  treeReplay: (input) => deps.runNoTxn(loadTreeReplay(input)),
  treeChanges: (rootRunId) => deps.hub.subscribeTree({ rootRunId }),
  list: (input) => deps.runNoTxn(listRuns(input)),
})
