import pinSnapshot from "virtual:source/src/snippets/guides/agent/continual-harness/pin-a-snapshot.ts"
import pinSnapshotExpected from "virtual:source/src/snippets/guides/agent/continual-harness/pin-a-snapshot.expected.txt"
import refine from "virtual:source/src/snippets/guides/agent/continual-harness/refine-and-roll-back.ts"
import refineExpected from "virtual:source/src/snippets/guides/agent/continual-harness/refine-and-roll-back.expected.txt"
import { callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const durableStore = `import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { Layer } from "effect"
import { FileSystemHarnessStore } from "tenetkit/harness"

const storeLayer = FileSystemHarnessStore.layer({
  path: (scope) => \`\${process.env.HOME}/.tenetkit/harness/\${encodeURIComponent(scope)}.json\`,
}).pipe(Layer.provide(bunServices))`

export const continualHarness = definePage({
  path: "/docs/guides/continual-harness",
  title: "How to let an agent refine its own guidance",
  navTitle: "Continual harness",
  group: "Guides",
  description:
    "Accept a model-authored refinement, apply it atomically, roll it back exactly, persist it durably, and pin one exact state into a durable Execution.",
  content: [
    p(
      code("tenetkit/harness"),
      " is the engine for agent guidance an agent may refine and a host may pin: prompt notes, memories, skills, and subagent specs, each versioned and audited. Store locations, scope policy, and the refine flow itself stay host-owned.",
    ),
    h2("accept-a-refinement", "1. Accept a refinement from the model"),
    p(
      "Model-originated input goes through ",
      code("Authorship.authorProposal"),
      " and nowhere else. It decodes against ",
      code("AuthoredProposal"),
      ", whose create and update edits have no ",
      code("revision"),
      " field, and refuses input carrying one rather than silently stripping it — so a caller learns its proposal was rejected instead of quietly getting different semantics.",
    ),
    codeBlock({ label: "refine-and-roll-back.ts", source: refine, expectedOutput: refineExpected }),
    p(
      code("Refinement.applyProposal"),
      " is pure and atomic: it returns ",
      code("Result<RefinementResult, RefinementRejected>"),
      ", applies every edit or none, and never mutates its input. Revision stays the engine's — an accepted create lands at version 1 with the proposal instant, and an accepted update bumps to ",
      code("version + 1"),
      " while preserving the original ",
      code("createdAt"),
      ".",
    ),
    callout(
      "info",
      "The brand is not the boundary",
      'applyProposal accepts only the opaque AuthoredRefinementProposal that authorship mints, which is a compile-time discriminator a cast can erase. The runtime authorization boundary is the check inside applyProposal itself: a proposal whose edits pin a revision is rejected with RefinementRejected { reason: "pinned-revision" } even when a cast erased the brand. A host mounting this behind an unknown boundary gets that check without re-deriving it.',
    ),
    h2("roll-it-back", "2. Roll one back exactly"),
    p(
      "Every applied edit records the exact ",
      code("before"),
      " and ",
      code("after"),
      " entry, which is what makes rollback exact rather than approximate. ",
      code("Refinement.rollbackProposal"),
      " builds the inverse proposal: edits reversed, each guarded by the version it undoes, and ",
      code("baseSnapshot"),
      " derived from the supplied current state. Applying any target other than the newest fails ",
      code("rollback-not-newest"),
      " before inverse edits are evaluated.",
    ),
    p(
      "Rollback is the trusted path and does set ",
      code("revision"),
      ", which is how it restores the exact earlier entry instead of a bumped one. It is applied with the separately named ",
      code("Refinement.applyTrustedProposal"),
      ", so the two authority levels never share one call site.",
    ),
    h2("persist-it", "3. Persist it durably"),
    p(
      code("HarnessStore.layerMemory"),
      " is the in-process store. ",
      code("FileSystemHarnessStore.layer({ path })"),
      " is the durable one: the host owns every location decision through ",
      code("path(scope)"),
      " and the package owns encoding and atomicity.",
    ),
    codeBlock({ label: "A durable store on the Bun filesystem", source: durableStore }),
    table(
      ["Guarantee", "How"],
      [
        [
          "A reader never observes a partial state",
          [
            "A save writes a uniquely named temporary file at mode ",
            code("0600"),
            " inside the destination directory, creating it at mode ",
            code("0700"),
            " when missing, then renames it over the target",
          ],
        ],
        [
          "A failed write leaves the previous state intact",
          "The temporary is removed on failure and the target is never touched",
        ],
        ["Concurrent saves of one scope do not interleave", "A per-file semaphore serializes them"],
        [
          "A corrupt file is never silently reset",
          [code('reason: "corrupt"'), " is returned and the file stays on disk"],
        ],
        ["An unknown scope is not an error", "Loading one yields an empty state"],
      ],
    ),
    h2("pin-a-snapshot", "4. Pin one exact state into a durable Execution"),
    p(
      "A durable host must reconstruct the same guidance a Run started with, not whatever the store holds now. ",
      code("HarnessRegistration.registration(state, name)"),
      " produces the named capability and the exact secret-free payload for it.",
    ),
    codeBlock({ label: "pin-a-snapshot.ts", source: pinSnapshot, expectedOutput: pinSnapshotExpected }),
    p(
      "The capability carries pinned content, so the executable digest changes when the state changes and Runtime's registration validation requires the supplied payload to match the declared codec, version, and digest. Refinement history is audit data and stays outside the pinned identity, so recording an event does not change what a snapshot means. See ",
      link("/docs/reference/harness", "the tenetkit/harness reference"),
      " for the full rejection taxonomy, scope merge, and bounded overview contracts.",
    ),
  ],
})
