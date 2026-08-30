# Session history paging

`SessionHistory` pages the exact Session entry log. It is pure: it reads a root-to-leaf path and returns a window plus the cursors that continue it, never mutating what it reads.

- `page(path, { limit, before?, after? })` returns `HistoryPage { entries, hasBefore, hasAfter, firstEntryId?, lastEntryId? }`. Entries are in path order.
- With no cursor it reads the **newest** page. `before` reads strictly older entries, `after` reads strictly newer ones. Walking `before` from `firstEntryId` until `hasBefore` is false traverses the whole log without gaps or repeats.
- A limit larger than the log yields the whole log with both flags false. A zero limit yields an empty page with no cursors.

Paging reads the entry log, not the model projection, which is the point of the module. Compaction rewrites what the model sees: entries recorded before a checkpoint are dropped from `Session.buildContext` but remain in the log, and a page taken with `before: <checkpoint id>` still returns them. `hasBefore` is how a caller learns that history continues behind a checkpoint rather than ending there.

A compaction checkpoint is an ordinary entry in the page, never a floor. `SessionHistory.compactionCheckpoints(path)` lists every checkpoint on the path, oldest first, so a host can offer "older messages" at exactly the points where the projection was rewritten.
