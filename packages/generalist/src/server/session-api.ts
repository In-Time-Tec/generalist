import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { QueueReceipt } from "../runtime/session/queue.js"
import { SessionFamilyInput, SessionFamilyPage } from "../runtime/session/retained.js"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { SessionHistoryInput } from "../runtime/session/page.js"
import { apiErrors, InvalidCursor } from "./errors.js"
import {
  ClientConversationEntry,
  ClientCursor,
  ClientRunSummary,
  ClientSession,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  ClientSessionSnapshot,
} from "./projection/index.js"

/**
 * A client-chosen Session id must be non-empty for canonical storage, short
 * enough for the HTTP router to capture it, and a path segment no standard URL
 * parser rewrites. Otherwise the Session is stored but no id-addressed route
 * can reach it: the router drops decoded path parameters longer than its
 * 100-character default, and URL normalization removes `.` and `..` segments
 * before routing.
 */
const sessionId = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(100),
  Schema.makeFilter((id) => (id !== "." && id !== "..") || "A Session id cannot be a URL dot segment"),
  Schema.makeFilter((id) => id.isWellFormed() || "A Session id must be well-formed UTF-16"),
)

const createSession = HttpApiEndpoint.post("create", "/sessions", {
  payload: Schema.Struct({
    id: Schema.optionalKey(sessionId),
    title: Schema.optionalKey(Schema.String),
    agent: Schema.optionalKey(Schema.String),
  }),
  success: ClientSession,
  error: apiErrors,
})
const getSession = HttpApiEndpoint.get("get", "/sessions/:id", {
  params: { id: Schema.String },
  success: ClientSession,
  error: apiErrors,
})
const listSessions = HttpApiEndpoint.get("list", "/sessions", {
  success: Schema.Array(ClientSession),
  error: apiErrors,
})
const snapshotSession = HttpApiEndpoint.get("snapshot", "/sessions/:id/snapshot", {
  params: { id: Schema.String },
  success: ClientSessionSnapshot,
  error: apiErrors,
})
const historySession = HttpApiEndpoint.post("history", "/sessions/:id/history", {
  params: { id: Schema.String },
  payload: SessionHistoryInput,
  success: ClientSessionHistoryPage,
  error: apiErrors,
})
const SessionRunsPayload = Schema.Struct({
  at: ClientCursor,
  before: Schema.optionalKey(ClientCursor),
  rootRunId: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024))),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
})
const pageSessionRuns = HttpApiEndpoint.post("runs", "/sessions/:id/runs/page", {
  params: { id: Schema.String },
  payload: SessionRunsPayload,
  success: ClientSessionRunsPage,
  error: [...apiErrors, InvalidCursor],
})
const entrySession = HttpApiEndpoint.get("entry", "/sessions/:id/entries/:entryId", {
  params: { id: Schema.String, entryId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)) },
  success: ClientConversationEntry,
  error: apiErrors,
})
const runSession = HttpApiEndpoint.get("run", "/sessions/:id/runs/:runId", {
  params: { id: Schema.String, runId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)) },
  success: ClientRunSummary,
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
