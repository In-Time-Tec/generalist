import policyAndSend from "virtual:source/src/snippets/guides/agent/addressed-messaging/policy-and-send.ts"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const inExecution = `import { Messaging } from "generalist/runtime"

// Inside an execution: the sender is the running Run, resolved from its own record.
const reply = Messaging.AgentMessaging.use((messaging) =>
  messaging.send({
    to: parentAddress,
    idempotencyKey: "result-1",
    prompt: findings,
  }),
)`

export const addressedMessaging = definePage({
  path: "/docs/guides/addressed-messaging",
  title: "How to send durable messages between agents",
  navTitle: "Addressed messaging",
  group: "Guides",
  description:
    "Address a Run, a Session, or a name; widen authorization with one host policy; and understand why steering consumption is the ack.",
  content: [
    p(
      code("generalist/runtime"),
      " owns durable agent-to-agent messaging: a directory of addressable Runs, a per-target durable inbox, delivery through the existing steering boundary, and one durable ",
      code("send"),
      " operation. Applications supply only the policy for addressing beyond Generalist's derived relationships.",
    ),
    h2("choose-an-address", "1. Choose an address"),
    table(
      ["Address", "Names", "Resolves to"],
      [
        [[code("AgentDirectory.runAddress(runId)")], "One exact execution", "That Run"],
        [
          [code("AgentDirectory.sessionAddress(sessionId)")],
          "One agent identity across its successive Runs",
          ["That session's ", code("newest"), " Run, ordered by created-at then Run id descending"],
        ],
        [
          [code("AgentDirectory.nameAddress({ scope, name })")],
          "A host-assigned friendly name",
          "The Run bound to that name inside its scope",
        ],
      ],
    ),
    p(
      'A session address means "whoever currently speaks for this agent". That is the defined contract, not an implementation detail, and it has two consequences. If a host keeps several Runs alive in one session concurrently, the newest wins and the others are unaddressable by session address — address those exactly with ',
      code("runAddress"),
      ". And because resolution happens at send time, two sends moments apart can land on different Runs if a new Run started in between. Both still land in the one durable inbox for that session, which is keyed by session rather than by Run, so a handover neither loses, reorders, nor splits an inbox.",
    ),
    p(
      "An Address states which directory table to read. It never carries authority: identity, parentage, and session membership are read from the durable Run record, and nothing is derived by parsing an id.",
    ),
    h2("authorize", "2. Authorize the pair"),
    p(
      "Generalist derives ",
      code("self"),
      ", ",
      code("parent"),
      ", ",
      code("child"),
      ", and ",
      code("sibling"),
      " from durable parent links only, and always allows those four. Everything else — including addressing another Session — is refused with ",
      code("MessagingUnauthorized"),
      " carrying ",
      code("unrelated"),
      ", ",
      code("cross-session"),
      ", or ",
      code("policy"),
      ", unless one host policy allows that exact pair.",
    ),
    codeBlock({ label: "policy-and-send.ts", source: policyAndSend }),
    bullets(
      ["Policy only ever widens: Generalist's four relationships are checked first."],
      ["Policy is directional. Allowing A→B does not allow B→A."],
      [
        "The pair passed to ",
        code("allow"),
        " is read from durable Run records, never from caller-supplied text, so a policy can trust ",
        code("sessionId"),
        " and ",
        code("parentRunId"),
        " when deciding.",
      ],
      [
        "Each address ",
        code("discover"),
        " announces is still put through ",
        code("allow"),
        " before it is listed, and the sender itself is never listed.",
      ],
    ),
    h2("send", "3. Send"),
    p(
      code("Runtime.sendMessage"),
      " takes ",
      code("fromRunId"),
      ", not a sender Address: Generalist resolves the sender from its Run record, so cell code cannot forge ",
      code("from"),
      ". Inside an execution the same rule holds through the ambient context.",
    ),
    codeBlock({ label: "Sending from inside an execution", source: inExecution }),
    p(
      "Admission is idempotent on target session, message id, and idempotency key: a replay returns the original receipt with ",
      code("duplicate: true"),
      ", and the same identity carrying a different payload fails ",
      code("MessageConflict"),
      ". Bounds are enforced at admission so a sender learns immediately rather than discovering silent loss — ",
      code("MailboxFull"),
      " for the pending-count and pending-byte limits, ",
      code("MailboxRateLimited"),
      " for the per-window limit, configured with ",
      code("mailboxBounds"),
      ". A message to a terminal target fails ",
      code("RunTerminal"),
      ".",
    ),
    p(
      "Each target has one total order, which preserves per-sender FIFO within it. Messaging inside an execution goes through one durable ",
      code("send"),
      " operation with ",
      code('replayPolicy: "never"'),
      ", so a crash between the journal record and the mailbox insert is ",
      code("Unknown"),
      " and is never blindly replayed.",
    ),
    h2("delivery", "4. Understand delivery"),
    p(
      "Delivery reuses steering rather than adding a second mechanism. Each pending entry is bound to the target Run's steering inbox, and the agent loop drains steering only at a turn boundary, consuming the observed batch atomically with the next model operation checkpoint. A message admitted while a model turn is streaming never interrupts that turn; it lands in the next one. A message for an idle or terminal target stays pending and is taken by that session's next Run.",
    ),
    callout(
      "warning",
      "There is no ack call",
      "The contract is consumption-acked: at-least-once bind, exactly-once consume. Binding is not delivery. A Run that takes a message and then reaches succeeded, failed, or cancelled without consuming it returns that message to pending for the session's next Run. Consumption happens in the same commit as the model operation, so exactly-once describes the journal rather than what a model observed: a turn folds its steering into the prompt before that operation commits, and a Run that dies in between leaves the entry pending for the next Run to deliver again. Adding a separate ack would introduce a second commit point whose own failure window could lose or duplicate a message.",
    ),
    p(
      code("deliveredRunId"),
      " records which Run currently holds an entry. It is attribution and diagnostics only, never the authority for pending-ness: a filter on ",
      code("deliveredRunId"),
      " alone would strand a message on a Run that died holding it.",
    ),
    p(
      "A delivered message enters the model as ordinary user content carrying its authoritative sender, so messaging adds no competing payload vocabulary. See ",
      link("/docs/reference/runtime", "the generalist/runtime reference"),
      " for the surrounding Run lifecycle and ",
      link("/docs/guides/steering", "How to steer a run"),
      " for the boundary delivery lands on.",
    ),
  ],
})
