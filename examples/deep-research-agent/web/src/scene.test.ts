// @vitest-environment happy-dom

import { Chat } from "generalist/foldkit"
import { Option, Schema } from "effect"
import { Scene } from "foldkit"
import type { Html } from "foldkit/html"
import { describe, expect, test } from "vitest"
import {
  CompletedScrollToBottom,
  GrewContent,
  ObserveContentGrowth,
  ScrollToBottom,
  ScrolledViewport,
  TrackViewportScroll,
} from "./components/ui/message-scroller"
import { GotScrollerMessage, SessionReady, init, type Model, update, view } from "./main"

const baseModel = (): Model =>
  Object.assign({}, init()[0], {
    session: SessionReady(),
    chat: Object.assign({}, Chat.initialModel("deep-research-scene"), { connection: "open" as const }),
  })

const renderedText = (node: Html | string): string => {
  if (Schema.is(Schema.String)(node)) return node
  if (node === null) return ""
  const text = node.text ?? ""
  const children = node.children?.map((child) => renderedText(child)).join("") ?? ""
  return `${text}${children}`
}

const resolveViewportMount = Scene.Mount.resolve(
  // SAFETY: the resolver supplies the parent message that maps this child mount's output into GotScrollerMessage.
  TrackViewportScroll as Scene.AnyMount,
  GotScrollerMessage({ message: ScrolledViewport({ isAtBottom: true }) }),
)
const resolveContentMount = Scene.Mount.resolve(
  // SAFETY: the resolver supplies the parent message that maps this child mount's output into GotScrollerMessage.
  ObserveContentGrowth as Scene.AnyMount,
  GotScrollerMessage({ message: GrewContent() }),
)

const resolveScrollerCommand = Scene.Command.resolve(ScrollToBottom, CompletedScrollToBottom())

describe("deep-research-agent web view", () => {
  test("idle state renders the prompt and enables submit after draft text", () => {
    Scene.scene(
      { update, view },
      Scene.given(baseModel()),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.expect(Scene.text("Ask a research question")).toExist(),
      Scene.expect(Scene.placeholder("Ask a research question…")).toExist(),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeDisabled(),
      Scene.type(Scene.placeholder("Ask a research question…"), "generalist agents"),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeEnabled(),
    )
  })

  test("running state renders a pending expanded tool card with the query", () => {
    Scene.scene(
      { update, view },
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Running({ turn: 0 }),
          entries: [
            Chat.UserEntry({ text: "What makes Generalist standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "generalist standalone" },
              phase: "executing",
              outcome: { _tag: "Pending" },
              progress: [],
            }),
          ],
        }),
        expandedToolCallIds: ["search-1"],
      }),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.expect(Scene.text("web_search")).toExist(),
      Scene.expect(Scene.text("Running")).toExist(),
      Scene.expect(Scene.text("Parameters")).toExist(),
      Scene.tap(({ html }) => {
        expect(renderedText(html)).toContain('"query": "generalist standalone"')
      }),
      Scene.expect(Scene.text("Thinking…")).toExist(),
    )
  })

  test("running state wires the Stop button to the existing cancel command", () => {
    Scene.scene(
      { update, view },
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Running({ turn: 0 }),
          entries: [Chat.UserEntry({ text: "What makes Generalist standalone?" })],
        }),
      }),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.expect(Scene.role("button", { name: "Stop" })).toBeEnabled(),
      Scene.click(Scene.role("button", { name: "Stop" })),
      Scene.Command.expectExact(Chat.CancelRun({ sessionId: "deep-research-scene" })),
      Scene.Command.resolve(Chat.CancelRun({ sessionId: "deep-research-scene" }), Chat.CancelledRun()),
    )
  })

  test("completed state renders the final answer and expanded source links", () => {
    Scene.scene(
      { update, view },
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Idle(),
          entries: [
            Chat.UserEntry({ text: "What makes Generalist standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "generalist standalone" },
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
            Chat.AssistantEntry({ text: "Final cited answer\n\nSources:\n[1] Generalist docs", reasoning: null }),
          ],
        }),
        expandedToolCallIds: ["search-1-sources"],
      }),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.tap(({ html }) => {
        expect(renderedText(html)).toContain("Final cited answer")
      }),
      Scene.expect(Scene.role("link", { name: "[1] Generalist docs" })).toExist(),
      Scene.expect(Scene.role("link", { name: "[2] Effect runtime" })).toExist(),
      Scene.expect(Scene.text("Used 2 sources")).toExist(),
      Scene.expect(Scene.role("link", { name: /Generalist docs/ })).toExist(),
      Scene.expect(Scene.role("link", { name: /Effect runtime/ })).toExist(),
    )
  })

  test("assistant reasoning renders in the collapsible reasoning block", () => {
    Scene.scene(
      { update, view },
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Idle(),
          entries: [
            Chat.UserEntry({ text: "What makes Generalist standalone?" }),
            Chat.AssistantEntry({
              text: "Generalist runs a non-durable Effect agent loop.",
              reasoning: "Compare transport frames. Check the loop state.",
            }),
          ],
        }),
        expandedToolCallIds: ["reasoning-1"],
      }),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.expect(Scene.text("Thought for a few seconds")).toExist(),
      Scene.expect(Scene.text("Compare transport frames. Check the loop state.")).toExist(),
    )
  })

  test("expanded tool output is bounded", () => {
    Scene.scene(
      { update, view },
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Idle(),
          entries: [
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "generalist standalone" },
              phase: "executing",
              outcome: {
                _tag: "Completed",
                isFailure: false,
                result: {
                  results: [
                    { title: "Generalist docs", url: "https://generalist.test/docs", snippet: "x".repeat(400) },
                  ],
                },
              },
              progress: [],
            }),
          ],
        }),
        expandedToolCallIds: ["search-1"],
      }),
      resolveViewportMount,
      resolveContentMount,
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
      Scene.given({
        ...baseModel(),
        chat: Object.assign({}, baseModel().chat, {
          run: Chat.Failed({ message: "model unavailable" }),
          draft: "retry later",
        }),
      }),
      resolveViewportMount,
      resolveContentMount,
      resolveScrollerCommand,
      Scene.expect(Scene.role("alert")).toContainText("Run failed: model unavailable"),
      Scene.expect(Scene.placeholder("Ask a research question…")).toExist(),
      Scene.expect(Scene.role("button", { name: "Submit" })).toBeEnabled(),
    )
  })
})
