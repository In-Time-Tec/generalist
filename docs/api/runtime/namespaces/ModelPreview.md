[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ModelPreview

# ModelPreview

## Interfaces

<a id="change"></a>

### Change

One ordered append to a model output channel. Offsets and deltas use UTF-16 code units.

#### Properties

<a id="channel"></a>

##### channel

> `readonly` **channel**: `Channel`

<a id="delta"></a>

##### delta

> `readonly` **delta**: `string`

<a id="offset"></a>

##### offset

> `readonly` **offset**: `number`

***

<a id="cleared"></a>

### Cleared

Tombstone emitted when a Run's memory-only model preview lane is cleared.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"ModelPreviewCleared"`

<a id="attemptfence"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

<a id="generation"></a>

##### generation

> `readonly` **generation**: `number`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="frame"></a>

### Frame

A bounded append frame for one live provider attempt.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"ModelPreview"`

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="attemptfence-1"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

<a id="changes"></a>

##### changes

> `readonly` **changes**: readonly \[[`Change`](#change), [`Change`](#change)\]

<a id="modelattemptid"></a>

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

<a id="modelcallid"></a>

##### modelCallId

> `readonly` **modelCallId**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

<a id="sequence"></a>

##### sequence

> `readonly` **sequence**: `number`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

## Type Aliases

<a id="event"></a>

### Event

> **Event** = [`Frame`](#frame) \| [`Cleared`](#cleared)

One event from a Run's memory-only model preview lane.

## Variables

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
