[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / ModelPreview

# ModelPreview

## Type Aliases

<a id="change"></a>

### Change

> **Change** = *typeof* `Change.Type`

One ordered append to a model output channel. Offsets and deltas use UTF-16 code units.

***

<a id="cleared"></a>

### Cleared

> **Cleared** = *typeof* `Cleared.Type`

Tombstone emitted when a Run's memory-only model preview lane is cleared.

***

<a id="event"></a>

### Event

> **Event** = *typeof* `Event.Type`

One event from a Run's memory-only model preview lane.

***

<a id="frame"></a>

### Frame

> **Frame** = *typeof* `Frame.Type`

A bounded append frame for one live provider attempt.

## Variables

<a id="change-1"></a>

### Change

> `const` **Change**: `Schema.Struct`\<\{ `channel`: `Schema.Literals`\<readonly \[`"reasoning"`, `"text"`\]\>; `delta`: `Schema.String`; `offset`: `Schema.Int`; \}\>

One ordered append to a model output channel. Offsets and deltas use UTF-16 code units.

***

<a id="cleared-1"></a>

### Cleared

> `const` **Cleared**: `Schema.TaggedStruct`\<`"ModelPreviewCleared"`, \{ `attemptFence`: `Schema.Int`; `generation`: `Schema.Int`; `runId`: `Schema.String`; \}\>

Tombstone emitted when a Run's memory-only model preview lane is cleared.

***

<a id="event-1"></a>

### Event

> `const` **Event**: `Schema.Union`\<readonly \[`Schema.refine`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"reasoning"` \| `"text"`; `delta`: `string`; `offset`: `number`; \}, ...\{ channel: (...) \| (...); delta: string; offset: number \}\[\]\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \}, `Schema.TaggedStruct`\<`"ModelPreview"`, \{ `attempt`: `Schema.Int`; `attemptFence`: `Schema.Int`; `changes`: `Schema.NonEmptyArray`\<`Schema.Struct`\<\{ `channel`: `Schema.Literals`\<readonly ...\>; `delta`: `Schema.String`; `offset`: `Schema.Int`; \}\>\>; `generation`: `Schema.Int`; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `runId`: `Schema.String`; `sequence`: `Schema.Int`; `turn`: `Schema.Int`; \}\>\>, `Schema.TaggedStruct`\<`"ModelPreviewCleared"`, \{ `attemptFence`: `Schema.Int`; `generation`: `Schema.Int`; `runId`: `Schema.String`; \}\>\]\>

One event from a Run's memory-only model preview lane.

***

<a id="frame-1"></a>

### Frame

> `const` **Frame**: `Schema.refine`\<\{ `_tag`: `"ModelPreview"`; `attempt`: `number`; `attemptFence`: `number`; `changes`: readonly \[\{ `channel`: `"reasoning"` \| `"text"`; `delta`: `string`; `offset`: `number`; \}, ...\{ channel: "reasoning" \| "text"; delta: string; offset: number \}\[\]\]; `generation`: `number`; `modelAttemptId`: `string`; `modelCallId`: `string`; `runId`: `string`; `sequence`: `number`; `turn`: `number`; \}, `Schema.TaggedStruct`\<`"ModelPreview"`, \{ `attempt`: `Schema.Int`; `attemptFence`: `Schema.Int`; `changes`: `Schema.NonEmptyArray`\<`Schema.Struct`\<\{ `channel`: `Schema.Literals`\<readonly \[`"reasoning"`, `"text"`\]\>; `delta`: `Schema.String`; `offset`: `Schema.Int`; \}\>\>; `generation`: `Schema.Int`; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `runId`: `Schema.String`; `sequence`: `Schema.Int`; `turn`: `Schema.Int`; \}\>\>

A bounded append frame for one live provider attempt.

***

<a id="maxcadencemillis"></a>

### MaxCadenceMillis

> `const` **MaxCadenceMillis**: `50` = `50`

Maximum milliseconds that partial output waits for adjacent changes before flushing.

***

<a id="maxpayloadcharacters"></a>

### MaxPayloadCharacters

> `const` **MaxPayloadCharacters**: `4096` = `4096`

Maximum UTF-16 code units carried by one frame and held by one cadence buffer.

***

<a id="subscribercapacity"></a>

### SubscriberCapacity

> `const` **SubscriberCapacity**: `64` = `64`

Maximum queued preview events retained for one subscriber.
