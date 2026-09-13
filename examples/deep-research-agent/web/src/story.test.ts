// @vitest-environment happy-dom

import { Prompt, Response } from "effect/unstable/ai"
import { Chat, Connection } from "generalist/unstable/foldkit"
import type { ClientEvent } from "generalist/server"
import { Schema } from "effect"
import { Story } from "foldkit"
import { describe, expect, test } from "vitest"
import { GotChatAction, OpenedSession, SessionReady, init, type Model, update } from "./main"

const sessionId = "deep-research-story"

const eventFrame = (event: ClientEvent, activeRunId: string | null = sessionId): Connection.Incoming =>
  Connection.HostDelivery({
    epoch: 0,
    activeRunId,
    event,
  })

const runFrame = (
  cursor: number,
  status: "pending" | "running" | "waiting" | "succeeded" | "failed" | "cancelled",
  turn: number,
): Connection.Incoming =>
  eventFrame(
    {
      _tag: "RunChanged",
      sessionId,
      cursor: String(cursor),
      run: {
        runId: sessionId,
        rootRunId: sessionId,
        agent: { name: "deep-research", revision: "1" },
        status,
        cursor: String(cursor),
        turn,
      },
    },
    status === "succeeded" || status === "failed" || status === "cancelled" ? null : sessionId,
  )

const toolFrame = (cursor: number, status: "started" | "waiting" | "completed" | "failed"): Connection.Incoming =>
  eventFrame({
    _tag: "ToolProgress",
    sessionId,
    cursor: String(cursor),
    runId: sessionId,
    toolCallId: "search-1",
    tool: "web_search",
    status,
  })

const agentAction = (event: Connection.Incoming) => GotChatAction({ action: Chat.ReceivedConnection({ event }) })

const readyModel = (): Model => {
  const [model] = update(init()[0], OpenedSession({ sessionId }))
  return Object.assign({}, model, {
    session: SessionReady(),
    chat: Object.assign(
      {},
      Chat.update(
        model.chat,
        Chat.ReceivedConnection({
          event: Connection.SessionSnapshot({
            epoch: 0,
            snapshot: {
              version: 1,
              session: {
                id: sessionId,
                createdAt: "2026-08-03T00:00:00.000Z",
                lifecycle: "active",
                queue: [],
              },
              cursor: "-1",
              runs: [],
              conversation: { leafId: null, entries: [] },
            },
          }),
        }),
      )[0],
      { connection: "open" as const },
    ),
  })
}

const submittedQuestionModel = (): Model => {
  const [drafted] = update(
    readyModel(),
    GotChatAction({ action: Chat.ChangedDraft({ text: "What makes Generalist standalone?" }) }),
  )
  const [submitted, commands] = update(drafted, GotChatAction({ action: Chat.SubmittedMessage() }))
  expect(commands).toHaveLength(1)
  expect(commands[0]?.name).toBe("SendUserMessage")
  expect(submitted.chat.entries).toEqual([])
  return submitted
}

const toolCall = Schema.decodeSync(Response.ToolCallPart("web_search", Schema.Struct({ query: Schema.String })))({
  type: "tool-call",
  id: "search-1",
  name: "web_search",
  params: { query: "What makes Generalist standalone?" },
  providerExecuted: false,
})

const toolResult = Object.assign(
  Response.makePart("tool-result", {
    id: "search-1",
    name: "web_search",
    result: {
      results: [
        {
          title: "Generalist docs",
          url: "https://generalist.test/docs",
          snippet: "Generalist streams transport frames.",
        },
      ],
    },
    encodedResult: {
      results: [
        {
          title: "Generalist docs",
          url: "https://generalist.test/docs",
          snippet: "Generalist streams transport frames.",
        },
      ],
    },
    isFailure: false,
    providerExecuted: false,
    preliminary: false,
  }),
  { taint: [] },
)

const completionFrames: ReadonlyArray<Connection.Incoming> = [
  Connection.HostDelivery({
    epoch: 0,
    activeRunId: sessionId,
    event: {
      _tag: "ConversationChanged",
      sessionId,
      cursor: "0",
      update: {
        previousLeafId: null,
        leafId: "call-entry",
        afterEntryId: null,
        entries: [
          {
            id: "user-entry",
            parentId: null,
            messages: [
              Prompt.makeMessage("user", {
                content: [Prompt.makePart("text", { text: "What makes Generalist standalone?" })],
              }),
            ],
          },
          {
            id: "call-entry",
            parentId: "user-entry",
            messages: [
              Prompt.makeMessage("assistant", {
                content: [
                  Prompt.makePart("tool-call", {
                    id: "search-1",
                    name: "web_search",
                    params: toolCall.params,
                    providerExecuted: false,
                  }),
                ],
              }),
            ],
          },
        ],
      },
    },
  }),
  runFrame(1, "running", 0),
  toolFrame(2, "started"),
  toolFrame(3, "completed"),
  runFrame(5, "running", 1),
  Connection.HostDelivery({
    epoch: 0,
    activeRunId: sessionId,
    event: {
      _tag: "ConversationChanged",
      sessionId,
      cursor: "7",
      update: {
        previousLeafId: "call-entry",
        leafId: "model-response-entry-1",
        afterEntryId: "call-entry",
        entries: [
          {
            id: "tool-entry",
            parentId: "call-entry",
            messages: [
              Prompt.makeMessage("tool", {
                content: [
                  Prompt.makePart("tool-result", {
                    id: "search-1",
                    name: "web_search",
                    isFailure: false,
                    result: toolResult.result,
                    providerExecuted: false,
                  }),
                ],
              }),
            ],
          },
          {
            id: "model-response-entry-1",
            parentId: "tool-entry",
            messages: [
              Prompt.makeMessage("assistant", {
                content: [Prompt.makePart("text", { text: "Final cited answer\n\nSources:\n[1] Generalist docs" })],
              }),
            ],
          },
        ],
      },
    },
  }),
  runFrame(8, "succeeded", 2),
]

describe("deep-research-agent web update", () => {
  test("projects provisional output and tombstones it when committed output arrives", () => {
    const model = readyModel()
    const preview = Connection.PreviewDelivery({
      epoch: 0,
      delivery: {
        _tag: "Preview",
        sessionId,
        runId: sessionId,
        attempt: 0,
        sequence: 0,
        channel: "final",
        append: "Provisional answer",
      },
    })
    Story.story(
      update,
      Story.given({
        ...model,
        chat: {
          ...model.chat,
          run: Chat.Running({ turn: 0 }),
          previewAuthority: {
            runId: sessionId,
            attemptFence: -1,
            generation: -1,
            turn: -1,
            attempt: -1,
            modelCallId: null,
            modelAttemptId: null,
            sequence: -1,
            tombstoned: false,
          },
        },
      }),
      Story.message(agentAction(preview)),
      Story.model((current) => {
        expect(current.chat.preview?.text).toBe("Provisional answer")
      }),
      Story.message(agentAction(completionFrames.at(-1)!)),
      Story.model((current) => {
        expect(current.chat.preview).toBeNull()
        expect(current.chat.previewAuthority?.tombstoned).toBe(true)
      }),
    )
  })

  test("projects a successful Generalist transport event stream into the chat model", () => {
    Story.story(
      update,
      Story.given(submittedQuestionModel()),
      ...completionFrames.map((frame) => Story.message(agentAction(frame))),
      Story.model((model) => {
        expect(model.chat.run._tag).toBe("Idle")
        expect(model.chat.connection).toBe("open")
        expect(model.chat.entries.map((entry) => entry._tag)).toEqual(["UserEntry", "ToolEntry", "AssistantEntry"])
        expect(model.chat.entries[2]).toEqual(
          Chat.AssistantEntry({
            text: "Final cited answer\n\nSources:\n[1] Generalist docs",
            reasoning: null,
          }),
        )

        const user = model.chat.entries[0]
        const tool = model.chat.entries[1]
        if (user?._tag !== "UserEntry" || tool?._tag !== "ToolEntry") {
          throw new Error("successful transport stream projected an unexpected chat entry shape")
        }

        expect(user).toEqual(Chat.UserEntry({ text: "What makes Generalist standalone?" }))
        expect(tool).toEqual(
          Chat.ToolEntry({
            callId: '["call-entry","search-1"]',
            name: "web_search",
            params: { query: "What makes Generalist standalone?" },
            phase: "executing",
            outcome: {
              _tag: "Completed",
              isFailure: false,
              result: {
                results: [
                  {
                    title: "Generalist docs",
                    url: "https://generalist.test/docs",
                    snippet: "Generalist streams transport frames.",
                  },
                ],
              },
            },
            progress: [],
          }),
        )
      }),
    )
  })

  test("clicking stop dispatches the existing Generalist cancel command", () => {
    Story.story(
      update,
      Story.given(
        Object.assign({}, readyModel(), {
          chat: Object.assign({}, readyModel().chat, { run: Chat.Running({ turn: 0 }) }),
        }),
      ),
      Story.message(GotChatAction({ action: Chat.ClickedCancel() })),
      Story.Command.expectExact(Chat.CancelRun({ sessionId, commandId: '["cancel","deep-research-story","-1"]' })),
      Story.Command.resolve(
        Chat.CancelRun({ sessionId, commandId: '["cancel","deep-research-story","-1"]' }),
        Chat.CancelledRun(),
      ),
      Story.model((model) => {
        expect(model.chat.run).toEqual(Chat.Running({ turn: 0 }))
      }),
    )
  })

  test("projects transport failures into a failed run state", () => {
    Story.story(
      update,
      Story.given({
        ...readyModel(),
        chat: Object.assign({}, readyModel().chat, {
          run: Chat.Running({ turn: 0 }),
          entries: [
            Chat.UserEntry({ text: "What makes Generalist standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "What makes Generalist standalone?" },
              phase: "called",
              outcome: { _tag: "Pending" },
              progress: [],
            }),
          ],
        }),
      }),
      Story.message(agentAction(runFrame(9, "failed", 0))),
      Story.model((model) => {
        expect(model.chat.run).toEqual({
          _tag: "Failed",
          message: "Run failed; inspect its committed outcome for details.",
        })
        expect(model.chat.connection).toBe("open")
      }),
    )
  })
})
