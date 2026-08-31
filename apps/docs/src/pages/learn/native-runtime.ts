import { bullets, code, definePage, h2, link, p, table } from "../../prose"

export const nativeRuntime = definePage({
  path: "/docs/learn/native-runtime",
  title: "Core and Runtime: where durability lives",
  navTitle: "Core and Runtime",
  group: "Learn",
  description:
    "How the process-local generalist agent loop composes with the native generalist/runtime for durable, addressable runs.",
  content: [
    p(
      code("generalist"),
      " owns the agent loop: model turns, tool execution, policies, approvals, and typed AgentEvents. It can run by itself and keeps no durable execution state. ",
      code("generalist/runtime"),
      " is Generalist's optional native durable host. It persists a constructor-verified executable manifest and exact active reference with each finite, addressable Run, alongside one canonical RunEvent stream.",
    ),
    h2("runtime-owns", "What Runtime owns"),
    bullets(
      ["Idempotent admission through ", code("send"), " and child execution through ", code("spawn"), "."],
      ["Stable Run identity, ordered RunEvents, exclusive replay cursors, inspection, snapshots, and finite history."],
      [
        "Normalized model outcomes as one ",
        code("ModelResponseCommitted"),
        " or terminal ",
        code("ModelResponseInterrupted"),
        " event; raw provider parts never enter durable history.",
      ],
      ["Durable waits, responses, signals, cancellation, parent-child links, and operation recovery."],
      [
        "Address bindings carry a pinned ",
        code("{ ref, manifest }"),
        " authority. Admission persists that pair without reconstructing live code.",
      ],
      [
        "A caller-supplied ",
        code("ExecutableResolver"),
        " reconstructs the exact Agent and services only in the execution scope, then attests the persisted identity before work begins.",
      ],
    ),
    h2("live-previews", "Live previews are outside durability"),
    p(
      code("Runtime.previews({ runId })"),
      " observes bounded append frames for text and reasoning from the live Runtime process. Contiguous per-attempt sequences and per-channel UTF-16 offsets let consumers detect a dropped frame. This lane is intentionally lossy, droppable, and non-authoritative: it is not stored, cursor-addressed, checkpointed, durably replayed, transported, or folded into FoldKit Chat.Model. Losing every preview does not change execution or the eventual semantic response event.",
    ),
    h2("storage", "Choose the storage layer"),
    table(
      ["Layer", "Use it for"],
      [
        [[code("Runtime.layerMemory")], "Local development and tests; all state is lost with the process"],
        [[code("SqliteRuntime.layerSqlite")], "Durable single-process execution with automatic schema migration"],
        [[code("layer from generalist/pg")], "Durable multi-worker execution on PostgreSQL"],
        [[code("layer from generalist/mysql")], "Durable multi-worker execution on MySQL 8+"],
      ],
    ),
    p(
      "PostgreSQL and MySQL startup verifies an already-applied schema rather than running DDL. Use ",
      code("RuntimeSchema from generalist/pg"),
      " for PostgreSQL or ",
      code("RuntimeSchema from generalist/mysql"),
      " for MySQL in a predeploy migration step.",
    ),
    p(
      "Import ",
      code("Runtime as SqliteRuntime"),
      " from ",
      code("generalist/runtime/sqlite-bun"),
      ". The generic ",
      code("generalist/runtime"),
      " entrypoint does not load or require the SQLite peer.",
    ),
    h2("package-boundary", "The package boundary"),
    p(
      "Core does not depend on Runtime, so the same agent value works in a script, deterministic test, or durable worker. Runtime depends on core, persists the closed executable manifest at admission, reconstructs its exact Agent and service Layers through a scoped resolver during execution, journals model and tool operations, and commits lifecycle state around the core driver. Transport then projects Runtime-owned events; it does not invent a second session or persistence model.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "the generalist/runtime reference"),
      " for the public namespaces and ",
      link("/docs/guides/serve-transport", "Serve over SSE and WebSocket"),
      " for a complete projection flow.",
    ),
  ],
})
