---
title: "Memoize declared-pure operations"
description: "Reuse successful pure tool calls across Runs without weakening durable replay."
---

Declare purity explicitly, key reuse by host-owned isolation and dependency versions, and keep replay on the journal.

## Declare a pure tool

Wrap an Effect AI tool with `Memo.pure({ ttl: "6 hours", dependsOn: ["index-version"] })`. Undeclared tools are never read from or written to the memo store.

## Provide storage and key context

Provide `Memo.layerMemory()` or `Memo.layerSql()` together with `Memo.layerDependencies({ tenant, capabilityScope, versions })`. SQL storage requires Runtime schema version 7.

<Warning title="Purity is a promise">
The repository rule catches common direct Sandbox, SQL-write, and non-GET HTTP handlers, but aliases and transitive side effects still require review.
</Warning>

## Replay stays exact

A hit is journaled as the ordinary tool result with `memoized: { fromRun, fromOperation }`. Strict replay reads that recorded result and never consults the cache.
