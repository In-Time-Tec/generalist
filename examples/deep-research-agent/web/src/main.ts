import { Chat, Connection } from "@batonfx/foldkit"
import { Cause, Effect, Function, Layer, Schema } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"
import { define, mapMessage, mapMessages, type Command } from "foldkit/command"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"
import { m } from "foldkit/message"
import type { ApplicationInit } from "foldkit/runtime"
import { ts } from "foldkit/schema"
import { lift, type Subscriptions } from "foldkit/subscription"

import { badge } from "@/components/ui/badge"
import {
  conversation,
  conversationContent,
  conversationEmptyState,
  conversationScrollButton,
} from "@/components/ui/conversation"
import { loader } from "@/components/ui/loader"
import {
  MessageScrollerMessage,
  MessageScrollerModel,
  messageScrollerInit,
  messageScrollerUpdate,
} from "@/components/ui/message-scroller"
import { message, messageContent } from "@/components/ui/message"
import { promptInput, promptInputSubmit, promptInputTextarea, promptInputToolbar } from "@/components/ui/prompt-input"
import { reasoning, reasoningContent, reasoningTrigger } from "@/components/ui/reasoning"
import { response, responseText } from "@/components/ui/response"
import { source, sources, sourcesContent, sourcesTrigger } from "@/components/ui/sources"
import { tool, toolContent, toolHeader, toolInput, toolOutput } from "@/components/ui/tool"

const SERVER_HTTP_URL = "http://localhost:4000"

// MODEL

export const SessionOpening = ts("SessionOpening")
export const SessionReady = ts("SessionReady")
export const SessionFailed = ts("SessionFailed", { message: Schema.String })

export type SessionState = typeof SessionOpening.Type | typeof SessionReady.Type | typeof SessionFailed.Type

export const SessionState: Schema.Schema<SessionState> = Schema.Union([SessionOpening, SessionReady, SessionFailed])

export const Model = Schema.Struct({
  chat: Chat.Model,
  session: SessionState,
  scroller: MessageScrollerModel,
  expandedToolCallIds: Schema.Array(Schema.String),
})

export type Model = typeof Model.Type

// MESSAGE

export const GotChatAction = m("GotChatAction", { action: Chat.Action })
export const GotScrollerMessage = m("GotScrollerMessage", { message: MessageScrollerMessage })
export const OpenedSession = m("OpenedSession", { sessionId: Schema.String })
export const FailedOpenSession = m("FailedOpenSession", { reason: Schema.String })
export const ToggledExpanded = m("ToggledExpanded", { key: Schema.String })

export const Message = Schema.Union([
  GotChatAction,
  GotScrollerMessage,
  OpenedSession,
  FailedOpenSession,
  ToggledExpanded,
])

export type Message = typeof Message.Type

// INIT

export const init: ApplicationInit<Model, Message, void, Connection.AgentConnection> = () => [
  {
    chat: Chat.initialModel(null),
    session: SessionOpening(),
    scroller: messageScrollerInit({ id: "conversation-scroller" }),
    expandedToolCallIds: [],
  },
  [OpenSession()],
]

// COMMAND

/** Opens a Baton session on the server before the WebSocket attaches to it. */
export const OpenSession = define(
  "OpenSession",
  OpenedSession,
  FailedOpenSession,
)(
  Effect.gen(function* () {
    const httpClient = yield* Layer.build(FetchHttpClient.layer)
    const httpResponse = yield* HttpClient.post(`${SERVER_HTTP_URL}/sessions`, {
      body: HttpBody.jsonUnsafe({}),
    }).pipe(Effect.provideContext(httpClient))
    const body = (yield* httpResponse.json) as { readonly sessionId: string }
    return OpenedSession({ sessionId: body.sessionId })
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
)

// UPDATE

type ProgramCommand = Command<Message, never, Connection.AgentConnection>

const toggle = (keys: ReadonlyArray<string>, key: string): ReadonlyArray<string> =>
  keys.includes(key) ? keys.filter((existing) => existing !== key) : [...keys, key]

const asProgramCommands = (
  commands: ReadonlyArray<Command<Message, unknown, Connection.AgentConnection>>,
): ReadonlyArray<ProgramCommand> => commands as ReadonlyArray<ProgramCommand>

export const update: {
  (model: Model, currentMessage: Message): readonly [Model, ReadonlyArray<ProgramCommand>]
  (currentMessage: Message): (model: Model) => readonly [Model, ReadonlyArray<ProgramCommand>]
} = Function.dual(2, (model: Model, currentMessage: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (currentMessage._tag) {
    case "OpenedSession":
      return [{ ...model, chat: { ...model.chat, sessionId: currentMessage.sessionId }, session: SessionReady() }, []]
    case "FailedOpenSession":
      return [{ ...model, session: SessionFailed({ message: currentMessage.reason }) }, []]
    case "GotChatAction": {
      const [chat, chatCommands] = Chat.update(model.chat, currentMessage.action)
      return [
        { ...model, chat },
        asProgramCommands(mapMessages(chatCommands, (chatAction) => GotChatAction({ action: chatAction }))),
      ]
    }
    case "GotScrollerMessage": {
      const [scroller, scrollerCommands] = messageScrollerUpdate(model.scroller, currentMessage.message)
      return [
        { ...model, scroller },
        asProgramCommands(
          scrollerCommands.map(mapMessage((scrollerMessage) => GotScrollerMessage({ message: scrollerMessage }))),
        ),
      ]
    }
    case "ToggledExpanded":
      return [{ ...model, expandedToolCallIds: toggle(model.expandedToolCallIds, currentMessage.key) }, []]
  }
})

// SUBSCRIPTION

export const subscriptions: Subscriptions<Model, Message, Connection.AgentConnection> = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatAction) => GotChatAction({ action: chatAction }),
})

// VIEW

const connectionVariant = (connection: Chat.Model["connection"]): "default" | "outline" | "destructive" => {
  switch (connection) {
    case "open":
      return "default"
    case "connecting":
    case "reconnecting":
      return "outline"
    case "disconnected":
      return "destructive"
  }
}

const connectionLabel = (connection: Chat.Model["connection"]): string => {
  switch (connection) {
    case "open":
      return "Connected"
    case "connecting":
      return "Connecting…"
    case "reconnecting":
      return "Reconnecting…"
    case "disconnected":
      return "Disconnected"
  }
}

const headerView = (model: Model): Html => {
  const h = html<Message>()
  return h.header(
    [h.Class("flex items-center justify-between border-b px-6 py-4")],
    [
      h.div(
        [h.Class("flex flex-col gap-0.5")],
        [
          h.h1([h.Class("text-lg font-semibold")], ["Deep Research Agent"]),
          h.p(
            [h.Class("text-xs text-muted-foreground")],
            ["A Baton agent: plans, calls web_search, and synthesizes a cited answer — streamed live."],
          ),
        ],
      ),
      badge({ variant: connectionVariant(model.chat.connection) }, [connectionLabel(model.chat.connection)]),
    ],
  )
}

const runningIndicatorView = (): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("flex items-center gap-2 text-sm text-muted-foreground")],
    [loader({ size: 16 }), h.span([], ["Thinking…"])],
  )
}

const failureView = (messageText: string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role("alert"),
      h.Class("rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"),
    ],
    [`Run failed: ${messageText}`],
  )
}

const reasoningBlockView = (model: Model, key: string, text: string, isStreaming: boolean): Html => {
  const h = html<Message>()
  const isOpen = model.expandedToolCallIds.includes(key)
  return reasoning({ isOpen }, [
    reasoningTrigger({ isOpen, isStreaming, onToggled: ToggledExpanded({ key }) }),
    h.keyed("div")(isOpen ? "open" : "closed", [], isOpen ? [reasoningContent({}, [text])] : []),
  ])
}

const userEntryView = (entry: typeof Chat.UserEntry.Type): Html =>
  message({ align: "end" }, [
    messageContent({}, [
      response({ class: "rounded-2xl bg-primary px-4 py-2 text-primary-foreground" }, [responseText({}, entry.text)]),
    ]),
  ])

interface WebSearchResult {
  readonly title: string
  readonly url: string
  readonly snippet: string
}

const inlineCitationsView = (results: ReadonlyArray<WebSearchResult>): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground")],
    [
      h.span([h.Class("mr-1")], ["Sources"]),
      ...results.map((result, index) =>
        h.a(
          [
            h.Href(result.url),
            h.Target("_blank"),
            h.Rel("noreferrer"),
            h.Class("rounded-full border px-2 py-0.5 text-primary hover:bg-accent"),
          ],
          [`[${index + 1}] ${result.title}`],
        ),
      ),
    ],
  )
}

const assistantEntryView = (
  model: Model,
  key: string,
  entry: typeof Chat.AssistantEntry.Type,
  citationResults: ReadonlyArray<WebSearchResult>,
): Html =>
  message({ align: "start" }, [
    messageContent({}, [
      ...(entry.reasoning === null ? [] : [reasoningBlockView(model, key, entry.reasoning, false)]),
      ...(entry.text.length === 0 ? [] : [response({}, [responseText({}, entry.text)])]),
      ...(citationResults.length > 0 ? [inlineCitationsView(citationResults)] : []),
    ]),
  ])

interface WebSearchSuccess {
  readonly results: ReadonlyArray<WebSearchResult>
}

const isWebSearchSuccess = (value: unknown): value is WebSearchSuccess =>
  typeof value === "object" && value !== null && Array.isArray((value as { results?: unknown }).results)

const toolResultBodyView = (outcome: Extract<Chat.ToolOutcome, { _tag: "Completed" }>): Html => {
  const h = html<Message>()
  return toolOutput({ isError: outcome.isFailure }, [
    h.pre([h.Class("max-h-72 overflow-auto p-3 text-xs")], [h.code([], [JSON.stringify(outcome.result, null, 2)])]),
  ])
}

const sourcesBlockView = (model: Model, entry: typeof Chat.ToolEntry.Type): Html => {
  const h = html<Message>()
  if (entry.outcome._tag !== "Completed" || entry.outcome.isFailure) return h.keyed("div")("no-sources", [], [])
  if (!isWebSearchSuccess(entry.outcome.result) || entry.outcome.result.results.length === 0) {
    return h.keyed("div")("no-sources", [], [])
  }
  const key = `${entry.callId}-sources`
  const isOpen = model.expandedToolCallIds.includes(key)
  const results = entry.outcome.result.results
  return h.keyed("div")(
    isOpen ? "sources-open" : "sources-closed",
    [],
    [
      sources({}, [
        sourcesTrigger({ count: results.length, isOpen, onToggled: ToggledExpanded({ key }) }),
        ...(isOpen
          ? [
              sourcesContent(
                {},
                results.map((result) => source({ href: result.url, title: result.title })),
              ),
            ]
          : []),
      ]),
    ],
  )
}

const toolBodyView = (entry: typeof Chat.ToolEntry.Type): Html =>
  toolContent({}, [
    toolInput({}, JSON.stringify(entry.params, null, 2)),
    ...(entry.outcome._tag === "Completed" ? [toolResultBodyView(entry.outcome)] : []),
  ])

const toolEntryView = (model: Model, entry: typeof Chat.ToolEntry.Type): Html => {
  const h = html<Message>()
  const isOpen = model.expandedToolCallIds.includes(entry.callId)
  return message({ align: "start" }, [
    messageContent({}, [
      tool({}, [
        toolHeader({
          name: entry.name,
          status: Chat.toolStatusOf(entry),
          isOpen,
          onToggled: ToggledExpanded({ key: entry.callId }),
        }),
        h.keyed("div")(isOpen ? "open" : "closed", [], isOpen ? [toolBodyView(entry)] : []),
      ]),
      sourcesBlockView(model, entry),
    ]),
  ])
}

const sourceResultsBefore = (entries: ReadonlyArray<Chat.ChatEntry>, index: number): ReadonlyArray<WebSearchResult> => {
  const seen = new Set<string>()
  const results: Array<WebSearchResult> = []
  for (const entry of entries.slice(0, index)) {
    if (entry._tag !== "ToolEntry" || entry.outcome._tag !== "Completed" || entry.outcome.isFailure) continue
    if (!isWebSearchSuccess(entry.outcome.result)) continue
    for (const result of entry.outcome.result.results) {
      const key = `${result.title}\n${result.url}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push(result)
    }
  }
  return results
}

const chatEntryView = (model: Model, entry: Chat.ChatEntry, index: number): Html => {
  const h = html<Message>()
  switch (entry._tag) {
    case "UserEntry":
      return h.keyed("div")(`entry-${index}-user`, [], [userEntryView(entry)])
    case "AssistantEntry":
      return h.keyed("div")(
        `entry-${index}-assistant`,
        [],
        [assistantEntryView(model, `reasoning-${index}`, entry, sourceResultsBefore(model.chat.entries, index))],
      )
    case "ToolEntry":
      return h.keyed("div")(`entry-${index}-tool`, [], [toolEntryView(model, entry)])
  }
}

const streamingEntryView = (model: Model, streaming: NonNullable<Chat.Model["streaming"]>): Html =>
  message({ align: "start" }, [
    messageContent({}, [
      ...(streaming.reasoning.length > 0
        ? [reasoningBlockView(model, "reasoning-streaming", streaming.reasoning, true)]
        : []),
      streaming.text.length > 0 ? response({}, [responseText({}, streaming.text)]) : runningIndicatorView(),
    ]),
  ])

const transcriptView = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  const failure =
    model.chat.run._tag === "Failed"
      ? [
          h.keyed("div")(
            "failure-row",
            [],
            [message({ align: "start" }, [messageContent({}, [failureView(model.chat.run.message)])])],
          ),
        ]
      : []
  if (model.chat.entries.length === 0 && model.chat.streaming === null) {
    if (failure.length > 0) return failure
    return [
      h.keyed("div")(
        "empty-state",
        [],
        [
          conversationEmptyState({
            title: "Ask a research question",
            description: "The agent plans briefly, calls web_search, and synthesizes a cited answer.",
          }),
        ],
      ),
    ]
  }
  const entries = model.chat.entries.map((entry, index) => chatEntryView(model, entry, index))
  const streaming =
    model.chat.streaming === null
      ? []
      : [h.keyed("div")("streaming-row", [], [streamingEntryView(model, model.chat.streaming)])]
  const waiting =
    model.chat.run._tag === "Running" && model.chat.streaming === null
      ? [
          h.keyed("div")(
            "waiting-row",
            [],
            [message({ align: "start" }, [messageContent({}, [runningIndicatorView()])])],
          ),
        ]
      : []
  return [...entries, ...streaming, ...waiting, ...failure]
}

const sessionBannerView = (session: SessionState): Html => {
  const h = html<Message>()
  return h.keyed("div")(session._tag, [], [sessionBannerContentView(session)])
}

const sessionBannerContentView = (session: SessionState): Html => {
  const h = html<Message>()
  switch (session._tag) {
    case "SessionOpening":
      return h.p([h.Class("px-6 py-2 text-xs text-muted-foreground")], ["Opening a session…"])
    case "SessionFailed":
      return h.p(
        [h.Class("bg-destructive/10 px-6 py-2 text-xs text-destructive")],
        [`Could not open a session: ${session.message}`],
      )
    case "SessionReady":
      return h.div([], [])
  }
}

const footerView = (model: Model): Html => {
  const isReady = model.session._tag === "SessionReady"
  const isCancellable =
    model.chat.sessionId !== null && (model.chat.run._tag === "Running" || model.chat.run._tag === "AwaitingApproval")
  const submitAction = GotChatAction({ action: Chat.SubmittedMessage() })
  const cancelAction = GotChatAction({ action: Chat.ClickedCancel() })
  return promptInput({ class: "mx-auto w-full max-w-3xl", onSubmitted: submitAction }, [
    promptInputTextarea({
      id: "research-question",
      value: model.chat.draft,
      placeholder: "Ask a research question…",
      isDisabled: !isReady,
      onInput: (value) => GotChatAction({ action: Chat.ChangedDraft({ text: value }) }),
      onSubmitRequested: submitAction,
    }),
    promptInputToolbar({}, [
      promptInputSubmit({
        status: Chat.promptInputStatusOf(model.chat.run),
        type: isCancellable ? "button" : "submit",
        onClick: isCancellable ? cancelAction : undefined,
        isDisabled: !isReady || (!isCancellable && model.chat.draft.trim().length === 0),
      }),
    ]),
  ])
}

export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: "Deep Research Agent",
    body: h.div(
      [h.Class("mx-auto flex h-screen w-full max-w-4xl flex-col bg-background text-foreground")],
      [
        headerView(model),
        sessionBannerView(model.session),
        conversation({ class: "min-h-0 flex-1" }, [
          conversationContent(
            {
              model: model.scroller,
              toParentMessage: (scrollerMessage) => GotScrollerMessage({ message: scrollerMessage }),
            },
            transcriptView(model),
          ),
          conversationScrollButton({
            model: model.scroller,
            toParentMessage: (scrollerMessage) => GotScrollerMessage({ message: scrollerMessage }),
          }),
        ]),
        h.div([h.Class("border-t p-4")], [footerView(model)]),
      ],
    ),
  }
}
