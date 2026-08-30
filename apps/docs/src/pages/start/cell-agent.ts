import step1 from "virtual:source/src/snippets/cell-agent/step-1.sh"
import step2 from "virtual:source/src/snippets/cell-agent/step-2.ts"
import step2Expected from "virtual:source/src/snippets/cell-agent/step-2.expected.txt"
import step3 from "virtual:source/src/snippets/cell-agent/step-3.ts"
import step3Expected from "virtual:source/src/snippets/cell-agent/step-3.expected.txt"
import step4 from "virtual:source/src/snippets/cell-agent/step-4.ts"
import step4Expected from "virtual:source/src/snippets/cell-agent/step-4.expected.txt"
import step5 from "virtual:source/src/snippets/cell-agent/step-5.ts"
import { bullets, callout, code, codeBlock, definePage, h2, lead, link, p } from "../../prose"

export const cellAgent = definePage({
  path: "/docs/start/cell-agent",
  title: "Tutorial: an agent that writes TypeScript",
  navTitle: "Cell agent",
  group: "Start",
  description:
    "Give an agent one persistent TypeScript cell, watch its lifecycle events, mount a host module into its namespace, and swap the test kernel for the real Bun kernel.",
  content: [
    lead(
      "In this tutorial we give an agent one persistent TypeScript cell, run cells against a kernel that evaluates nothing, then swap in the real Bun kernel. No API keys, no worker process until the last step.",
    ),
    p("You will learn how to:"),
    bullets(
      "Pin one kernel epoch with a KernelProfile",
      "Run a cell and read its lifecycle events",
      "Mount a host module into the cell namespace",
      "Compose the real Bun kernel pool",
    ),
    h2("step-1-create-the-project", "Step 1: Create the project"),
    codeBlock({ label: "Terminal", language: "bash", source: step1 }),
    p(code("tenetkit/repl"), "'s root export is contracts only, so nothing so far touches a process."),
    h2("step-2-pin-an-epoch", "Step 2: Pin an epoch"),
    p(
      "A ",
      code("KernelProfile"),
      " is everything one kernel epoch is reconstructed from. Put this in ",
      code("index.ts"),
      " and run ",
      code("bun run index.ts"),
      ":",
    ),
    codeBlock({ label: "index.ts", source: step2, expectedOutput: step2Expected }),
    p(
      "Three facts are already visible. The agent gets exactly one tool, named ",
      code("typescript"),
      ", with exactly one parameter, ",
      code("code"),
      ". Because one namespace is shared, scheduling is always ",
      code("maxConcurrency: 1"),
      " with no parallel-safe tool, so every cell is an authored-order exclusive barrier. And the profile has a digest: change the pinned runtime, the mounted bindings, the workspace, the limits, or the trust mode, and you get a different epoch rather than a reused one.",
    ),
    h2("step-3-run-a-cell", "Step 3: Run a cell and read its events"),
    p(
      code("TestKernel.layerTestPool"),
      " provides a ",
      code("KernelPool"),
      " that evaluates nothing. It still enforces the observable contract, which is exactly what we want to see first. Replace ",
      code("index.ts"),
      " and run it again:",
    ),
    codeBlock({ label: "index.ts", source: step3, expectedOutput: step3Expected }),
    p(
      "Every event carries its ",
      code("cellId"),
      " and a cell-local ",
      code("sequence"),
      " that starts at 0 and increases by exactly one — ",
      code("Cell.validateSequence"),
      " rejects a gap, a repeat, a non-zero start, and interleaving from a second cell. The second cell threw, and its outcome is a ",
      code("Failure"),
      ", but read what that means: ",
      code("CellExecutionFailed"),
      " is model input, not a run failure. The namespace, the kernel, and every prior binding survive it.",
    ),
    callout(
      "info",
      "Four outcomes, not two",
      "CellExecutionFailed means the cell threw and everything survived. KernelUnavailable means nothing was evaluated. KernelProtocolViolation means the kernel broke the cell protocol. CellOutcomeUnknown means the cell may or may not have committed — a host resolves that one explicitly and never replays it.",
    ),
    h2("step-4-mount-a-host-module", "Step 4: Mount a host module"),
    p(
      "A cell that can only compute is not very useful. ",
      code("HostBindings"),
      " mounts named Schema-typed modules as kernel bindings, so a cell writes ",
      code("await workspace.read({ path })"),
      " directly. Add the module and run the whole tool route:",
    ),
    codeBlock({ label: "index.ts", source: step4, expectedOutput: step4Expected }),
    p(
      "The mounted module names feed ",
      code("KernelProfile.bindingsDigest"),
      ", which is part of the epoch identity — so widening what a cell can reach means a new epoch, not a quietly different one. A declared operation failure is encoded and thrown inside the cell, so the model discriminates it as data; an unmounted module, or input that does not satisfy the declared schema, fails typed at the boundary with its stage.",
    ),
    h2("step-5-use-the-real-kernel", "Step 5: Swap in the real Bun kernel"),
    p(
      "Everything so far ran without a process. ",
      code("tenetkit/repl/bun"),
      " is the only module that changes that. The contract is identical, so only the layer changes:",
    ),
    codeBlock({ label: "kernel.ts", source: step5 }),
    p(
      "Now cells really evaluate: declarations, imports, and values persist across cells in one Session, top-level await works, and each Session gets its own kernel process. Two options deserve attention.",
    ),
    bullets(
      [
        code("workerModule"),
        " is the worker's absolute path resolved against the package's own module URL. The worker is not an importable entrypoint, so this is the only supported way to locate it.",
      ],
      [
        code("idleTimeToLive"),
        " must be non-zero. The pool holds a kernel reference for exactly the duration of a cell, so a zero time to live releases it the instant the cell's scope closes. Plain values still come back through the snapshot, so the mistake looks harmless — but module bindings and live handles do not, so an imported module from one cell is undefined in the next.",
      ],
    ),
    h2("what-you-built", "What you built"),
    p(
      "One agent with one persistent TypeScript namespace, bounded output, a typed failure taxonomy the model can recover from, and a host surface the cell can call. The kernel is a lifecycle boundary rather than a sandbox: a cell runs with the host user's OS permissions, its namespace is working memory rather than durable authority, and an uncertain cell is never replayed.",
    ),
    p(
      "Next: ",
      link("/docs/guides/typescript-cells", "How to give an agent a TypeScript cell"),
      " for the task-shaped version of these steps, ",
      link("/docs/learn/kernel-boundaries", "Why the kernel is a process boundary"),
      " for the isolation and authenticity decisions, and ",
      link("/docs/reference/repl", "the tenetkit/repl reference"),
      " for the exact schemas and ports.",
    ),
  ],
})
