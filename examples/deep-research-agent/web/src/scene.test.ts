// @vitest-environment happy-dom

import { Chat } from "@batonfx/foldkit"
import { Option } from "effect"
import { Scene } from "foldkit"
import { describe, expect, test } from "vitest"
import {
  CompletedScrollToBottom,
  GrewContent,
  Message,
  ObserveContentGrowth,
  ScrollToBottom,
  ScrolledViewport,
  TrackViewportScroll,
} from "./components/ui/message-scroller"
import { GotChatMessage, GotScrollerMessage, SessionReady, init, type Model, update, view } from "./main"

const baseModel = (): Model => ({
  ...init()[0],
  session: SessionReady(),
  chat: { ...Chat.initialModel("deep-research-scene"), connection: "open" },
})

const renderedText = (node: unknown): string => {
  if (typeof node === "string") return node
  if (node === null || typeof node !== "object") return ""
  const text = "text" in node && typeof node.text === "string" ? node.text : ""
  const children =
    "children" in node && Array.isArray(node.children) ? node.children.map((child) => renderedText(child)).join("") : ""
  return `${text}${children}`
}

const resolveScrollerMounts = Scene.Mount.resolveAll(
  [TrackViewportScroll, ScrolledViewport({ isAtBottom: true }), (message: Message) => GotScrollerMessage({ message })],
  [ObserveContentGrowth, GrewContent(), (message: Message) => GotScrollerMessage({ message })],
)

const resolveScrollerCommand = Scene.Command.resolve(ScrollToBottom, CompletedScrollToBottom(), (message: Message) =>
  GotScrollerMessage({ message }),
)

describe("deep-research-agent web view", () => {
  test("idle state renders the prompt and enables submit after draft text", () => {
    Scene.scene(
      { update, view },
      Scene.with(baseModel()),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.expect(Scene.text("Ask a research question")).toExist(),
      Scene.expect(Scene.placeholder("Ask a research question…")).toExist(),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeDisabled(),
      Scene.type(Scene.placeholder("Ask a research question…"), "baton agents"),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeEnabled(),
    )
  })

  test("running state renders a pending expanded tool card with the query", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Running({ turn: 0 }),
          entries: [
            Chat.UserEntry({ text: "What makes Baton standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "baton standalone" },
              phase: "executing",
              outcome: { _tag: "Pending" },
              progress: [],
            }),
          ],
        },
        expandedToolCallIds: ["search-1"],
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.expect(Scene.text("web_search")).toExist(),
      Scene.expect(Scene.text("Running")).toExist(),
      Scene.expect(Scene.text("Parameters")).toExist(),
      Scene.tap(({ html }) => {
        expect(renderedText(html)).toContain('"query": "baton standalone"')
      }),
      Scene.expect(Scene.text("Thinking…")).toExist(),
    )
  })

  test("running state wires the Stop button to the existing cancel command", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Running({ turn: 0 }),
          entries: [Chat.UserEntry({ text: "What makes Baton standalone?" })],
        },
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.expect(Scene.role("button", { name: "Stop" })).toBeEnabled(),
      Scene.click(Scene.role("button", { name: "Stop" })),
      Scene.Command.expectExact(Chat.CancelRun({ sessionId: "deep-research-scene" })),
      Scene.Command.resolve(Chat.CancelRun({ sessionId: "deep-research-scene" }), Chat.CancelledRun(), (message) =>
        GotChatMessage({ message }),
      ),
    )
  })

  test("completed state renders the final answer and expanded source links", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Idle(),
          entries: [
            Chat.UserEntry({ text: "What makes Baton standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "baton standalone" },
              phase: "executing",
              outcome: {
                _tag: "Completed",
                isFailure: false,
                result: {
                  results: [
                    {
                      title: "Baton docs",
                      url: "https://baton.test/docs",
                      snippet: "Baton streams transport frames.",
                    },
                    {
                      title: "Effect runtime",
                      url: "https://effect.test/runtime",
                      snippet: "Effect models services as layers.",
                    },
                  ],
                },
              },
              progress: [],
            }),
            Chat.AssistantEntry({ text: "Final cited answer\n\nSources:\n[1] Baton docs", reasoning: null }),
          ],
        },
        expandedToolCallIds: ["search-1-sources"],
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.tap(({ html }) => {
        expect(renderedText(html)).toContain("Final cited answer")
      }),
      Scene.expect(Scene.role("link", { name: "[1] Baton docs" })).toExist(),
      Scene.expect(Scene.role("link", { name: "[2] Effect runtime" })).toExist(),
      Scene.expect(Scene.text("Used 2 sources")).toExist(),
      Scene.expect(Scene.role("link", { name: /Baton docs/ })).toExist(),
      Scene.expect(Scene.role("link", { name: /Effect runtime/ })).toExist(),
    )
  })

  test("assistant reasoning renders in the collapsible reasoning block", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Idle(),
          entries: [
            Chat.UserEntry({ text: "What makes Baton standalone?" }),
            Chat.AssistantEntry({
              text: "Baton runs a non-durable Effect agent loop.",
              reasoning: "Compare transport frames. Check the loop state.",
            }),
          ],
        },
        expandedToolCallIds: ["reasoning-1"],
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.expect(Scene.text("Thought for a few seconds")).toExist(),
      Scene.expect(Scene.text("Compare transport frames. Check the loop state.")).toExist(),
    )
  })

  test("expanded tool output is bounded", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Idle(),
          entries: [
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "baton standalone" },
              phase: "executing",
              outcome: {
                _tag: "Completed",
                isFailure: false,
                result: {
                  results: [{ title: "Baton docs", url: "https://baton.test/docs", snippet: "x".repeat(400) }],
                },
              },
              progress: [],
            }),
          ],
        },
        expandedToolCallIds: ["search-1"],
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.tap(({ html }) => {
        const outputPre = Scene.find(html, '[data-slot="tool-output"] pre')
        expect(Option.isSome(outputPre)).toBe(true)
        if (Option.isSome(outputPre)) {
          expect(Option.getOrElse(Scene.attr(outputPre.value, "class"), () => "")).toContain("max-h-72")
        }
      }),
    )
  })

  test("failed state renders the run failure and keeps retry input available", () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...baseModel(),
        chat: {
          ...baseModel().chat,
          run: Chat.Failed({ message: "model unavailable" }),
          draft: "retry later",
        },
      }),
      resolveScrollerMounts,
      resolveScrollerCommand,
      Scene.expect(Scene.role("alert")).toContainText("Run failed: model unavailable"),
      Scene.expect(Scene.placeholder("Ask a research question…")).toExist(),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeEnabled(),
    )
  })
})
