[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / SessionHistory

# SessionHistory

## Interfaces

### HistoryPage

One page of exact Session entries plus the cursors that continue it.

`entries` are in path order. `hasBefore` states whether older entries remain, which is how a
caller learns that history continues behind a compaction checkpoint rather than ending there.

#### Properties

##### entries

> `readonly` **entries**: readonly [`Entry`](./Session#entry)[]

##### firstEntryId?

> `readonly` `optional` **firstEntryId?**: `string`

##### hasAfter

> `readonly` **hasAfter**: `boolean`

##### hasBefore

> `readonly` **hasBefore**: `boolean`

##### lastEntryId?

> `readonly` `optional` **lastEntryId?**: `string`

##### unknownCursors?

> `readonly` `optional` **unknownCursors?**: readonly `string`[]

The cursors this page was asked for that the log does not hold. A cursor names no position, so
the page falls back to the end it would have bounded; saying which cursor was ignored is what
stops a caller reading the newest entries as though they preceded something.

***

### HistoryPageInput

One bounded read over the exact entry log.

#### Properties

##### after?

> `readonly` `optional` **after?**: `string`

Return entries strictly after this entry.

##### before?

> `readonly` `optional` **before?**: `string`

Return entries strictly before this entry. Omitted reads the newest page.

##### limit

> `readonly` **limit**: `number`

## Variables

### compactionCheckpoints

> `const` **compactionCheckpoints**: (`path`) => `ReadonlyArray`\<[`CompactionEntry`](./Session#compactionentry)\>

Every compaction checkpoint on one path, oldest first.

#### Parameters

##### path

`ReadonlyArray`\<[`Entry`](./Session#entry)\>

#### Returns

`ReadonlyArray`\<[`CompactionEntry`](./Session#compactionentry)\>

***

### page

> `const` **page**: \{(`input`): (`path`) => [`HistoryPage`](#historypage); (`path`, `input`): [`HistoryPage`](#historypage); \}

Purely page one root-to-leaf path over its exact entries.

Paging reads the entry log, not the projection, so entries recorded before a compaction
checkpoint stay reachable. A checkpoint is an ordinary entry in the page, never a floor.

#### Call Signature

> (`input`): (`path`) => [`HistoryPage`](#historypage)

##### Parameters

###### input

[`HistoryPageInput`](#historypageinput)

##### Returns

(`path`) => [`HistoryPage`](#historypage)

#### Call Signature

> (`path`, `input`): [`HistoryPage`](#historypage)

##### Parameters

###### path

readonly [`Entry`](./Session#entry)[]

###### input

[`HistoryPageInput`](#historypageinput)

##### Returns

[`HistoryPage`](#historypage)
