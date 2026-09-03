[**generalist**](../../index)

***

[generalist](../../index) / [repl](../index) / KernelSnapshotStore

# KernelSnapshotStore

## Classes

<a id="kernelsnapshotstore"></a>

### KernelSnapshotStore

#### Extends

- `KernelSnapshotStore_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new KernelSnapshotStore**(`_`): [`KernelSnapshotStore`](#kernelsnapshotstore)

###### Parameters

###### \_

`never`

###### Returns

[`KernelSnapshotStore`](#kernelsnapshotstore)

###### Inherited from

`KernelSnapshotStore_base.constructor`

***

<a id="kernelstateunavailable"></a>

### KernelStateUnavailable

A snapshot store operation failed. Restore failure is non-fatal and reported.

#### Extends

- `KernelStateUnavailable_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new KernelStateUnavailable**(...`args`): [`KernelStateUnavailable`](#kernelstateunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`KernelStateUnavailable`](#kernelstateunavailable)

###### Inherited from

`KernelStateUnavailable_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`KernelStateUnavailable_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`KernelStateUnavailable_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"missing"` \| `"corrupt"` \| `"io"`

###### Inherited from

`KernelStateUnavailable_base.reason`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`KernelStateUnavailable_base.sessionId`

## Interfaces

<a id="service"></a>

### Service

Best-effort namespace persistence. Never durable authority: Generalist operations,
events, Session entries, and children remain the only truth.

#### Properties

<a id="drop"></a>

##### drop

> `readonly` **drop**: (`sessionId`) => `Effect`\<`void`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<`void`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

<a id="load"></a>

##### load

> `readonly` **load**: (`sessionId`) => `Effect`\<[`Snapshot`](#snapshot) \| `undefined`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

###### Parameters

###### sessionId

`string`

###### Returns

`Effect`\<[`Snapshot`](#snapshot) \| `undefined`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

<a id="loadimmutable"></a>

##### loadImmutable

> `readonly` **loadImmutable**: (`snapshotId`) => `Effect`\<[`Snapshot`](#snapshot) \| `undefined`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

Load one immutable namespace image by its durable content identity.

###### Parameters

###### snapshotId

`string`

###### Returns

`Effect`\<[`Snapshot`](#snapshot) \| `undefined`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

<a id="save"></a>

##### save

> `readonly` **save**: (`snapshot`) => `Effect`\<`void`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

###### Parameters

###### snapshot

[`Snapshot`](#snapshot)

###### Returns

`Effect`\<`void`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

<a id="saveimmutable"></a>

##### saveImmutable

> `readonly` **saveImmutable**: (`snapshot`) => `Effect`\<`string`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

Persist one immutable namespace image and return its durable content identity.

###### Parameters

###### snapshot

[`Snapshot`](#snapshot)

###### Returns

`Effect`\<`string`, [`KernelStateUnavailable`](#kernelstateunavailable)\>

***

<a id="snapshot"></a>

### Snapshot

One persisted kernel namespace: opaque payload plus its manifest.

#### Properties

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: `object`

###### dropped

> `readonly` **dropped**: readonly `object`[]

###### epoch

> `readonly` **epoch**: `number`

###### profileDigest

> `readonly` **profileDigest**: `string`

###### restored

> `readonly` **restored**: readonly `object`[]

###### savedAtMillis

> `readonly` **savedAtMillis**: `number`

###### sessionId

> `readonly` **sessionId**: `string`

<a id="payload"></a>

##### payload

> `readonly` **payload**: `Uint8Array`

## Type Aliases

<a id="droppedbinding"></a>

### DroppedBinding

> **DroppedBinding** = *typeof* `DroppedBinding.Type`

One binding the snapshot could not carry, and why.

***

<a id="manifest-1"></a>

### Manifest

> **Manifest** = *typeof* `Manifest.Type`

The honest saved/dropped account of one snapshot. It names every binding that comes
back and every binding that does not, so the model is told exactly what it lost.

***

<a id="restoredbinding"></a>

### RestoredBinding

> **RestoredBinding** = *typeof* `RestoredBinding.Type`

One binding that survived the snapshot.

***

<a id="restorekind"></a>

### RestoreKind

> **RestoreKind** = *typeof* `RestoreKind.Type`

How one binding was put back into a restored namespace.

## Variables

<a id="droppedbinding-1"></a>

### DroppedBinding

> `const` **DroppedBinding**: `Schema.Struct`\<\{ `name`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; \}\>

One binding the snapshot could not carry, and why.

***

<a id="manifest-2"></a>

### Manifest

> `const` **Manifest**: `Schema.Struct`\<\{ `dropped`: `Schema.$Array`\<`Schema.Struct`\<\{ `name`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[`"function"`, `"class"`, `"module"`, `"live-handle"`, `"oversized"`, `"unserializable"`\]\>; \}\>\>; `epoch`: `Schema.Int`; `profileDigest`: `Schema.String`; `restored`: `Schema.$Array`\<`Schema.Struct`\<\{ `kind`: `Schema.Literals`\<readonly \[`"value"`, `"source"`, `"import"`\]\>; `name`: `Schema.String`; \}\>\>; `savedAtMillis`: `Schema.Int`; `sessionId`: `Schema.String`; \}\>

The honest saved/dropped account of one snapshot. It names every binding that comes
back and every binding that does not, so the model is told exactly what it lost.

***

<a id="restoredbinding-1"></a>

### RestoredBinding

> `const` **RestoredBinding**: `Schema.Struct`\<\{ `kind`: `Schema.Literals`\<readonly \[`"value"`, `"source"`, `"import"`\]\>; `name`: `Schema.String`; \}\>

One binding that survived the snapshot.

***

<a id="restorekind-1"></a>

### RestoreKind

> `const` **RestoreKind**: `Schema.Literals`\<readonly \[`"value"`, `"source"`, `"import"`\]\>

How one binding was put back into a restored namespace.

***

<a id="snapshotid"></a>

### snapshotId

> `const` **snapshotId**: (`snapshot`) => `string`

Content identity of one immutable namespace image.

#### Parameters

##### snapshot

[`Snapshot`](#snapshot)

#### Returns

`string`
