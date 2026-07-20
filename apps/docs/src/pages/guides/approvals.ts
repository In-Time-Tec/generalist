import approvalsLayer from "../../snippets/guides/approvals/approvals-layer.ts?raw"
import needsApprovalTool from "../../snippets/guides/approvals/needs-approval-tool.ts?raw"
import suspendAndResume from "../../snippets/guides/approvals/suspend-and-resume.ts?raw"
import suspendAndResumeExpected from "../../snippets/guides/approvals/suspend-and-resume.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const approvals = definePage({
  path: "/docs/guides/approvals",
  title: "How to require human approval for a tool",
  navTitle: "Approvals",
  group: "Guides",
  description:
    "Mark a tool needsApproval, decide with the Approvals service, catch AgentSuspended, and re-enter the run with RunOptions.resume.",
  content: [
    p(
      "To put a human between the model and a dangerous tool call, mark the tool ",
      code("needsApproval"),
      " and provide an ",
      code("Approvals"),
      " layer that answers for your host. When the answer cannot arrive in-process, the run suspends with a token and you re-enter it later. ",
      link("/docs/learn/suspension", "Suspension as a typed error"),
      " explains the contract this guide exercises.",
    ),
    h2("mark-the-tool", "1. Mark the tool as needing approval"),
    p(
      "Set ",
      code("needsApproval: true"),
      " on the tool. For call-dependent gating, pass a predicate ",
      code("(params, context) => boolean"),
      " instead; it runs before every call to that tool.",
    ),
    codeBlock({ label: "needs-approval-tool.ts", source: needsApprovalTool }),
    h2("provide-approvals", "2. Provide an Approvals layer"),
    p(
      "The loop asks ",
      code("Approvals.resolve"),
      " before executing an ask-level or gated call. Answer with one of three resolutions: ",
      code("Approved"),
      " executes the call, ",
      code("Denied"),
      " returns a failed tool result to the model (with your ",
      code("reason"),
      "), and ",
      code("Pending"),
      " suspends the run with a token you mint:",
    ),
    codeBlock({ label: "approvals-layer.ts", source: approvalsLayer }),
    callout(
      "info",
      "Defaults",
      "Runs always have concrete defaults. Use ",
      code("Approvals.layerAutoApprove"),
      " (the default) when nothing needs approval and ",
      code("Approvals.layerDenyAll"),
      " for lockdown or tests.",
    ),
    h2("catch-and-resume", "3. Catch AgentSuspended and resume"),
    p(
      "A ",
      code("Pending"),
      " resolution fails the run with ",
      code("AgentSuspended"),
      ", carrying the token plus the pending call's id, name, and params. Store those, resolve the approval out-of-band, then re-enter with ",
      code("RunOptions.resume"),
      ". The resumed run executes the approved call first, then continues under the normal turn policy:",
    ),
    codeBlock({
      label: "suspend-and-resume.ts",
      source: suspendAndResume,
      expectedOutput: suspendAndResumeExpected,
    }),
    p(
      "Gates are consulted again on re-entry, so the resumed run must carry an ",
      code("Approvals"),
      " layer that now answers ",
      code("Approved"),
      " (in a real host, from the stored approval record for that token).",
    ),
    h2("over-the-wire", "4. Move the decision over the wire"),
    p(
      "In a served agent, the suspension travels to the client as a ",
      code("Suspended"),
      " frame and the client answers with ",
      code("ResolveApproval"),
      ": the token round-trips, and the registry resumes the run for you. ",
      link("/docs/guides/serve-transport", "How to serve an agent over SSE and WebSocket"),
      " wires it; ",
      link("/docs/guides/foldkit-chat", "How to build a chat UI with FoldKit"),
      " renders the approve and deny buttons.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Decide by pattern before the approval gate: ",
        link("/docs/guides/permissions", "How to gate tools with permission rules"),
        ".",
      ],
      [
        "Understand the token and re-entry contract: ",
        link("/docs/learn/suspension", "Suspension as a typed error"),
        ".",
      ],
    ),
  ],
})
