import compactionLayer from "../../snippets/guides/compaction/compaction-layer.ts?raw"
import trimMiddleware from "../../snippets/guides/compaction/trim-middleware.ts?raw"
import truncateOnly from "../../snippets/guides/compaction/truncate-only.ts?raw"
import * as Prose from "../../prose"

export const compaction = Prose.definePage({
  path: "/docs/guides/compaction",
  title: "How to stay inside the context window",
  navTitle: "Compaction",
  group: "Guides",
  description:
    "Provide Compaction.layer to microcompact tool outputs and summarize old history into checkpoints, or truncate with a Tokenizer.",
  content: [
    Prose.p(
      "Compaction is optional: when a ",
      Prose.code("Compaction"),
      " layer is present, the loop consults it before model turns and once more after a context-overflow failure. The default strategy works in two stages: first it microcompacts oversized tool outputs, and only if that is not enough does it summarize older history into a checkpoint while keeping a recent suffix verbatim.",
    ),
    Prose.h2("provide-the-layer", "1. Provide the layer and declare the window"),
    Prose.p(
      "Wire ",
      Prose.code("Compaction.layer"),
      " with your thresholds and tell the run its window via ",
      Prose.code("RunOptions.compaction.contextWindow"),
      ". Set ",
      Prose.code("toolOutputMaxBytes"),
      " so stage one has a bound to enforce:",
    ),
    Prose.codeBlock({ label: "compaction-layer.ts", source: compactionLayer }),
    Prose.table(
      ["Option", "Default", "Meaning"],
      [
        [[Prose.code("contextWindow")], ["unbounded"], ["Model context size the strategy compacts against"]],
        [[Prose.code("reserveTokens")], [Prose.code("16_384")], ["Headroom kept free for the next model response"]],
        [
          [Prose.code("keepRecentTokens")],
          [Prose.code("20_000")],
          ["Recent history kept verbatim past the summary cut"],
        ],
        [[Prose.code("summaryModel")], ["the run's model"], ["Dedicated model layer for summary calls"]],
        [[Prose.code("summaryPrompt")], [Prose.code("SUMMARY_TEMPLATE")], ["Prompt for the summary call"]],
      ],
    ),
    Prose.h2("how-it-cuts", "2. Know what the summarize stage needs"),
    Prose.p(
      "The summarize stage cuts along session entries, so it activates when a ",
      Prose.code("SessionStore"),
      " is in context supplying the entry path; the cut never splits a tool call from its result, and the summary lands in history as a ",
      Prose.code("<conversation-checkpoint>"),
      " user message while a ",
      Prose.code("Compaction"),
      " entry records it in the session log. Without a session store, microcompaction still bounds tool outputs. ",
      Prose.link("/docs/learn/sessions-and-history", "Sessions, history, and persistence"),
      " covers the entry log.",
    ),
    Prose.callout(
      "info",
      "Reactive compaction",
      "When a model call fails with a context-overflow error (classified by ",
      Prose.code("Compaction.isContextOverflow"),
      "), the loop re-consults the service with ",
      Prose.code("overflow: true"),
      " and retries the turn once with the compacted prompt.",
    ),
    Prose.h2("truncate-only", "3. Truncate when summaries are not worth a model call"),
    Prose.p(
      Prose.code("Compaction.truncate(maxTokens)"),
      " is a strategy that cuts the oldest messages with the ambient ",
      Prose.code("Ai.Tokenizer"),
      " instead of summarizing: no extra model call, no session store needed. Provide it as the implementation of the same seam:",
    ),
    Prose.codeBlock({ label: "truncate-only.ts", source: truncateOnly }),
    Prose.h2("recipe-trim-middleware", "Recipe: context-truncation middleware"),
    Prose.p(
      "For a cheap local bound before the model ever sees the prompt (independent of session history), trim inside a ",
      Prose.code("ModelMiddleware.transformPrompt"),
      " hook. Use middleware for per-turn input hygiene and keep ",
      Prose.code("Compaction"),
      " for anything that must understand cut points and summaries:",
    ),
    Prose.codeBlock({ label: "trim-middleware.ts", source: trimMiddleware }),
    Prose.p(
      "The two compose: middleware trims nonessential user text every turn, ",
      Prose.code("Compaction.layer"),
      " handles long-running session growth. ",
      Prose.link("/docs/guides/middleware", "How to add guardrails, middleware, and retries"),
      " covers the middleware chain contract.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Cap runs that should end rather than compact: ",
        Prose.link("/docs/guides/turn-policy", "How to control turn budgets"),
        ".",
      ],
      [
        "Bound tool outputs at the source: ",
        Prose.link("/docs/guides/define-tools", "How to define tools and toolkits"),
        ".",
      ],
    ),
  ],
})
