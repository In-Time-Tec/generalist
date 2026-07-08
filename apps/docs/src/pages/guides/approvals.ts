import approvalsLayer from "../../snippets/guides/approvals/approvals-layer.ts?raw"
import needsApprovalTool from "../../snippets/guides/approvals/needs-approval-tool.ts?raw"
import suspendAndResume from "../../snippets/guides/approvals/suspend-and-resume.ts?raw"
import suspendAndResumeExpected from "../../snippets/guides/approvals/suspend-and-resume.expected.txt?raw"
import * as Prose from "../../prose"

export const approvals = Prose.definePage({
  path: "/docs/guides/approvals",
  title: "How to require human approval for a tool",
  navTitle: "Approvals",
  group: "Guides",
  description:
    "Mark a tool needsApproval, decide with the Approvals service, catch AgentSuspended, and re-enter the run with RunOptions.resume.",
  content: [
    Prose.p(
      "To put a human between the model and a dangerous tool call, mark the tool ",
      Prose.code("needsApproval"),
      " and provide an ",
      Prose.code("Approvals"),
      " layer that answers for your host. When the answer cannot arrive in-process, the run suspends with a token and you re-enter it later. ",
      Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
      " explains the contract this guide exercises.",
    ),
    Prose.h2("mark-the-tool", "1. Mark the tool as needing approval"),
    Prose.p(
      "Set ",
      Prose.code("needsApproval: true"),
      " on the tool. For call-dependent gating, pass a predicate ",
      Prose.code("(params, context) => boolean"),
      " instead; it runs before every call to that tool.",
    ),
    Prose.codeBlock({ label: "needs-approval-tool.ts", source: needsApprovalTool }),
    Prose.h2("provide-approvals", "2. Provide an Approvals layer"),
    Prose.p(
      "The loop asks ",
      Prose.code("Approvals.check"),
      " before executing a gated call. Answer with one of three decisions: ",
      Prose.code("Approved"),
      " executes the call, ",
      Prose.code("Denied"),
      " returns a failed tool result to the model (with your ",
      Prose.code("reason"),
      "), and ",
      Prose.code("Pending"),
      " suspends the run with a token you mint:",
    ),
    Prose.codeBlock({ label: "approvals-layer.ts", source: approvalsLayer }),
    Prose.callout(
      "info",
      "Defaults",
      "Use ",
      Prose.code("Approvals.autoApprove"),
      " when nothing needs approval and ",
      Prose.code("Approvals.denyAll"),
      " for lockdown or tests. Approvals is one of the four required layers on every run.",
    ),
    Prose.h2("catch-and-resume", "3. Catch AgentSuspended and resume"),
    Prose.p(
      "A ",
      Prose.code("Pending"),
      " decision fails the run with ",
      Prose.code("AgentSuspended"),
      ", carrying the token plus the pending call's id, name, and params. Store those, resolve the approval out-of-band, then re-enter with ",
      Prose.code("RunOptions.resume"),
      ". The resumed run executes the approved call first, then continues under the normal turn policy:",
    ),
    Prose.codeBlock({
      label: "suspend-and-resume.ts",
      source: suspendAndResume,
      expectedOutput: suspendAndResumeExpected,
    }),
    Prose.p(
      "Gates are consulted again on re-entry, so the resumed run must carry an ",
      Prose.code("Approvals"),
      " layer that now answers ",
      Prose.code("Approved"),
      " (in a real host, from the stored approval record for that token).",
    ),
    Prose.h2("over-the-wire", "4. Move the decision over the wire"),
    Prose.p(
      "In a served agent, the suspension travels to the client as a ",
      Prose.code("Suspended"),
      " frame and the client answers with ",
      Prose.code("ResolveApproval"),
      ": the token round-trips, and the registry resumes the run for you. ",
      Prose.link("/docs/guides/serve-transport", "How to serve an agent over SSE and WebSocket"),
      " wires it; ",
      Prose.link("/docs/guides/foldkit-chat", "How to build a chat UI with FoldKit"),
      " renders the approve and deny buttons.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Decide by pattern before the approval gate: ",
        Prose.link("/docs/guides/permissions", "How to gate tools with permission rules"),
        ".",
      ],
      [
        "Understand the token and re-entry contract: ",
        Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
        ".",
      ],
    ),
  ],
})
