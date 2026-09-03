[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ModelPreview

# ModelPreview

## Interfaces

### Change

One ordered append to a model output channel. Offsets and deltas use UTF-16 code units.

#### Properties

##### channel

> `readonly` **channel**: `Channel`

##### delta

> `readonly` **delta**: `string`

##### offset

> `readonly` **offset**: `number`

***

### Cleared

Tombstone emitted when a Run's memory-only model preview lane is cleared.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ModelPreviewCleared"`

##### attemptFence

> `readonly` **attemptFence**: `number`

##### generation

> `readonly` **generation**: `number`

##### runId

> `readonly` **runId**: `string`

***

### Frame

A bounded append frame for one live provider attempt.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ModelPreview"`

##### attempt

> `readonly` **attempt**: `number`

##### attemptFence

> `readonly` **attemptFence**: `number`

##### changes

> `readonly` **changes**: readonly \[[`Change`](#change), [`Change`](#change)\]

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

##### modelCallId

> `readonly` **modelCallId**: `string`

##### runId

> `readonly` **runId**: `string`

##### sequence

> `readonly` **sequence**: `number`

##### turn

> `readonly` **turn**: `number`

## Type Aliases

### Event

> **Event** = [`Frame`](#frame) \| [`Cleared`](#cleared)

One event from a Run's memory-only model preview lane.

## Variables

### MaxCadenceMillis

> `const` **MaxCadenceMillis**: `50` = `50`

Maximum milliseconds that partial output waits for adjacent changes before flushing.

***

### MaxPayloadCharacters

> `const` **MaxPayloadCharacters**: `4096` = `4096`

Maximum UTF-16 code units carried by one frame and held by one cadence buffer.

***

### SubscriberCapacity

> `const` **SubscriberCapacity**: `64` = `64`

Maximum queued preview events retained for one subscriber.
