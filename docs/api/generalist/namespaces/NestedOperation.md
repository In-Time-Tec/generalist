[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / NestedOperation

# NestedOperation

## Classes

### Denied

The host denied the nested operation's approval request.

#### Extends

- `Denied_base`

#### Constructors

##### Constructor

> **new Denied**(...`args`): [`Denied`](#denied)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Denied`](#denied)

###### Inherited from

`Denied_base.constructor`

#### Properties

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`Denied_base.capability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Denied_base.hint`

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Denied_base.operationKey`

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Denied_base.ordinal`

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`Denied_base.reason`

***

### Divergence

The same nested identity was reused with different content.

#### Extends

- `Divergence_base`

#### Constructors

##### Constructor

> **new Divergence**(...`args`): [`Divergence`](#divergence)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Divergence`](#divergence)

###### Inherited from

`Divergence_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Divergence_base.hint`

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Divergence_base.operationKey`

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Divergence_base.ordinal`

##### recordedDigest

> `readonly` **recordedDigest**: `string`

###### Inherited from

`Divergence_base.recordedDigest`

##### recordedKind

> `readonly` **recordedKind**: `string`

###### Inherited from

`Divergence_base.recordedKind`

##### requestedDigest

> `readonly` **requestedDigest**: `string`

###### Inherited from

`Divergence_base.requestedDigest`

##### requestedKind

> `readonly` **requestedKind**: `string`

###### Inherited from

`Divergence_base.requestedKind`

***

### Operations

#### Extends

- `Operations_base`

#### Constructors

##### Constructor

> **new Operations**(`_`): [`Operations`](#operations)

###### Parameters

###### \_

`never`

###### Returns

[`Operations`](#operations)

###### Inherited from

`Operations_base.constructor`

***

### Suspended

The run must suspend until the host resolves the nested operation's approval.

#### Extends

- `Suspended_base`

#### Constructors

##### Constructor

> **new Suspended**(...`args`): [`Suspended`](#suspended)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Suspended`](#suspended)

###### Inherited from

`Suspended_base.constructor`

#### Properties

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`Suspended_base.capability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Suspended_base.hint`

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Suspended_base.operationKey`

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Suspended_base.ordinal`

##### token

> `readonly` **token**: `string`

###### Inherited from

`Suspended_base.token`

***

### Unknown

A non-idempotent nested operation crossed its boundary with an unobserved outcome.

#### Extends

- `Unknown_base`

#### Constructors

##### Constructor

> **new Unknown**(...`args`): [`Unknown`](#unknown)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`Unknown`](#unknown)

###### Inherited from

`Unknown_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unknown_base.hint`

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`Unknown_base.operationId`

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Unknown_base.operationKey`

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Unknown_base.ordinal`

## Interfaces

### Request

#### Type Parameters

##### A

`A` = `unknown`

##### E

`E` = `unknown`

#### Properties

##### approval?

> `readonly` `optional` **approval?**: `object`

###### capability

> `readonly` **capability**: `string`

###### request?

> `readonly` `optional` **request?**: `unknown`

##### failure?

> `readonly` `optional` **failure?**: `Codec`\<`E`, `unknown`, `never`, `never`\>

##### kind

> `readonly` **kind**: `string`

##### payload

> `readonly` **payload**: `unknown`

##### render?

> `readonly` `optional` **render?**: (`value`) => \{ `_tag`: `"Artifact"`; `byteSize`: `number`; `height?`: `number`; `mimeType`: `string`; `path`: `string`; `width?`: `number`; \} \| \{ `_tag`: `"Diff"`; `patch`: `string`; `path`: `string`; \}

###### Parameters

###### value

`A`

###### Returns

\{ `_tag`: `"Artifact"`; `byteSize`: `number`; `height?`: `number`; `mimeType`: `string`; `path`: `string`; `width?`: `number`; \} \| \{ `_tag`: `"Diff"`; `patch`: `string`; `path`: `string`; \}

##### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

##### success?

> `readonly` `optional` **success?**: `Codec`\<`A`, `unknown`, `never`, `never`\>

***

### Service

Host seam executing one nested durable operation for a composite tool call.

Identity is derived, never supplied: the ambient `ToolContext` names the outer operation and the
host assigns the ordinal, so cell or tool code cannot forge, reorder, or collide with another
call's journal.

#### Properties

##### run

> `readonly` **run**: \<`A`, `E`, `R`\>(`request`, `effect`) => `Effect`\<`A`, `E` \| [`Failure`](#failure-1), [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### request

[`Request`](#request)\<`A`, `E`\>

###### effect

`Effect`\<`A`, `E`, `R`\>

###### Returns

`Effect`\<`A`, `E` \| [`Failure`](#failure-1), [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

## Type Aliases

### ApprovalRequirement

> **ApprovalRequirement** = *typeof* `ApprovalRequirement.Type`

Authorization the host must settle before the handler crosses its boundary.

***

### Failure

> **Failure** = [`Divergence`](#divergence) \| [`Unknown`](#unknown) \| [`Denied`](#denied) \| [`Suspended`](#suspended)

***

### Identity

> **Identity** = *typeof* `Identity.Type`

Derived identity of one nested operation beneath a composite tool call.

***

### Progress

> **Progress** = *typeof* `Progress.Type`

One nested-operation progress record a host projects.

***

### ProgressStatus

> **ProgressStatus** = *typeof* `ProgressStatus.Type`

Lifecycle of one nested operation as the host observes it.

***

### Render

> **Render** = *typeof* `Render.Type`

A host-derived projection of a nested operation's own outcome.

The value is produced by the handler's `render` function from the operation's real result, never
read from the request payload, so a cell that plants `render` in its input cannot dictate what
the host displays.

***

### ReplayPolicy

> **ReplayPolicy** = *typeof* `ReplayPolicy.Type`

Replay policy for one nested durable operation.

## Variables

### ApprovalRequirement

> `const` **ApprovalRequirement**: `Schema.Struct`\<\{ `capability`: `Schema.String`; `request`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>

Authorization the host must settle before the handler crosses its boundary.

***

### catchSuspension

> `const` **catchSuspension**: \<`E`, `R`\>(`effect`) => `Effect.Effect`\<[`Outcome`](./ToolExecutor#outcome), `Exclude`\<`E`, `E` & [`Suspended`](#suspended)\>, `R`\>

Translate a nested-operation approval suspension into the tool executor's Suspend outcome.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### effect

`Effect.Effect`\<[`Outcome`](./ToolExecutor#outcome), `E`, `R`\>

#### Returns

`Effect.Effect`\<[`Outcome`](./ToolExecutor#outcome), `Exclude`\<`E`, `E` & [`Suspended`](#suspended)\>, `R`\>

***

### Identity

> `const` **Identity**: `Schema.Struct`\<\{ `kind`: `Schema.String`; `operationKey`: `Schema.String`; `ordinal`: `Schema.Int`; `payloadDigest`: `Schema.String`; \}\>

Derived identity of one nested operation beneath a composite tool call.

***

### layerDirect

> `const` **layerDirect**: `Layer.Layer`\<[`Operations`](#operations)\>

Process-local nested operations for hosts without durable storage.

Identity, duplicate return, and divergence hold for the life of the run; approvals auto-approve
because a process-local host owns no resolution seam.

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Operations`](#operations)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Operations`](#operations)\>

***

### maxRenderBytes

> `const` **maxRenderBytes**: `number`

A projection larger than this is withheld whole rather than truncated.

***

### operationId

> `const` **operationId**: (`input`) => `string`

Derived operation id for one nested operation.

#### Parameters

##### input

###### operationKey

`string`

###### ordinal

`number`

#### Returns

`string`

***

### payloadDigest

> `const` **payloadDigest**: \{(`payload`): (`kind`) => `string`; (`kind`, `payload`): `string`; \}

Canonical payload digest shared by every nested-operation implementation.

#### Call Signature

> (`payload`): (`kind`) => `string`

##### Parameters

###### payload

`unknown`

##### Returns

(`kind`) => `string`

#### Call Signature

> (`kind`, `payload`): `string`

##### Parameters

###### kind

`string`

###### payload

`unknown`

##### Returns

`string`

***

### Progress

> `const` **Progress**: `Schema.Struct`\<\{ `kind`: `Schema.String`; `ordinal`: `Schema.Int`; `render`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Artifact"`\>; `byteSize`: `Schema.Int`; `height`: `Schema.optionalKey`\<`Schema.Int`\>; `mimeType`: `Schema.String`; `path`: `Schema.String`; `width`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Diff"`\>; `patch`: `Schema.String`; `path`: `Schema.String`; \}\>\]\>\>; `renderWithheldBytes`: `Schema.optionalKey`\<`Schema.Int`\>; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"unknown"`\]\>; \}\>

One nested-operation progress record a host projects.

***

### progressData

> `const` **progressData**: (`input`) => `Effect.Effect`\<`ProgressData`\>

Encodes one progress record under `progressKey`.

An oversized projection is withheld whole and reported as `renderWithheldBytes`: a partial diff
or a truncated artifact descriptor would render as a smaller correct change rather than as a
missing one, so the operation still succeeds while the projection is dropped.

#### Parameters

##### input

###### kind

`string`

###### ordinal

`number`

###### render?

[`Render`](#render-1)

###### status

[`ProgressStatus`](#progressstatus)

#### Returns

`Effect.Effect`\<`ProgressData`\>

***

### progressKey

> `const` **progressKey**: `"nestedOperation"` = `"nestedOperation"`

The `ToolContext.Progress` data key nested-operation progress travels under.

***

### ProgressStatus

> `const` **ProgressStatus**: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"unknown"`\]\>

Lifecycle of one nested operation as the host observes it.

***

### Render

> `const` **Render**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Artifact"`\>; `byteSize`: `Schema.Int`; `height`: `Schema.optionalKey`\<`Schema.Int`\>; `mimeType`: `Schema.String`; `path`: `Schema.String`; `width`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Diff"`\>; `patch`: `Schema.String`; `path`: `Schema.String`; \}\>\]\>

A host-derived projection of a nested operation's own outcome.

The value is produced by the handler's `render` function from the operation's real result, never
read from the request payload, so a cell that plants `render` in its input cannot dictate what
the host displays.

***

### ReplayPolicy

> `const` **ReplayPolicy**: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>

Replay policy for one nested durable operation.

***

### run

> `const` **run**: \{\<`A`, `E`, `R`\>(`effect`): (`request`) => `Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>; \<`A`, `E`, `R`\>(`request`, `effect`): `Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>; \}

Run one nested durable operation through the ambient host seam.

#### Call Signature

> \<`A`, `E`, `R`\>(`effect`): (`request`) => `Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

(`request`) => `Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>

#### Call Signature

> \<`A`, `E`, `R`\>(`request`, `effect`): `Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>

##### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

##### Parameters

###### request

[`Request`](#request)\<`A`, `E`\>

###### effect

`Effect`\<`A`, `E`, `R`\>

##### Returns

`Effect`\<`A`, [`Failure`](#failure-1) \| `E`, [`ToolContext`](./ToolContext#toolcontext) \| [`Operations`](#operations) \| `R`\>
