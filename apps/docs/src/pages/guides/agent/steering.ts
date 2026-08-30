import queueModes from "virtual:source/src/snippets/guides/agent/steering/queue-modes.ts"
import queueModesExpected from "virtual:source/src/snippets/guides/agent/steering/queue-modes.expected.txt"
import steerAndFollowUp from "virtual:source/src/snippets/guides/agent/steering/steer-and-follow-up.ts"
import steerAndFollowUpExpected from "virtual:source/src/snippets/guides/agent/steering/steer-and-follow-up.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"
export const steering = definePage({
  path: "/docs/guides/steering",
  title: "How to steer and interrupt a running agent",
  navTitle: "Steer a running agent",
  group: "Guides",
  description:
    "Inject prompts into one live Run through its scoped handle, and cancel process-local work with Effect interruption.",
  content: [
    p(
      code("Agent.makeRun"),
      " allocates one scoped process-local RunHandle with two finite FIFO lanes: ",
      code("steer"),
      " inputs are seen before the next model turn after tool results, and ",
      code("followUp"),
      " inputs are seen only when the Run would otherwise complete. The handle exposes offers and events; only that Run's loop can dequeue input.",
    ),
    h2("make-a-run-and-queue-inputs", "1. Make a Run and queue inputs"),
    p(
      "Create the handle before consuming ",
      code("run.events"),
      ", then offer inputs through ",
      code("run.steer"),
      " and ",
      code("run.followUp"),
      ". The scripted model below calls a tool on turn 0, so the correction lands before turn 1 and the follow-up starts one extra turn at the end.",
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
        "Checkpointed tool results enter the transcript before steered prompts, so middleware and the model see one ordered composed prompt.",
      ],
      [
        "A non-empty follow-up queue starts another normal turn instead of completing, which is why the run reports three turns.",
      ],
      [
        "Every non-empty drain emits ",
        code("SteeringDrained"),
        " after ",
        code("TurnCompleted"),
        " and before the next ",
        code("TurnStarted"),
        ".",
      ],
      [
        code("TurnPolicy"),
        " still gates follow-up turns; steering does not bypass the cap (",
        link("/docs/guides/turn-policy", "How to control turn budgets"),
        ").",
      ],
    ),
    callout(
      "info",
      "Run identity, not Session identity",
      code("run.runId"),
      " addresses the inbox. Concurrent Runs may share a Session while keeping separate controls. The handle closes admission when its Run completes, fails, is interrupted, or leaves scope.",
    ),
    h2("choose-queue-policies", "2. Choose queue policies"),
    p(
      "The defaults differ because steering corrections compose, while follow-up tasks usually deserve one turn each. Each lane accepts at most 64 entries by default, and both lanes share a 1 MiB encoded-prompt bound.",
    ),
    table(
      ["Queue", "Drain point", "Default mode"],
      [
        [
          [code("steer")],
          ["after tool results, before the next model turn"],
          [code('"all"'), ": every buffered input, FIFO"],
        ],
        [
          [code("followUp")],
          ["when the run would otherwise complete"],
          [code('"one-at-a-time"'), ": at most one input per boundary"],
        ],
      ],
    ),
    codeBlock({ label: "queue-modes.ts", source: queueModes, expectedOutput: queueModesExpected }),
    p(
      "Set policy under ",
      code("RunOptions.steering"),
      ". ",
      code('onFull: "fail"'),
      " is the default and rejects without partial admission as typed ",
      code("Steering.InboxFull"),
      ". ",
      code('onFull: "backpressure"'),
      " waits interruptibly for that lane to drain. Run closure wakes a waiting producer with ",
      code("Steering.RunClosed"),
      ". Capacities and byte limits must be positive safe integers; there is no unbounded or silent-drop mode.",
    ),
    callout(
      "info",
      "Process-local versus durable",
      "A Core RunHandle does not promise replay after interruption or process loss. Use Runtime.steer for a durable idempotency key, restart-safe reads, atomic consume-with-model-operation behavior, and terminal disposition. Runtime targets an exact Run ID and uses the same 64-entry and 1 MiB fail-fast defaults.",
    ),
    h2("interrupt-a-run", "3. Interrupt a run"),
    p(
      "There is no second abort API: interrupting the event-stream fiber with ordinary Effect interruption cancels the live model stream and scoped tool execution. The Run closes both lanes, discards undrained process-local input, and wakes backpressured producers. No input can leak into another Run.",
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
