import composePolicies from "../../snippets/guides/turn-policy/compose-policies.ts?raw"
import overrideTurns from "../../snippets/guides/turn-policy/override-turns.ts?raw"
import tokenBudget from "../../snippets/guides/turn-policy/token-budget.ts?raw"
import turnLimit from "../../snippets/guides/turn-policy/turn-limit.ts?raw"
import turnLimitExpected from "../../snippets/guides/turn-policy/turn-limit.expected.txt?raw"
import * as Prose from "../../prose"

export const turnPolicy = Prose.definePage({
  path: "/docs/guides/turn-policy",
  title: "How to control turn budgets",
  navTitle: "Turn policy",
  group: "Guides",
  description:
    "Bound follow-up turns with recurs and untilToolCall, compose policies with both, and apply per-turn overrides from decision.continue.",
  content: [
    Prose.p(
      "A ",
      Prose.code("TurnPolicy"),
      " is a plain value on the agent that decides, after each turn with pending tool results, whether the loop runs again. Turn 0 always runs; the policy only gates follow-ups. The default is ",
      Prose.code("TurnPolicy.recurs(8)"),
      ". ",
      Prose.link("/docs/learn/agent-loop", "The agent loop"),
      " explains where the decision point sits.",
    ),
    Prose.h2("pick-and-compose", "1. Pick a policy and compose constraints"),
    Prose.p(
      "Use ",
      Prose.code("TurnPolicy.recurs(n)"),
      " for a fixed cap, ",
      Prose.code("TurnPolicy.untilToolCall(name)"),
      " to stop once a named tool has produced a result, and ",
      Prose.code("TurnPolicy.both"),
      " to require that two policies agree:",
    ),
    Prose.codeBlock({ label: "compose-policies.ts", source: composePolicies }),
    Prose.h2("observe-the-stop", "2. Observe what happens at the limit"),
    Prose.p(
      "When the policy stops while tool results are still pending, the run fails with ",
      Prose.code("TurnLimitExceeded"),
      " carrying the pending calls, because the loop refuses to silently drop work:",
    ),
    Prose.codeBlock({ label: "turn-limit.ts", source: turnLimit, expectedOutput: turnLimitExpected }),
    Prose.h2("override-per-turn", "3. Override instructions, model, or tools per turn"),
    Prose.p(
      "To steer late turns rather than end them, return ",
      Prose.code("TurnPolicy.decision.continue(overrides)"),
      " from a custom policy. Overrides apply to the next turn only: ",
      Prose.code("instructions"),
      " replaces the system message, ",
      Prose.code("model"),
      " swaps the model layer, and ",
      Prose.code("activeTools"),
      " narrows the advertised toolkit:",
    ),
    Prose.codeBlock({ label: "override-turns.ts", source: overrideTurns }),
    Prose.p(
      "Under ",
      Prose.code("TurnPolicy.both"),
      ", both policies must continue and the second policy's overrides win field by field.",
    ),
    Prose.h2("recipe-token-budget", "Recipe: a token-budget policy"),
    Prose.p(
      "Policies receive the full history each decision, so a budget policy stays a plain value: estimate the context size and stop when it exceeds your budget. If the estimate should come from provider metadata, read that metadata before constructing the agent so the loop's service set stays unchanged:",
    ),
    Prose.codeBlock({ label: "token-budget.ts", source: tokenBudget }),
    Prose.callout(
      "info",
      "Budgets versus compaction",
      "A token-budget policy ends the run; compaction keeps it going by shrinking context. For long sessions, prefer ",
      Prose.link("/docs/guides/compaction", "compaction"),
      " and keep the policy as a safety cap.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Shrink context instead of stopping: ",
        Prose.link("/docs/guides/compaction", "How to stay inside the context window"),
        ".",
      ],
      [
        "Inject user input between turns: ",
        Prose.link("/docs/guides/steering", "How to steer and interrupt a running agent"),
        ".",
      ],
    ),
  ],
})
