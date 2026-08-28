import composePolicies from "virtual:source/src/snippets/guides/agent/turn-policy/compose-policies.ts"
import overrideTurns from "virtual:source/src/snippets/guides/agent/turn-policy/override-turns.ts"
import tokenBudget from "virtual:source/src/snippets/guides/agent/turn-policy/token-budget.ts"
import turnLimit from "virtual:source/src/snippets/guides/agent/turn-policy/turn-limit.ts"
import turnLimitExpected from "virtual:source/src/snippets/guides/agent/turn-policy/turn-limit.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../../prose"
export const turnPolicy = definePage({
  path: "/docs/guides/turn-policy",
  title: "How to control turn budgets",
  navTitle: "Turn policy",
  group: "Guides",
  description:
    "Bound follow-up turns with recurs and untilToolCall, compose policies with both, and apply per-turn overrides from decision.continue.",
  content: [
    p(
      "A ",
      code("TurnPolicy"),
      " is a plain value on the agent that decides, after each turn with pending tool results, whether the loop runs again. Turn 0 always runs; the policy only gates follow-ups. The default is ",
      code("TurnPolicy.forever"),
      ": no framework-imposed follow-up cap, so a finite cap like ",
      code("TurnPolicy.recurs(8)"),
      " is an explicit choice. ",
      link("/docs/learn/agent-loop", "The agent loop"),
      " explains where the decision point sits.",
    ),
    h2("pick-and-compose", "1. Pick a policy and compose constraints"),
    p(
      "Use ",
      code("TurnPolicy.recurs(n)"),
      " for a fixed cap, ",
      code("TurnPolicy.untilToolCall(name)"),
      " to stop once a named tool has produced a result, and ",
      code("TurnPolicy.both"),
      " to require that two policies agree:",
    ),
    codeBlock({ label: "compose-policies.ts", source: composePolicies }),
    h2("observe-the-stop", "2. Observe what happens at the limit"),
    p(
      "When a configured recurrence cap stops while tool results are still pending, the run fails with ",
      code("TurnLimitExceeded"),
      ". Other successful stops fail with ",
      code("TurnPolicyStopped"),
      " carrying the exact reason. Both carry the pending calls because the loop refuses to silently drop work:",
    ),
    codeBlock({ label: "turn-limit.ts", source: turnLimit, expectedOutput: turnLimitExpected }),
    h2("override-per-turn", "3. Override instructions, model, or tools per turn"),
    p(
      "To steer late turns rather than end them, return ",
      code("TurnPolicy.decision.continue(overrides)"),
      " from a custom policy. Overrides are selected for the next model call: ",
      code("instructions"),
      " prepends a system message that remains in chat history, ",
      code("model"),
      " swaps the model layer for that call, and ",
      code("activeTools"),
      " narrows the toolkit for that call:",
    ),
    codeBlock({ label: "override-turns.ts", source: overrideTurns }),
    p(
      "Under ",
      code("TurnPolicy.both"),
      ", both policies must continue and the second policy's overrides win field by field.",
    ),
    h2("recipe-token-budget", "Recipe: a token-budget policy"),
    p(
      "Policies receive the full history each decision and may require Effect services. The policy's requirements remain visible in the Agent run type, and expected evaluation failures use TurnPolicyError. This pure budget recipe estimates the context size and stops with an explicit BudgetExhausted reason:",
    ),
    codeBlock({ label: "token-budget.ts", source: tokenBudget }),
    callout(
      "info",
      "Budgets versus compaction",
      "A token-budget policy ends the run; compaction keeps it going by shrinking context. For long sessions, prefer ",
      link("/docs/guides/compaction", "compaction"),
      " and keep the policy as a safety cap.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Shrink context instead of stopping: ",
        link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
      [
        "Inject user input between turns: ",
        link("/docs/guides/steering", "How to steer and interrupt a running agent"),
        ".",
      ],
    ),
  ],
})
