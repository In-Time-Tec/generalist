import policyAndSend from "virtual:source/src/snippets/guides/agent/addressed-messaging/policy-and-send.ts"
import { bullets, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const inExecution = `import { Messaging } from "generalist/runtime"

// Inside an execution, Generalist resolves the sender from the current Run.
const reply = Messaging.AgentMessaging.use((messaging) =>
  messaging.send({
    to: parentAddress,
    idempotencyKey: "result-1",
    prompt: findings,
    policy: "steer",
  }),
)`

export const addressedMessaging = definePage({
  path: "/docs/guides/addressed-messaging",
  title: "How to send durable messages between agents",
  navTitle: "Addressed messaging",
  group: "Guides",
  description: "Resolve a Run, Session, or scoped name and submit through the unified durable Run inbox.",
  content: [
    p(
      code("Runtime.sendMessage"),
      " resolves an address and submits through the same durable Run inbox as ",
      code("Runtime.send"),
      ". Addressing adds name resolution and family authorization, not another admission or journal contract.",
    ),
    h2("choose-an-address", "1. Choose an address"),
    table(
      ["Address", "Names", "Resolves to"],
      [
        [[code("AgentDirectory.runAddress(runId)")], "One exact execution", "That Run"],
        [
          [code("AgentDirectory.sessionAddress(sessionId)")],
          "One agent identity across successive Runs",
          ["That session's ", code("newest"), " Run at send time"],
        ],
        [
          [code("AgentDirectory.nameAddress({ scope, name })")],
          "A host-assigned friendly name",
          "The Run bound to that name inside its scope",
        ],
      ],
    ),
    p(
      "Two session-addressed sends can resolve to different Runs if a new Run starts between them. Use ",
      code("runAddress"),
      " when the exact execution matters. Parsing an address never grants authority; durable records own identity and parentage.",
    ),
    h2("authorize", "2. Authorize the pair"),
    p(
      "Generalist always allows a Run to message itself, its parent, direct children, and siblings. Everything else fails with ",
      code("NotInFamily"),
      " unless the host's directional ",
      code("MessagingPolicy.allow"),
      " permits that exact pair.",
    ),
    codeBlock({ label: "policy-and-send.ts", source: policyAndSend }),
    bullets(
      ["Policy only widens the built-in family relationships."],
      ["The sender and target passed to policy come from durable Run records."],
      ["Policy-discovered addresses are authorized again before appearing in the directory."],
    ),
    h2("send", "3. Send through one inbox"),
    p(
      code("Runtime.sendMessage"),
      " takes ",
      code("fromRunId"),
      ", not a sender address, so callers cannot forge Run identity. The ambient service enforces the same rule inside an execution.",
    ),
    codeBlock({ label: "Sending from inside an execution", source: inExecution }),
    p(
      "An identical retry returns the original ",
      code("{ messageId, entryId, sequence, duplicate }"),
      " receipt. Different content under the same target Run and idempotency key fails ",
      code("SteeringConflict"),
      ". Count or byte exhaustion fails ",
      code("InboxFull"),
      ".",
    ),
    p(
      "Every accepted message appends ",
      code("Inbox { message, policy, from }"),
      " with its pending row before delivery. Reopening reconstructs that inbox from the journal without dispatching the message again.",
    ),
    h2("delivery", "4. Choose delivery timing"),
    p(
      code("policy"),
      " accepts ",
      code("steer"),
      ", ",
      code("enqueue"),
      ", ",
      code("interrupt"),
      ", ",
      code("rollback"),
      ", or ",
      code("reject"),
      ". Consumption with the next model operation is the acknowledgement; listing the inbox does not consume entries.",
    ),
    p(
      "See ",
      link("/docs/guides/steering", "How to steer a run"),
      " for exact policy semantics and ",
      link("/docs/reference/runtime", "the generalist/runtime reference"),
      " for the surrounding Run lifecycle.",
    ),
  ],
})
