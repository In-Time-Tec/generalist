import { bullets, code, definePage, h2, link, p, table } from "../../prose"

export const nativeRuntime = definePage({
  path: "/docs/learn/native-runtime",
  title: "Core and Runtime: where durability lives",
  navTitle: "Core and Runtime",
  group: "Learn",
  description:
    "How the process-local @batonfx/core agent loop composes with the native @batonfx/runtime for durable, addressable runs.",
  content: [
    p(
      code("@batonfx/core"),
      " owns the agent loop: model turns, tool execution, policies, approvals, and typed AgentEvents. It can run by itself and keeps no durable execution state. ",
      code("@batonfx/runtime"),
      " is Baton's optional native durable host. It persists a constructor-verified executable manifest and exact active reference with each finite, addressable Run, alongside one canonical RunEvent stream.",
    ),
    h2("runtime-owns", "What Runtime owns"),
    bullets(
      ["Idempotent admission through ", code("send"), " and child execution through ", code("spawn"), "."],
      ["Stable Run identity, ordered RunEvents, exclusive replay cursors, inspection, snapshots, and finite history."],
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
    h2("storage", "Choose the storage layer"),
    table(
      ["Layer", "Use it for"],
      [
        [[code("Runtime.layerMemory")], "Local development and tests; all state is lost with the process"],
        [[code("Runtime.layerSqlite")], "Durable single-process execution with automatic schema migration"],
        [[code("Runtime.layerPostgres")], "Durable multi-worker execution on PostgreSQL"],
        [[code("Runtime.layerMysql")], "Durable multi-worker execution on MySQL 8+"],
      ],
    ),
    p(
      "PostgreSQL and MySQL startup verifies an already-applied schema rather than running DDL. Use ",
      code("RunSchema"),
      " for PostgreSQL or ",
      code("MysqlRunSchema"),
      " for MySQL in a predeploy migration step.",
    ),
    h2("package-boundary", "The package boundary"),
    p(
      "Core does not depend on Runtime, so the same agent value works in a script, deterministic test, or durable worker. Runtime depends on core, persists the closed executable manifest at admission, reconstructs its exact Agent and service Layers through a scoped resolver during execution, journals model and tool operations, and commits lifecycle state around the core driver. Transport then projects Runtime-owned events; it does not invent a second session or persistence model.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "the @batonfx/runtime reference"),
      " for the public namespaces and ",
      link("/docs/guides/serve-transport", "Serve over SSE and WebSocket"),
      " for a complete projection flow.",
    ),
  ],
})
