// @vitest-environment happy-dom

import { Prompt, Response } from "effect/unstable/ai"
import { HostEvent } from "generalist/host"
import { Chat, Connection } from "generalist/unstable/foldkit"
import { Errors, ExecutableManifest, RunEvent } from "generalist/runtime"
import { Schema } from "effect"
import { Story } from "foldkit"
import { describe, expect, test } from "vitest"
import { GotChatAction, OpenedSession, SessionReady, init, type Model, update } from "./main"

const sessionId = "deep-research-story"

const agent = ExecutableManifest.makeTest("deep-research", "1").ref
const runEvent = <Fields extends object>(sequence: number, fields: Fields): RunEvent.RunEvent =>
  Schema.decodeUnknownSync(RunEvent.RunEvent)({
    specVersion: "1",
    eventId: `${sessionId}:${sequence}`,
    runId: sessionId,
    sequence,
    executableRef: agent,
    rootRunId: sessionId,
    depth: 0,
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  })

const eventFrame = (cursor: number, tag: HostEvent["_tag"], event: RunEvent.RunEvent): Connection.Incoming =>
  Connection.HostDelivery({
    epoch: 0,
    event: Schema.decodeUnknownSync(HostEvent)({ _tag: tag, sessionId, cursor, runId: sessionId, event }),
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
              session: { id: sessionId, createdAt: "2026-08-03T00:00:00.000Z" },
              cursor: -1,
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
    event: {
      _tag: "Conversation",
      sessionId,
      cursor: 0,
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
  eventFrame(1, "Turn", runEvent(0, { _tag: "TurnStarted", turn: 0 })),
  eventFrame(2, "ToolCall", runEvent(2, { _tag: "ToolExecutionStarted", turn: 0, call: toolCall })),
  eventFrame(
    3,
    "ToolCall",
    runEvent(3, { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult }),
  ),
  eventFrame(5, "Turn", runEvent(5, { _tag: "TurnStarted", turn: 1 })),
  Connection.HostDelivery({
    epoch: 0,
    event: {
      _tag: "Conversation",
      sessionId,
      cursor: 7,
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
  eventFrame(
    8,
    "Completed",
    runEvent(8, {
      _tag: "RunCompleted",
      result: {
        turns: 2,
        text: "Final cited answer\n\nSources:\n[1] Generalist docs",
        output: "Final cited answer\n\nSources:\n[1] Generalist docs",
        session: { sessionId, leafId: "model-response-entry-1" },
      },
    }),
  ),
]

describe("deep-research-agent web update", () => {
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
      Story.Command.expectExact(Chat.CancelRun({ sessionId, commandId: '["cancel","deep-research-story",-1]' })),
      Story.Command.resolve(
        Chat.CancelRun({ sessionId, commandId: '["cancel","deep-research-story",-1]' }),
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
      Story.message(
        agentAction(
          eventFrame(
            9,
            "Completed",
            runEvent(9, {
              _tag: "RunFailed",
              error: Errors.AgentExecutionFailure.make({ message: "model unavailable" }),
            }),
          ),
        ),
      ),
      Story.model((model) => {
        expect(model.chat.run).toEqual({ _tag: "Failed", message: "model unavailable" })
        expect(model.chat.connection).toBe("open")
      }),
    )
  })
})
