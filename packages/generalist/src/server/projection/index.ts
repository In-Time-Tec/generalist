import { Option, Schema, type Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { HostEvent } from "../../host/event.js"
import type { PreviewDelivery } from "../../host/preview.js"
import type { RuntimeInspection } from "../../runtime/engine.js"
import type { HostSession, HostSessionSnapshot } from "../../runtime/session/host.js"
import type { Conversation, ConversationEntry, ConversationUpdate } from "../../runtime/session/conversation.js"
import type { SessionHistoryPage, SessionRunSummary, SessionRunsPage } from "../../runtime/session/page.js"
import type { PendingInput, SessionSelection } from "../../runtime/session/queue.js"
import type { RunStatus } from "../../runtime/run.js"
import type { RunWait } from "../../runtime/run/wait.js"
import { executableName, executableRevision } from "../../runtime/executable/public-identity.js"

/** Opaque Session transport cursor. @experimental */
export const ClientCursor = Schema.String
export type ClientCursor = typeof ClientCursor.Type

/** Conversation message visible to an ordinary client. @experimental */
export const ClientMessage = Prompt.Message.pipe(
  Schema.refine(
    (message): message is Exclude<Prompt.Message, { readonly role: "system" }> => message.role !== "system",
  ),
)
export type ClientMessage = typeof ClientMessage.Type

/** One client-visible conversation entry. @experimental */
export const ClientConversationEntry = Schema.Struct({
  id: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  messages: Schema.Array(ClientMessage),
  contentDeferred: Schema.optionalKey(Schema.Literal(true)),
})
export type ClientConversationEntry = typeof ClientConversationEntry.Type

/** Bounded active-path conversation projection. @experimental */
export const ClientConversation = Schema.Struct({
  leafId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ClientConversationEntry),
  nextLeafId: Schema.optionalKey(Schema.String),
})
export type ClientConversation = typeof ClientConversation.Type

/** Incremental client-visible conversation replacement. @experimental */
export const ClientConversationUpdate = Schema.Struct({
  previousLeafId: Schema.NullOr(Schema.String),
  leafId: Schema.NullOr(Schema.String),
  afterEntryId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ClientConversationEntry),
  reset: Schema.optionalKey(Schema.Literal(true)),
  nextLeafId: Schema.optionalKey(Schema.String),
})
export type ClientConversationUpdate = typeof ClientConversationUpdate.Type

/** Product-visible Agent name and exact build revision. @experimental */
export const ClientAgentIdentity = Schema.Struct({
  name: Schema.String,
  revision: Schema.String,
})
export type ClientAgentIdentity = typeof ClientAgentIdentity.Type

/** Remaining user-facing Run limits. @experimental */
export const ClientBudget = Schema.Struct({
  tokens: Schema.optionalKey(Schema.Int),
  usd: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.Literal("unknown")])),
  duration: Schema.optionalKey(Schema.Finite),
  toolCalls: Schema.optionalKey(Schema.Int),
  children: Schema.optionalKey(Schema.Int),
})
export type ClientBudget = typeof ClientBudget.Type

/** Client-visible token totals. @experimental */
export const ClientUsage = Schema.Struct({
  inputTokens: Schema.Int,
  outputTokens: Schema.Int,
})
export type ClientUsage = typeof ClientUsage.Type

/** Public identity and kind of one open wait. @experimental */
export const ClientWait = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["approval", "signal", "tool", "child", "external"]),
  openedAtSequence: Schema.Int,
})
export type ClientWait = typeof ClientWait.Type

/** Editable Session input without its executable selection. @experimental */
export const ClientQueueEntry = Schema.Struct({
  id: Schema.String,
  revision: Schema.Int,
  from: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(["user", "agent", "system"]),
      id: Schema.optionalKey(Schema.String),
    }),
  ),
  prompt: Prompt.Prompt,
  agent: ClientAgentIdentity,
})
export type ClientQueueEntry = typeof ClientQueueEntry.Type

/** Ordinary client Session metadata and queue. @experimental */
export const ClientSession = Schema.Struct({
  id: Schema.String,
  title: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  lifecycle: Schema.Literals(["active", "stopped", "closed"]),
  sponsorRunId: Schema.optionalKey(Schema.String),
  selectedAgent: Schema.optionalKey(ClientAgentIdentity),
  queue: Schema.Array(ClientQueueEntry),
  activeRunId: Schema.optionalKey(Schema.String),
})
export type ClientSession = typeof ClientSession.Type

const ClientRunStatus = Schema.Literals(["pending", "running", "waiting", "succeeded", "failed", "cancelled"])
type ClientRunStatus = typeof ClientRunStatus.Type

/** Detailed ordinary-client Run projection. @experimental */
export const ClientRun = Schema.Struct({
  runId: Schema.String,
  sessionId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  agent: ClientAgentIdentity,
  status: ClientRunStatus,
  durability: Schema.Literals(["ephemeral", "durable"]),
  depth: Schema.Int,
  turn: Schema.Int,
  lastSequence: Schema.Int,
  budget: ClientBudget,
  usage: ClientUsage,
  waits: Schema.Array(ClientWait),
})
export type ClientRun = typeof ClientRun.Type

/** Display-safe approval identity and summary. @experimental */
export const ClientApprovalSummary = Schema.Struct({
  id: Schema.String,
  tool: Schema.String,
  summary: Schema.String,
})
export type ClientApprovalSummary = typeof ClientApprovalSummary.Type

/** Bounded Run overlay used by Session snapshots and pages. @experimental */
export const ClientRunSummary = Schema.Struct({
  runId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  agent: ClientAgentIdentity,
  status: ClientRunStatus,
  cursor: ClientCursor,
  turn: Schema.Int,
  approval: Schema.optionalKey(ClientApprovalSummary),
})
export type ClientRunSummary = typeof ClientRunSummary.Type

/** Committed Session event variants exposed to ordinary clients. @experimental */
export const ClientEvent = Schema.Union([
  Schema.TaggedStruct("SessionChanged", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    lifecycle: ClientSession.fields.lifecycle,
    title: Schema.optionalKey(Schema.String),
    activeRunId: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("QueueChanged", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    queue: Schema.Array(ClientQueueEntry),
  }),
  Schema.TaggedStruct("RunChanged", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    run: ClientRunSummary,
  }),
  Schema.TaggedStruct("ConversationChanged", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    update: ClientConversationUpdate,
  }),
  Schema.TaggedStruct("ToolProgress", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    runId: Schema.String,
    toolCallId: Schema.String,
    tool: Schema.String,
    status: Schema.Literals(["started", "waiting", "completed", "failed"]),
    summary: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("ApprovalRequested", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    runId: Schema.String,
    approval: ClientApprovalSummary,
  }),
  Schema.TaggedStruct("BudgetChanged", {
    sessionId: Schema.String,
    cursor: ClientCursor,
    runId: Schema.String,
    budget: ClientBudget,
  }),
])
export type ClientEvent = typeof ClientEvent.Type

/** Memory-only model preview without execution authority fields. @experimental */
export const ClientPreview = Schema.TaggedStruct("Preview", {
  sessionId: Schema.String,
  runId: Schema.String,
  attempt: Schema.Int,
  sequence: Schema.Int,
  channel: Schema.Literals(["analysis", "final"]),
  append: Schema.String,
  droppedBefore: Schema.optionalKey(Schema.Int),
})
export type ClientPreview = typeof ClientPreview.Type

/** Event union carried by the Session WebSocket. @experimental */
export const ClientServerEvent = Schema.Union([ClientEvent, ClientPreview])
export type ClientServerEvent = typeof ClientServerEvent.Type

/** Initial bounded Session state used for connect and reconnect. @experimental */
export const ClientSessionSnapshot = Schema.Struct({
  version: Schema.Literal(1),
  session: ClientSession,
  cursor: ClientCursor,
  runs: Schema.Array(ClientRunSummary).check(Schema.isMaxLength(33)),
  conversation: ClientConversation,
})
export type ClientSessionSnapshot = typeof ClientSessionSnapshot.Type

/** One bounded client-visible conversation history page. @experimental */
export const ClientSessionHistoryPage = Schema.Struct({
  entries: Schema.Array(ClientConversationEntry),
  nextLeafId: Schema.NullOr(Schema.String),
})
export type ClientSessionHistoryPage = typeof ClientSessionHistoryPage.Type

/** One bounded client-visible Session Run page. @experimental */
export const ClientSessionRunsPage = Schema.Struct({
  at: ClientCursor,
  runs: Schema.Array(ClientRunSummary),
  nextBefore: Schema.NullOr(ClientCursor),
})
export type ClientSessionRunsPage = typeof ClientSessionRunsPage.Type

const projectClientAgentIdentity = (
  source:
    | Pick<SessionSelection, "executableRef" | "executableManifest" | "registrations">
    | Pick<RuntimeInspection, "executableRef" | "executableManifest" | "revision">,
): ClientAgentIdentity => {
  const name = executableName(source)
  const revision = "registrations" in source ? executableRevision(source.registrations) : source.revision
  if (name === undefined || revision === undefined) throw new Error("Executable has no public Agent identity")
  return { name, revision }
}

const projectClientConversationEntry = (source: ConversationEntry): ClientConversationEntry => {
  const projected: Types.Mutable<ClientConversationEntry> = {
    id: source.id,
    parentId: source.parentId,
    messages: source.messages,
  }
  if (source.contentDeferred === true) projected.contentDeferred = true
  return projected
}

const projectClientConversation = (source: Conversation): ClientConversation => {
  const projected: Types.Mutable<ClientConversation> = {
    leafId: source.leafId,
    entries: source.entries.map(projectClientConversationEntry),
  }
  if (source.nextLeafId !== undefined) projected.nextLeafId = source.nextLeafId
  return projected
}

const clientToolName = (source: Conversation, toolCallId: string): string | undefined => {
  for (let entryIndex = source.entries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const entry = source.entries[entryIndex]!
    for (const message of entry.messages) {
      if (message.role !== "assistant") continue
      for (const part of message.content) {
        if (part.type === "tool-call" && part.id === toolCallId) return part.name
      }
    }
  }
  return undefined
}

const projectClientConversationUpdate = (source: ConversationUpdate): ClientConversationUpdate => {
  const projected: Types.Mutable<ClientConversationUpdate> = {
    previousLeafId: source.previousLeafId,
    leafId: source.leafId,
    afterEntryId: source.afterEntryId,
    entries: source.entries.map(projectClientConversationEntry),
  }
  if (source.reset === true) projected.reset = true
  if (source.nextLeafId !== undefined) projected.nextLeafId = source.nextLeafId
  return projected
}

const projectMessageSource = (source: PendingInput["from"]): ClientQueueEntry["from"] => {
  if (source === undefined) return undefined
  if ("user" in source) return { kind: "user", id: source.user }
  if ("runId" in source) return { kind: "agent", id: source.runId }
  return { kind: "system" }
}

const projectClientQueueEntry = (source: PendingInput): ClientQueueEntry => {
  const projected: Types.Mutable<ClientQueueEntry> = {
    id: source.id,
    revision: source.revision,
    prompt: source.prompt,
    agent: projectClientAgentIdentity(source.selection),
  }
  const from = projectMessageSource(source.from)
  if (from !== undefined) projected.from = from
  return projected
}

const projectClientSession = (source: HostSession): ClientSession => {
  const projected: Types.Mutable<ClientSession> = {
    id: source.id,
    createdAt: source.createdAt,
    lifecycle: source.lifecycle ?? "active",
    queue: source.queue.map(projectClientQueueEntry),
  }
  if (source.title !== undefined) projected.title = source.title
  if (source.sponsorRunId !== undefined) projected.sponsorRunId = source.sponsorRunId
  if (source.selection !== undefined) projected.selectedAgent = projectClientAgentIdentity(source.selection)
  if (source.activeRunId !== undefined) projected.activeRunId = source.activeRunId
  return projected
}

const projectClientBudget = (source: RuntimeInspection["budget"]): ClientBudget => {
  const projected: Types.Mutable<ClientBudget> = {}
  if (source.tokens !== undefined) projected.tokens = source.tokens
  if (source.usd !== undefined) projected.usd = source.usd
  if (source.duration !== undefined) projected.duration = source.duration
  if (source.toolCalls !== undefined) projected.toolCalls = source.toolCalls
  if (source.children !== undefined) projected.children = source.children
  return projected
}

const projectClientUsage = (source: RuntimeInspection["usage"]): ClientUsage => ({
  inputTokens: source.inputTokens,
  outputTokens: source.outputTokens,
})

const waitKind = (source: RunWait): ClientWait["kind"] => {
  switch (source.reason._tag) {
    case "Approval":
      return "approval"
    case "Signal":
      return "signal"
    case "ToolWait":
      return "tool"
    case "AwaitEvent":
      return "child"
    case "Timer":
    case "External":
      return "external"
  }
}

const projectClientWait = (source: RunWait, openedAtSequence: number): ClientWait => ({
  id: source.waitId,
  kind: waitKind(source),
  openedAtSequence,
})

const projectClientRunStatus = (source: RunStatus): ClientRunStatus => {
  switch (source) {
    case "queued":
      return "pending"
    case "needs-resolution":
      return "waiting"
    case "cancelling":
      return "running"
    default:
      return source
  }
}

const projectClientRun = (
  source: RuntimeInspection,
  context: { readonly sessionId: string; readonly rootRunId: string },
): ClientRun => {
  const projected: Types.Mutable<ClientRun> = {
    runId: source.runId,
    sessionId: context.sessionId,
    rootRunId: context.rootRunId,
    agent: projectClientAgentIdentity(source),
    status: projectClientRunStatus(source.status),
    durability: source.durability,
    depth: source.depth,
    turn: source.turn,
    lastSequence: source.lastSequence,
    budget: projectClientBudget(source.budget),
    usage: projectClientUsage(source.usage),
    waits: source.waits.map((wait) => {
      const openedAtSequence = source.waitOpenedAtSequence[wait.waitId]
      if (openedAtSequence === undefined) throw new Error(`Missing opening sequence for wait ${wait.waitId}`)
      return projectClientWait(wait, openedAtSequence)
    }),
  }
  if (source.parentRunId !== undefined) projected.parentRunId = source.parentRunId
  return projected
}

const projectClientApprovalSummary = (source: SessionRunSummary["approval"]): ClientApprovalSummary | undefined =>
  source === undefined ? undefined : { id: source.approvalId, tool: source.capability, summary: source.operation }

const projectClientRunSummary = (source: SessionRunSummary, agent: ClientAgentIdentity): ClientRunSummary => {
  const projected: Types.Mutable<ClientRunSummary> = {
    runId: source.runId,
    rootRunId: source.rootRunId,
    agent,
    status: projectClientRunStatus(source.status),
    cursor: String(source.cursor),
    turn: source.turn,
  }
  if (source.parentRunId !== undefined) projected.parentRunId = source.parentRunId
  const approval = projectClientApprovalSummary(source.approval)
  if (approval !== undefined) projected.approval = approval
  return projected
}

const requiredIdentity = (identities: ReadonlyMap<string, ClientAgentIdentity>, runId: string): ClientAgentIdentity => {
  const identity = identities.get(runId)
  if (identity === undefined) throw new Error(`Missing Client Agent identity for Run ${runId}`)
  return identity
}

const projectClientSnapshot = (
  source: HostSessionSnapshot,
  identities: ReadonlyMap<string, ClientAgentIdentity>,
): ClientSessionSnapshot => ({
  version: 1,
  session: projectClientSession(source.session),
  cursor: String(source.cursor),
  runs: source.runs.map((run) => projectClientRunSummary(run, requiredIdentity(identities, run.runId))),
  conversation: projectClientConversation(source.conversation),
})

const projectClientHistoryPage = (source: SessionHistoryPage): ClientSessionHistoryPage => ({
  entries: source.entries.map(projectClientConversationEntry),
  nextLeafId: source.nextLeafId,
})

const projectClientRunsPage = (
  source: SessionRunsPage,
  identities: ReadonlyMap<string, ClientAgentIdentity>,
): ClientSessionRunsPage => ({
  at: String(source.at),
  runs: source.runs.map((run) => projectClientRunSummary(run, requiredIdentity(identities, run.runId))),
  nextBefore: source.nextBefore === null ? null : String(source.nextBefore),
})

const eventRunSummary = (
  source: Extract<HostEvent, { readonly runId: string; readonly event: object }>,
  agent: ClientAgentIdentity,
): ClientRunSummary => {
  let status: ClientRunStatus = "running"
  if (source._tag === "RunStarted") status = "pending"
  else if (source._tag === "Completed") {
    if (source.event._tag === "RunCompleted") status = "succeeded"
    else if (source.event._tag === "RunFailed") status = "failed"
    else status = "cancelled"
  }
  const turn = source._tag === "Turn" ? source.event.turn : 0
  const projected: Types.Mutable<ClientRunSummary> = {
    runId: source.runId,
    rootRunId: source.event.rootRunId,
    agent,
    status,
    cursor: String(source.event.sequence),
    turn,
  }
  if (source.event.parentRunId !== undefined) projected.parentRunId = source.event.parentRunId
  return projected
}

const projectClientEvent = (
  sessionId: string,
  source: HostEvent,
  agent?: ClientAgentIdentity,
  toolName?: string,
): Option.Option<ClientEvent> => {
  const cursor = String(source.cursor)
  if (source._tag === "Conversation") {
    return Option.some({
      _tag: "ConversationChanged",
      sessionId,
      cursor,
      update: projectClientConversationUpdate(source.update),
    })
  }
  if (source._tag === "RunStarted" || source._tag === "Turn" || source._tag === "Completed") {
    if (agent === undefined) return Option.none()
    return Option.some({ _tag: "RunChanged", sessionId, cursor, run: eventRunSummary(source, agent) })
  }
  if (source._tag === "ApprovalRequested") {
    return Option.some({
      _tag: "ApprovalRequested",
      sessionId,
      cursor,
      runId: source.runId,
      approval: {
        id: source.event.request.approvalId,
        tool: source.event.call.name,
        summary: source.event.request.operation,
      },
    })
  }
  if (source._tag === "ToolCall") {
    const event = source.event
    if (event._tag === "ToolProgress") {
      if (toolName === undefined) return Option.none()
      const projected: Types.Mutable<Extract<ClientEvent, { readonly _tag: "ToolProgress" }>> = {
        _tag: "ToolProgress",
        sessionId,
        cursor,
        runId: source.runId,
        toolCallId: event.toolCallId,
        tool: toolName,
        status: "started",
      }
      if (event.message !== undefined) projected.summary = event.message
      return Option.some(projected)
    }
    let status: Extract<ClientEvent, { readonly _tag: "ToolProgress" }>["status"]
    if (event._tag === "ToolExecutionStarted") status = "started"
    else if (event._tag === "ToolExecutionWaiting") status = "waiting"
    else status = event.result.isFailure ? "failed" : "completed"
    return Option.some({
      _tag: "ToolProgress",
      sessionId,
      cursor,
      runId: source.runId,
      toolCallId: event.call.id,
      tool: event.call.name,
      status,
    })
  }
  return Option.none()
}

const projectClientPreview = (source: PreviewDelivery): ReadonlyArray<ClientPreview> => {
  const event = source.event
  if (event._tag === "ModelPreviewCleared") return []
  return event.changes.map((change) => {
    const projected: Types.Mutable<ClientPreview> = {
      _tag: "Preview",
      sessionId: source.sessionId,
      runId: source.runId,
      attempt: event.attempt,
      sequence: event.sequence,
      channel: change.channel === "reasoning" ? "analysis" : "final",
      append: change.delta,
    }
    if (change.offset > 0) projected.droppedBefore = change.offset
    return projected
  })
}

export const clientProjection = {
  clientToolName,
  projectClientAgentIdentity,
  projectClientApprovalSummary,
  projectClientBudget,
  projectClientConversation,
  projectClientConversationEntry,
  projectClientConversationUpdate,
  projectClientEvent,
  projectClientHistoryPage,
  projectClientPreview,
  projectClientQueueEntry,
  projectClientRun,
  projectClientRunStatus,
  projectClientRunSummary,
  projectClientRunsPage,
  projectClientSession,
  projectClientSnapshot,
  projectClientUsage,
  projectClientWait,
}
