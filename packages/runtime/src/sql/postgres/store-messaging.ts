import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RunFn } from "./store-ops.js"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  registerAgentName,
  resolveAddress,
} from "../store-directory.js"

/** The addressed-messaging half of the Postgres RunStore, kept beside the store it completes. */
export const messagingStoreMethods = (input: {
  readonly run: RunFn
  readonly runNoTxn: RunFn
  readonly lockRun: (runId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
  readonly lockMailbox: (targetSessionId: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
}): Pick<
  RunStoreInterface,
  | "directory"
  | "resolveAddress"
  | "registerAgentName"
  | "listRelated"
  | "admitMessage"
  | "pendingMessages"
  | "deliverPendingMessages"
> => ({
  directory: (runId) => input.runNoTxn(directory(runId)),
  resolveAddress: (address) => input.runNoTxn(resolveAddress(address)),
  registerAgentName: (request) =>
    input.run(input.lockRun(request.runId).pipe(Effect.andThen(registerAgentName(request)))),
  listRelated: (runId) => input.runNoTxn(listRelated(runId)),
  admitMessage: (request) =>
    input.run(input.lockMailbox(request.targetSessionId).pipe(Effect.andThen(admitMessage(request)))),
  pendingMessages: (request) => input.runNoTxn(pendingMessages(request)),
  deliverPendingMessages: (request) =>
    input.run(input.lockRun(request.runId).pipe(Effect.andThen(deliverPendingMessages(request)))),
})
