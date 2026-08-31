import hostBindings from "virtual:source/src/snippets/guides/tools/typescript-cells/host-bindings.ts"
import hostBindingsExpected from "virtual:source/src/snippets/guides/tools/typescript-cells/host-bindings.expected.txt"
import testKernel from "virtual:source/src/snippets/guides/tools/typescript-cells/test-kernel.ts"
import testKernelExpected from "virtual:source/src/snippets/guides/tools/typescript-cells/test-kernel.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const composeBunPool = `import { Duration, Effect } from "effect"
import { KernelSnapshotStore } from "generalist/repl"
import { BunKernelPool, BunKernelSnapshotStore, workerModule } from "generalist/repl/bun"

const pool = Effect.gen(function* () {
  const store = yield* BunKernelSnapshotStore.make({ dataRoot })
  return yield* BunKernelPool.make({
    profile,
    runtimeCommand: "bun",
    workerModule,
    startTimeoutMillis: 20_000,
    interruptGraceMillis: 250,
    maxConcurrentBoots: 4,
    idleTimeToLive: Duration.minutes(5),
    environment: {},
  }).pipe(Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, store))
})`

export const typescriptCells = definePage({
  path: "/docs/guides/typescript-cells",
  title: "How to give an agent a TypeScript cell",
  navTitle: "TypeScript cells",
  group: "Guides",
  description:
    "Advertise the one typescript tool, compose the Bun kernel pool, mount host modules into the cell namespace, and test a host without a worker process.",
  content: [
    p(
      "A cell is one model-authored TypeScript source executed in the persistent kernel a Session owns. ",
      code("generalist/repl"),
      " gives an agent exactly one tool for it, named ",
      code("typescript"),
      ", whose parameters are exactly one bounded string field named ",
      code("code"),
      ". The root export is contracts only; ",
      code("generalist/repl/bun"),
      " is the only module with process dependencies.",
    ),
    h2("advertise-the-tool", "1. Advertise the one tool"),
    p(
      code("CellTool.layer"),
      " provides ",
      code("ToolExecutor.ToolExecutor"),
      " over ",
      code("ToolContext"),
      " and ",
      code("KernelPool"),
      ". Because one namespace is shared, ",
      code("CellTool.scheduling"),
      " is always ",
      code("{ maxConcurrency: 1, parallelSafe: [] }"),
      ": every cell is an authored-order exclusive barrier. A thrown cell is a ",
      code("DomainFailure"),
      " the model reads and recovers from, not a run failure, because the tool declares ",
      code('failureMode: "return"'),
      ".",
    ),
    p(
      "This program runs the whole route against ",
      code("TestKernel"),
      ", which evaluates nothing and enforces the observable contract, so it needs no worker process:",
    ),
    codeBlock({ label: "test-kernel.ts", source: testKernel, expectedOutput: testKernelExpected }),
    h2("compose-the-bun-kernel", "2. Compose the Bun kernel"),
    p(
      "The real pool holds one live kernel per Session, keyed by Session identity, inside a Server-scoped reference-counted map. ",
      code("workerModule"),
      " is the worker's absolute path resolved against the package's own module URL; the worker is not an importable entrypoint, so this export is the only supported way to locate it.",
    ),
    codeBlock({ label: "Composing BunKernelPool", source: composeBunPool }),
    callout(
      "warning",
      "idleTimeToLive must be non-zero",
      "The pool holds a kernel reference for exactly the duration of a cell, so a zero time to live releases the kernel the instant a cell's scope closes and every cell silently gets a fresh worker. Plain values still come back through the snapshot, so the mistake looks harmless; module bindings and live handles do not, so a module imported in one cell is undefined in the next.",
    ),
    p(
      "The pool adds no poll, no keepalive, and no timer that outlives a completed cell. Idle eviction is reference-count expiry rather than a sweep, so an idle Server with a kernel attached does no kernel-attributable work.",
    ),
    h2("mount-host-modules", "3. Mount host modules into the namespace"),
    p(
      code("HostBindings.make(modules)"),
      " mounts named Schema-typed modules as kernel bindings, so a cell calls ",
      code("await workspace.read({ path })"),
      " directly. Duplicate module or operation names are rejected at mount. A declared operation failure is encoded and thrown inside the cell, so the model discriminates it as data; a request for something unmounted, or one that does not satisfy the declared schema, fails typed at the boundary with its stage.",
    ),
    codeBlock({ label: "host-bindings.ts", source: hostBindings, expectedOutput: hostBindingsExpected }),
    p(
      "Mounted module names feed ",
      code("KernelProfile.bindingsDigest"),
      ", which is part of the epoch identity, so changing the mounted surface requires a new epoch rather than reusing the old one.",
    ),
    h2("handle-the-outcomes", "4. Handle the four outcomes"),
    table(
      ["Failure", "What the host does"],
      [
        [
          [code("CellExecutionFailed")],
          "Nothing. The cell threw; the namespace, the kernel, and every prior binding survive, and the model reads the error",
        ],
        [[code("KernelUnavailable")], "Nothing was evaluated; retrying the same cell is safe"],
        [[code("KernelProtocolViolation")], "The kernel broke the cell protocol; restart the epoch"],
        [
          [code("CellOutcomeUnknown")],
          "The cell may or may not have committed. Resolve it explicitly; never replay it",
        ],
      ],
    ),
    p(
      "A cell that outruns ",
      code("limits.cellDeadlineMillis"),
      " is stopped by an escalation ladder: caller interruption first, then the worker's ",
      code("vm"),
      " watchdog, which terminates a synchronous loop in place and leaves the namespace intact, and only then a child ",
      code("SIGKILL"),
      " that starts a new epoch and reports what was lost.",
    ),
    h2("execution-bounds", "5. Read the execution bounds honestly"),
    bullets(
      [
        code("limits.sourceBytes"),
        " refuses an oversized cell before anything is evaluated, with ",
        code('KernelUnavailable { reason: "profile-mismatch" }'),
        ".",
      ],
      ["Cell stdout, stderr, and terminal result values are returned complete."],
    ),
    p(
      "See ",
      link("/docs/reference/repl", "the generalist/repl reference"),
      " for the exact schemas and ports, and ",
      link("/docs/learn/kernel-boundaries", "Why the kernel is a process boundary"),
      " for the isolation and authenticity decisions behind them.",
    ),
  ],
})
