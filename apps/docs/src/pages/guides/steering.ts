import queueModes from "../../snippets/guides/steering/queue-modes.ts?raw"
import queueModesExpected from "../../snippets/guides/steering/queue-modes.expected.txt?raw"
import steerAndFollowUp from "../../snippets/guides/steering/steer-and-follow-up.ts?raw"
import steerAndFollowUpExpected from "../../snippets/guides/steering/steer-and-follow-up.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../prose"
export const steering = definePage({
  path: "/docs/guides/steering",
  title: "How to steer and interrupt a running agent",
  navTitle: "Steer a running agent",
  group: "Guides",
  description:
    "Inject prompts into a live run through the Steering seam's two queues, and cancel runs with Effect interruption.",
  content: [
    p(
      code("Steering"),
      " is the optional in-process seam for injecting prompts into an active run. It holds two independent FIFO queues with different drain points: ",
      code("steer"),
      " messages are seen before the next model turn after tool results, and ",
      code("followUp"),
      " messages are seen only when the run would otherwise complete. Like every optional seam, the agent discovers it with ",
      code("Effect.serviceOption"),
      ", and absent means unchanged behavior (",
      link("/docs/learn/seams-as-services", "Seams as services"),
      ").",
    ),
    h2("provide-the-layer-and-queue-messages", "1. Provide the layer and queue messages"),
    p(
      "To steer a run, provide ",
      code("Steering.layer()"),
      " alongside the run's model/tool layers and queue messages on the same service instance the run sees. The scripted model below calls a tool on turn 0, so the steered prompt lands before turn 1 and the follow-up starts one extra turn at the end.",
    ),
    codeBlock({
      label: "steer-and-follow-up.ts",
      source: steerAndFollowUp,
      expectedOutput: steerAndFollowUpExpected,
    }),
    bullets(
      [
        "Turn 0 always runs with the original prompt; steering never rewrites input that is already in flight. The drain points are turn boundaries (",
        link("/docs/learn/agent-loop", "The agent loop"),
        ").",
      ],
      [
        "Steered prompts are prepended before the pending tool results, so middleware and the model see one composed prompt.",
      ],
      [
        "A non-empty follow-up queue starts another normal turn instead of completing, which is why the run reports three turns.",
      ],
      [
        code("TurnPolicy"),
        " still gates follow-up turns; steering does not bypass the cap (",
        link("/docs/guides/turn-policy", "How to control turn budgets"),
        ").",
      ],
    ),
    h2("choose-queue-modes", "2. Choose queue modes"),
    p(
      "Each queue drains in one of two modes. The defaults differ because steering corrections compose, while follow-up tasks usually deserve one turn each.",
    ),
    table(
      ["Queue", "Drain point", "Default mode"],
      [
        [
          [code("steer")],
          ["after tool results, before the next model turn"],
          [code('"all"'), ": every buffered message, FIFO"],
        ],
        [
          [code("followUp")],
          ["when the run would otherwise complete"],
          [code('"one-at-a-time"'), ": at most one message per boundary"],
        ],
      ],
    ),
    codeBlock({ label: "queue-modes.ts", source: queueModes, expectedOutput: queueModesExpected }),
    callout(
      "info",
      "Per-run isolation",
      code("Steering.layer()"),
      " is service-scoped, not run-scoped. If several runs share one layer they share the queues, so hosts that need isolation provide one layer per active run or session.",
    ),
    h2("interrupt-a-run", "3. Interrupt a run"),
    p(
      "There is no second abort API: interrupting the run's fiber with ordinary Effect interruption cancels the live model stream and any scoped tool execution. Undrained steering and follow-up messages stay in the layer after interruption, so the host decides whether to reuse or discard them on the next run.",
    ),
    p(
      "Use steering for soft in-run guidance. For hard gates on what an agent may do, use ",
      link("/docs/guides/approvals", "approvals"),
      " and ",
      link("/docs/guides/permissions", "permission rules"),
      ".",
    ),
  ],
})
