# Session history paging

`SessionHistory.page` performs a bounded, non-mutating read over one exact root-to-leaf entry path. Cursors are strict entry IDs; continuation flags distinguish either side of the returned page.

## Store reads versus array paging

`SessionHistory.page` slices an already materialized array; it does not bound the database read that produced that array. Use the Session store's purpose-specific reads instead when fetching durable history:

- `entry(id)` reads one exact immutable entry for response resolution.
- `pathPage({ leafId, limit, cursor? })` reads backward on a fixed leaf with a leaf-bound continuation cursor. Later appends do not change the selected path. Paging bounds returned history, not the object engine's complete partition-state memory. Reuse the returned cursor, not an arbitrary entry ID.
- `effectivePath(leaf?)` reads only the latest Compaction/Handoff projection and its suffix for model context. Without a projection boundary, the complete context still grows.
- `latestCompaction(leaf?)` finds compaction telemetry independently, including across a later Handoff. It may traverse many ancestors, but does not materialize their complete path.
- `path(leaf?)` is the complete lossless ancestry for audit, compaction input, and memory retention. It is deliberately not silently truncated.

These interfaces have different cursor contracts. The permissive unknown-cursor behavior below belongs only to the array utility, not durable `pathPage`.

## Usage

```ts
import { Session, SessionHistory } from "generalist"

const readOldestFirst = (path: ReadonlyArray<Session.Entry>) => {
  const pages: Array<SessionHistory.HistoryPage> = []
  let cursor: Session.EntryId | undefined

  do {
    const page = SessionHistory.page(path, {
      limit: 50,
      ...(cursor === undefined ? {} : { before: cursor }),
    })
    pages.unshift(page)
    cursor = page.firstEntryId
  } while (pages[0]!.hasBefore)

  return pages.flatMap((page) => page.entries)
}

const checkpoints = (path: ReadonlyArray<Session.Entry>) => SessionHistory.compactionCheckpoints(path)
```

## What runs

```text
SessionHistory.page([e0, e1, e2, e3, e4, e5],
                    { limit: 3, before: "e4" })
├── find "e4" at index 4
├── strict window: [e0, e1, e2, e3]
├── keep newest 3: [e1, e2, e3]
└── HistoryPage
    { entries: [e1, e2, e3],
      firstEntryId: "e1", lastEntryId: "e3",
      hasBefore: true, hasAfter: true }
```

## Invariants

- `entries` retain root-to-leaf path order, and `page` never mutates `path`.
- With no cursor, `page` returns the newest entries.
- `before` excludes its cursor and selects older entries; `after` excludes its cursor and selects newer entries.
- Reusing `firstEntryId` as `before` until `hasBefore` is `false` traverses the exact log without gaps or repeats when `limit` is positive.
- `firstEntryId` and `lastEntryId` exist only when the page is nonempty.
- `hasBefore` and `hasAfter` report whether entries remain on the older and newer sides; a whole-log page sets both to `false`.
- A limit larger than the available window returns that entire window.
- Limits are truncated to integers and clamped to zero; a zero limit returns no entries or entry-ID cursors.
- Missing cursors are returned in `unknownCursors`; the property is absent when every supplied cursor exists.
- An unknown `before` cursor falls back to the newest page, while an unknown `after` cursor falls back to the oldest page. Callers must use `unknownCursors` rather than treat either fallback as adjacent to the missing entry.
- Paging reads the exact entry log, not `Session.buildContext`'s model projection.
- Compaction removes pre-checkpoint entries from the model projection, but those entries remain page-reachable in the exact log.
- A compaction checkpoint is an ordinary exact-log entry, not a paging floor; `hasBefore` can therefore report older history behind it.
- Paging with `before: checkpoint.id` returns entries before that checkpoint and excludes the checkpoint itself.
- `compactionCheckpoints(path)` returns every checkpoint on the path, oldest first, so hosts can expose history replaced in the model projection.

## Related

- Source: `packages/generalist/src/core/context/session-history.ts`
- Site: `/docs/guides/tools/durable-composite-tools`
