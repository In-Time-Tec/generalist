import admitAndJoin from "../../snippets/guides/child-admission/admit-and-join.ts?raw"
import journalACrossing from "../../snippets/guides/nested-operations/journal-a-crossing.ts?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../prose"

const paging = `import { SessionHistory } from "tenetkit"

// The newest page, then walk backwards until the log runs out.
let page = SessionHistory.pageHistory(path, { limit: 50 })
while (page.hasBefore) {
  page = SessionHistory.pageHistory(path, { limit: 50, before: page.firstEntryId })
}

// Paging reads the entry log, not the projection, so entries a compaction dropped from the model's
// context are still here. A checkpoint is an ordinary entry in the page, never a floor.
const checkpoints = SessionHistory.compactionCheckpoints(path)`

export const durableCompositeTools = definePage({
  path: "/docs/guides/durable-composite-tools",
  title: "How to build a durable composite tool",
  navTitle: "Composite tools",
  group: "Guides",
  description:
    "Journal each boundary a composite tool crosses, spawn children that return at admission, and page the exact entry log a compaction rewrote.",
  content: [
    p(
      "A composite tool call — a cell, an agent program step — is not one boundary crossing. It writes files, spawns children, and calls out, and a crash can land between any two of them. TenetKit journals each crossing under the outer operation's identity so the run recovers without repeating side effects.",
    ),
    h2("journal-each-crossing", "1. Journal each crossing"),
    p(
      code("NestedOperation.run(request, effect)"),
      " records one crossing before the handler runs. Identity is derived, never supplied: the ambient ",
      code("ToolContext"),
      " names the outer operation and the host assigns the ordinal, so tool or cell code cannot forge, reorder, or collide with another call's journal. The persisted key is ",
      code("<operationKey>#<ordinal>"),
      ".",
    ),
    codeBlock({ label: "journal-a-crossing.ts", source: journalACrossing }),
    table(
      ["Situation", "Outcome"],
      [
        [
          "The same identity is seen again with the same content",
          "The recorded outcome is returned; the effect does not run again",
        ],
        [
          "The same identity is seen again with different content",
          [code("NestedOperationDivergence"), " carrying the recorded and requested kind and digest"],
        ],
        [
          ["The outcome was never observed under ", code('replayPolicy: "never"')],
          [code("NestedOperationUnknown"), ", for explicit resolution rather than a silent repeat"],
        ],
        ["The host denies the declared approval", [code("NestedOperationDenied"), ", recorded as a failed operation"]],
        [
          "The host cannot settle the approval in process",
          [
            code("NestedOperationSuspended"),
            ", which ",
            code("catchSuspension"),
            " turns into the executor's ",
            code("Suspend"),
            " outcome",
          ],
        ],
      ],
    ),
    p(
      "Hosts with no durable storage use ",
      code("NestedOperation.layerDirect"),
      ": identity, duplicate return, and divergence hold for the life of the run, and approvals auto-approve because a process-local host owns no resolution seam.",
    ),
    h2("project-the-outcome", "2. Project the outcome for the host"),
    p(
      code("Render"),
      " is a host-side projection of one crossing's own outcome: the closed union of ",
      code("Artifact"),
      " (path, mime type, byte size, optional dimensions) and ",
      code("Diff"),
      " (path, patch). One progress record per status transition carries it under the ",
      code("nestedOperation"),
      " data key.",
    ),
    bullets(
      [
        "The value comes from the handler's ",
        code("render"),
        " function applied to the real result, never from the request payload, so input that plants a ",
        code("render"),
        " field cannot dictate what the host displays.",
      ],
      [
        code("running"),
        " carries no projection because there is no outcome yet, and a failed crossing carries none either.",
      ],
      [
        "A projection over ",
        code("NestedOperation.maxRenderBytes"),
        " (64 KiB) is withheld whole and reported as ",
        code("renderWithheldBytes"),
        " while the operation still succeeds: a partial diff would render as a smaller correct change rather than as a missing one.",
      ],
    ),
    h2("spawn-without-blocking", "3. Spawn children without blocking"),
    p(
      code("ChildAdmission.admit"),
      ' returns as soon as the durable child Run exists. It never carries an outcome — admission answers "which durable child owns this work", not "what did it produce" — so a crash between spawn and answer never loses the child.',
    ),
    codeBlock({ label: "admit-and-join.ts", source: admitAndJoin }),
    callout(
      "warning",
      "join does not block",
      "join reads the child's current state. A caller that must wait polls it or follows Run events. The blocking run_child path and the child-group operations are unchanged; this is an additional route, not a replacement.",
    ),
    p(
      "Parentage is read from the durable child record, so knowing a child Run id grants nothing to a Run that did not admit it: a mismatched parent fails ",
      code("ChildParentageInvalid"),
      ". ",
      code("ToolContext"),
      " stays in the signature deliberately — binding one Run into the service at Layer creation would let a caller admit and cancel children under another Run.",
    ),
    h2("group-by-origin", "4. Group children by the cell that produced them"),
    p(
      "A cell admits many children in one tool call, so the tool call alone does not say which statement produced which child, nor in what order. ",
      code("ChildOrigin { operationKey, ordinal }"),
      " names the operation that ran the code and a host-assigned ordinal within it. It travels inside the invocation id, which ",
      code("ChildLinked"),
      " already carries, so correlation survives replay, restart, and reload with no event-schema change.",
    ),
    p(
      "The ordinal is derived from the parent's own durable children rather than an in-process counter. That makes it unforgeable — an origin supplied in the caller's payload is ignored — and stable across restart: the ordinal derives the idempotency key, so a counter that restarted at zero would mint a second invocation id for the same logical spawn and silently duplicate a child Run. A re-admitted key keeps its original ordinal; only a genuinely new key extends the sequence.",
    ),
    h2("page-the-log", "5. Page the exact log a compaction rewrote"),
    p(
      code("SessionHistory.pageHistory"),
      " is pure and reads the entry log, not the model projection. That distinction is the point: compaction drops pre-checkpoint entries from what the model sees, but they remain in the log and remain pageable.",
    ),
    codeBlock({ label: "Paging behind a checkpoint", source: paging }),
    p(
      "With no cursor it reads the newest page; ",
      code("before"),
      " reads strictly older entries and ",
      code("after"),
      " strictly newer ones. ",
      code("hasBefore"),
      " is how a caller learns that history continues behind a checkpoint rather than ending there, and ",
      code("compactionCheckpoints"),
      " lists exactly the points where the projection was rewritten. See ",
      link("/docs/learn/sessions-and-history", "Sessions and history"),
      " for the log the page reads and ",
      link("/docs/guides/compaction", "How to compact a session"),
      " for what rewrote it.",
    ),
  ],
})
