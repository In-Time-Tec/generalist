// @vitest-environment happy-dom

import { Response } from "effect/unstable/ai"
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
  Schema.decodeUnknownSync(HostEvent)({ _tag: tag, sessionId, cursor, runId: sessionId, event })

const agentAction = (event: Connection.Incoming) => GotChatAction({ action: Chat.ReceivedConnection({ event }) })

const readyModel = (): Model => {
  const [model] = update(init()[0], OpenedSession({ sessionId }))
  return Object.assign({}, model, {
    session: SessionReady(),
    chat: Object.assign({}, model.chat, { connection: "open" as const }),
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
  expect(submitted.chat.entries).toEqual([Chat.UserEntry({ text: "What makes Generalist standalone?" })])
  return submitted
}

const toolCall = Schema.decodeSync(Response.ToolCallPart("web_search", Schema.Struct({ query: Schema.String })))({
  type: "tool-call",
  id: "search-1",
  name: "web_search",
  params: { query: "What makes Generalist standalone?" },
  providerExecuted: false,
})

const toolResult = Response.makePart("tool-result", {
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
})

const completionFrames: ReadonlyArray<Connection.Incoming> = [
  eventFrame(0, "Turn", runEvent(0, { _tag: "TurnStarted", turn: 0 })),
  eventFrame(2, "ToolCall", runEvent(2, { _tag: "ToolExecutionStarted", turn: 0, call: toolCall })),
  eventFrame(
    3,
    "ToolCall",
    runEvent(3, { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult }),
  ),
  eventFrame(5, "Turn", runEvent(5, { _tag: "TurnStarted", turn: 1 })),
  eventFrame(
    8,
    "Completed",
    runEvent(8, {
      _tag: "RunCompleted",
      result: {
        turns: 2,
        text: "Final cited answer\n\nSources:\n[1] Generalist docs",
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
        expect(model.chat.entries.map((entry) => entry._tag)).toEqual(["UserEntry", "ToolEntry"])

        const user = model.chat.entries[0]
        const tool = model.chat.entries[1]
        if (user?._tag !== "UserEntry" || tool?._tag !== "ToolEntry") {
          throw new Error("successful transport stream projected an unexpected chat entry shape")
        }

        expect(user).toEqual(Chat.UserEntry({ text: "What makes Generalist standalone?" }))
        expect(tool).toEqual(
          Chat.ToolEntry({
            callId: "search-1",
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
      Story.Command.expectExact(Chat.CancelRun({ sessionId })),
      Story.Command.resolve(Chat.CancelRun({ sessionId }), Chat.CancelledRun()),
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
