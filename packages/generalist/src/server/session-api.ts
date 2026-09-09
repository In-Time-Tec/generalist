import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { QueueReceipt } from "../runtime/session/queue.js"
import { SessionFamilyInput, SessionFamilyPage } from "../runtime/session/retained.js"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { HostSession, HostSessionSnapshot } from "../runtime/session/host.js"
import {
  SessionHistoryInput,
  SessionHistoryPage,
  SessionRunsInput,
  SessionRunsPage,
  SessionRunSummary,
} from "../runtime/session/page.js"
import { ConversationEntry } from "../runtime/session/conversation.js"
import { apiErrors } from "./errors.js"

const createSession = HttpApiEndpoint.post("create", "/sessions", {
  payload: Schema.Struct({
    id: Schema.optionalKey(Schema.String),
    title: Schema.optionalKey(Schema.String),
    agent: Schema.optionalKey(Schema.String),
  }),
  success: HostSession,
  error: apiErrors,
})
const getSession = HttpApiEndpoint.get("get", "/sessions/:id", {
  params: { id: Schema.String },
  success: HostSession,
  error: apiErrors,
})
const listSessions = HttpApiEndpoint.get("list", "/sessions", {
  success: Schema.Array(HostSession),
  error: apiErrors,
})
const snapshotSession = HttpApiEndpoint.get("snapshot", "/sessions/:id/snapshot", {
  params: { id: Schema.String },
  success: HostSessionSnapshot,
  error: apiErrors,
})
const historySession = HttpApiEndpoint.post("history", "/sessions/:id/history", {
  params: { id: Schema.String },
  payload: SessionHistoryInput,
  success: SessionHistoryPage,
  error: apiErrors,
})
const pageSessionRuns = HttpApiEndpoint.post("runs", "/sessions/:id/runs/page", {
  params: { id: Schema.String },
  payload: SessionRunsInput,
  success: SessionRunsPage,
  error: apiErrors,
})
const entrySession = HttpApiEndpoint.get("entry", "/sessions/:id/entries/:entryId", {
  params: { id: Schema.String, entryId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)) },
  success: ConversationEntry,
  error: apiErrors,
})
const runSession = HttpApiEndpoint.get("run", "/sessions/:id/runs/:runId", {
  params: { id: Schema.String, runId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)) },
  success: SessionRunSummary,
  error: apiErrors,
})
const familySession = HttpApiEndpoint.post("family", "/sessions/:id/family", {
  params: { id: Schema.String },
  payload: SessionFamilyInput,
  success: SessionFamilyPage,
  error: apiErrors,
})
const controlSession = HttpApiEndpoint.post("control", "/sessions/:id/control", {
  params: { id: Schema.String },
  payload: Schema.Struct({
    commandId: Schema.String.check(Schema.isNonEmpty()),
    action: Schema.Literals(["stop", "close", "resume"]),
  }),
  error: apiErrors,
})
const queueCommand = { commandId: Schema.String.check(Schema.isNonEmpty()) }
const queueErrors: Schema.Codec<(typeof apiErrors)[number]["Type"], unknown> = Schema.Union(apiErrors)
const queueRevision = { ...queueCommand, expectedRevision: Schema.Int.check(Schema.isGreaterThan(0)) }
const submitSession = HttpApiEndpoint.post("submit", "/sessions/:id/queue", {
  params: { id: Schema.String },
  payload: Schema.Struct({ ...queueCommand, input: Schema.Union([Schema.String, Prompt.Prompt]) }),
  success: QueueReceipt,
  error: queueErrors,
})
const updateSessionInput = HttpApiEndpoint.patch("updateInput", "/sessions/:id/queue/:inputId", {
  params: { id: Schema.String, inputId: Schema.String },
  payload: Schema.Struct({
    ...queueRevision,
    input: Schema.Union([Schema.String, Prompt.Prompt]),
    agent: Schema.optionalKey(Schema.String),
  }),
  success: QueueReceipt,
  error: queueErrors,
})
const removeSessionInput = HttpApiEndpoint.delete("removeInput", "/sessions/:id/queue/:inputId", {
  params: { id: Schema.String, inputId: Schema.String },
  payload: Schema.Struct(queueRevision),
  success: QueueReceipt,
  error: queueErrors,
})
export const sessions: HttpApiGroup.HttpApiGroup<
  "sessions",
  | typeof createSession
  | typeof getSession
  | typeof listSessions
  | typeof snapshotSession
  | typeof historySession
  | typeof pageSessionRuns
  | typeof entrySession
  | typeof runSession
  | typeof familySession
  | typeof controlSession
  | typeof submitSession
  | typeof updateSessionInput
  | typeof removeSessionInput
> = HttpApiGroup.make("sessions").add(
  createSession,
  getSession,
  listSessions,
  snapshotSession,
  historySession,
  pageSessionRuns,
  entrySession,
  runSession,
  familySession,
  controlSession,
  submitSession,
  updateSessionInput,
  removeSessionInput,
)
