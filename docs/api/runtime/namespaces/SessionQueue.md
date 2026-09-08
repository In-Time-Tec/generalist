[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / SessionQueue

# SessionQueue

## Classes

<a id="sessionqueueconflict"></a>

### SessionQueueConflict

**`Experimental`**

A queue mutation lost a revision race or exceeded a supported bound.

#### Extends

- `SessionQueueConflict_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new SessionQueueConflict**(...`args`): [`SessionQueueConflict`](#sessionqueueconflict)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionQueueConflict`](#sessionqueueconflict)

###### Inherited from

`SessionQueueConflict_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`SessionQueueConflict_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"selection"` \| `"revision"` \| `"capacity"`

**`Experimental`**

###### Inherited from

`SessionQueueConflict_base.reason`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

**`Experimental`**

###### Inherited from

`SessionQueueConflict_base.sessionId`

## Type Aliases

<a id="pendinginput"></a>

### PendingInput

> **PendingInput** = *typeof* `PendingInput.Type`

**`Experimental`**

One editable instruction waiting for its own Run.

***

<a id="queuereceipt"></a>

### QueueReceipt

> **QueueReceipt** = *typeof* `QueueReceipt.Type`

**`Experimental`**

An immutable queue command acknowledgement, not the current queue status.

***

<a id="removeinput"></a>

### RemoveInput

> **RemoveInput** = *typeof* `RemoveInput.Type`

***

<a id="selectionresolver"></a>

### SelectionResolver

> **SelectionResolver** = (`agent`) => `Effect.Effect`\<[`SessionSelection`](#sessionselection), [`UnknownAgent`](./Errors.md#unknownagent)\>

**`Experimental`**

Resolve an allowed Agent only for a new command, after immutable receipt reconciliation.

#### Parameters

##### agent

`string`

#### Returns

`Effect.Effect`\<[`SessionSelection`](#sessionselection), [`UnknownAgent`](./Errors.md#unknownagent)\>

***

<a id="sessionselection"></a>

### SessionSelection

> **SessionSelection** = *typeof* `SessionSelection.Type`

**`Experimental`**

The immutable executable and settings selected for conversational input.

***

<a id="submitinput"></a>

### SubmitInput

> **SubmitInput** = *typeof* `SubmitInput.Type`

***

<a id="updateinput"></a>

### UpdateInput

> **UpdateInput** = *typeof* `UpdateInput.Type`

## Variables

<a id="pendinginput-1"></a>

### PendingInput

> `const` **PendingInput**: `Schema.Struct`\<\{ `id`: `Schema.String`; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `revision`: `Schema.Int`; `selection`: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `concurrency`: `Schema.Struct`\<\{ `agents`: `Schema.Int`; `tools`: `Schema.Int`; \}\>; `maxDepth`: `Schema.Int`; `maxSessions`: `Schema.Int`; \}\>\>; \}\>; \}\>

**`Experimental`**

One editable instruction waiting for its own Run.

***

<a id="queuereceipt-1"></a>

### QueueReceipt

> `const` **QueueReceipt**: `Schema.Struct`\<\{ `id`: `Schema.String`; `revision`: `Schema.Int`; \}\>

**`Experimental`**

An immutable queue command acknowledgement, not the current queue status.

***

<a id="removeinput-1"></a>

### RemoveInput

> `const` **RemoveInput**: `Schema.Struct`\<\{ `commandId`: `Schema.String`; `expectedRevision`: `Schema.Int`; `id`: `Schema.String`; `sessionId`: `Schema.String`; \}\>

***

<a id="sessionselection-1"></a>

### SessionSelection

> `const` **SessionSelection**: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `concurrency`: `Schema.Struct`\<\{ `agents`: `Schema.Int`; `tools`: `Schema.Int`; \}\>; `maxDepth`: `Schema.Int`; `maxSessions`: `Schema.Int`; \}\>\>; \}\>

**`Experimental`**

The immutable executable and settings selected for conversational input.

***

<a id="submitinput-1"></a>

### SubmitInput

> `const` **SubmitInput**: `Schema.Struct`\<\{ `commandId`: `Schema.String`; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `selection`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `concurrency`: `Schema.Struct`\<\{ `agents`: `Schema.Int`; `tools`: `Schema.Int`; \}\>; `maxDepth`: `Schema.Int`; `maxSessions`: `Schema.Int`; \}\>\>; \}\>\>; `sessionId`: `Schema.String`; \}\>

***

<a id="updateinput-1"></a>

### UpdateInput

> `const` **UpdateInput**: `Schema.Struct`\<\{ `agent`: `Schema.optionalKey`\<`Schema.String`\>; `commandId`: `Schema.String`; `expectedRevision`: `Schema.Int`; `id`: `Schema.String`; `prompt`: `Schema.Codec`\<`Prompt.Prompt`, `Prompt.PromptEncoded`, `never`, `never`\>; `selection`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `executableManifest`: `Schema.Codec`\<[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest), [`ExecutableManifestEncoded`](../../generalist/namespaces/ExecutableManifest.md#executablemanifestencoded), `never`, `never`\>; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<..., ...\>, `Schema.brand`\<..., ...\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `registrations`: `Schema.$Array`\<`Schema.Struct`\<\{ `codec`: `Schema.String`; `payload`: `Schema.Unknown`; `pin`: `Schema.String`; `version`: `Schema.String`; \}\>\>; `treePolicy`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `concurrency`: `Schema.Struct`\<\{ `agents`: `Schema.Int`; `tools`: `Schema.Int`; \}\>; `maxDepth`: `Schema.Int`; `maxSessions`: `Schema.Int`; \}\>\>; \}\>\>; `sessionId`: `Schema.String`; \}\>
