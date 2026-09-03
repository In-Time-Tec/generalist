[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / NestedOperation

# NestedOperation

## Classes

<a id="denied"></a>

### Denied

The host denied the nested operation's approval request.

#### Extends

- `Denied_base`

#### Constructors

<a id="constructor"></a>

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

<a id="capability"></a>

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`Denied_base.capability`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Denied_base.hint`

<a id="operationkey"></a>

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Denied_base.operationKey`

<a id="ordinal"></a>

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Denied_base.ordinal`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

###### Inherited from

`Denied_base.reason`

***

<a id="divergence"></a>

### Divergence

The same nested identity was reused with different content.

#### Extends

- `Divergence_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Divergence_base.hint`

<a id="operationkey-1"></a>

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Divergence_base.operationKey`

<a id="ordinal-1"></a>

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Divergence_base.ordinal`

<a id="recordeddigest"></a>

##### recordedDigest

> `readonly` **recordedDigest**: `string`

###### Inherited from

`Divergence_base.recordedDigest`

<a id="recordedkind"></a>

##### recordedKind

> `readonly` **recordedKind**: `string`

###### Inherited from

`Divergence_base.recordedKind`

<a id="requesteddigest"></a>

##### requestedDigest

> `readonly` **requestedDigest**: `string`

###### Inherited from

`Divergence_base.requestedDigest`

<a id="requestedkind"></a>

##### requestedKind

> `readonly` **requestedKind**: `string`

###### Inherited from

`Divergence_base.requestedKind`

***

<a id="operations"></a>

### Operations

#### Extends

- `Operations_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="suspended"></a>

### Suspended

The run must suspend until the host resolves the nested operation's approval.

#### Extends

- `Suspended_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="capability-1"></a>

##### capability

> `readonly` **capability**: `string`

###### Inherited from

`Suspended_base.capability`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Suspended_base.hint`

<a id="operationkey-2"></a>

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Suspended_base.operationKey`

<a id="ordinal-2"></a>

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Suspended_base.ordinal`

<a id="token"></a>

##### token

> `readonly` **token**: `string`

###### Inherited from

`Suspended_base.token`

***

<a id="unknown"></a>

### Unknown

A non-idempotent nested operation crossed its boundary with an unobserved outcome.

#### Extends

- `Unknown_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`Unknown_base.hint`

<a id="operationid"></a>

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`Unknown_base.operationId`

<a id="operationkey-3"></a>

##### operationKey

> `readonly` **operationKey**: `string`

###### Inherited from

`Unknown_base.operationKey`

<a id="ordinal-3"></a>

##### ordinal

> `readonly` **ordinal**: `number`

###### Inherited from

`Unknown_base.ordinal`

## Interfaces

<a id="request"></a>

### Request

#### Type Parameters

##### A

`A` = `unknown`

##### E

`E` = `unknown`

#### Properties

<a id="approval"></a>

##### approval?

> `readonly` `optional` **approval?**: `object`

###### capability

> `readonly` **capability**: `string`

###### request?

> `readonly` `optional` **request?**: `unknown`

<a id="failure"></a>

##### failure?

> `readonly` `optional` **failure?**: `Codec`\<`E`, `unknown`, `never`, `never`\>

<a id="kind"></a>

##### kind

> `readonly` **kind**: `string`

<a id="payload"></a>

##### payload

> `readonly` **payload**: `unknown`

<a id="render"></a>

##### render?

> `readonly` `optional` **render?**: (`value`) => \{ `_tag`: `"Artifact"`; `byteSize`: `number`; `height?`: `number`; `mimeType`: `string`; `path`: `string`; `width?`: `number`; \} \| \{ `_tag`: `"Diff"`; `patch`: `string`; `path`: `string`; \}

###### Parameters

###### value

`A`

###### Returns

\{ `_tag`: `"Artifact"`; `byteSize`: `number`; `height?`: `number`; `mimeType`: `string`; `path`: `string`; `width?`: `number`; \} \| \{ `_tag`: `"Diff"`; `patch`: `string`; `path`: `string`; \}

<a id="replaypolicy"></a>

##### replayPolicy

> `readonly` **replayPolicy**: `"pure"` \| `"provider-idempotent"` \| `"never"`

<a id="success"></a>

##### success?

> `readonly` `optional` **success?**: `Codec`\<`A`, `unknown`, `never`, `never`\>

***

<a id="service"></a>

### Service

Host seam executing one nested durable operation for a composite tool call.

Identity is derived, never supplied: the ambient `ToolContext` names the outer operation and the
host assigns the ordinal, so cell or tool code cannot forge, reorder, or collide with another
call's journal.

#### Properties

<a id="run"></a>

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

<a id="approvalrequirement"></a>

### ApprovalRequirement

> **ApprovalRequirement** = *typeof* `ApprovalRequirement.Type`

Authorization the host must settle before the handler crosses its boundary.

***

<a id="failure-1"></a>

### Failure

> **Failure** = [`Divergence`](#divergence) \| [`Unknown`](#unknown) \| [`Denied`](#denied) \| [`Suspended`](#suspended)

***

<a id="identity"></a>

### Identity

> **Identity** = *typeof* `Identity.Type`

Derived identity of one nested operation beneath a composite tool call.

***

<a id="progress"></a>

### Progress

> **Progress** = *typeof* `Progress.Type`

One nested-operation progress record a host projects.

***

<a id="progressstatus"></a>

### ProgressStatus

> **ProgressStatus** = *typeof* `ProgressStatus.Type`

Lifecycle of one nested operation as the host observes it.

***

<a id="render-1"></a>

### Render

> **Render** = *typeof* `Render.Type`

A host-derived projection of a nested operation's own outcome.

The value is produced by the handler's `render` function from the operation's real result, never
read from the request payload, so a cell that plants `render` in its input cannot dictate what
the host displays.

***

<a id="replaypolicy-1"></a>

### ReplayPolicy

> **ReplayPolicy** = *typeof* `ReplayPolicy.Type`

Replay policy for one nested durable operation.

## Variables

<a id="approvalrequirement-1"></a>

### ApprovalRequirement

> `const` **ApprovalRequirement**: `Schema.Struct`\<\{ `capability`: `Schema.String`; `request`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>

Authorization the host must settle before the handler crosses its boundary.

***

<a id="catchsuspension"></a>

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

<a id="identity-1"></a>

### Identity

> `const` **Identity**: `Schema.Struct`\<\{ `kind`: `Schema.String`; `operationKey`: `Schema.String`; `ordinal`: `Schema.Int`; `payloadDigest`: `Schema.String`; \}\>

Derived identity of one nested operation beneath a composite tool call.

***

<a id="layerdirect"></a>

### layerDirect

> `const` **layerDirect**: `Layer.Layer`\<[`Operations`](#operations)\>

Process-local nested operations for hosts without durable storage.

Identity, duplicate return, and divergence hold for the life of the run; approvals auto-approve
because a process-local host owns no resolution seam.

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Operations`](#operations)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Operations`](#operations)\>

***

<a id="maxrenderbytes"></a>

### maxRenderBytes

> `const` **maxRenderBytes**: `number`

A projection larger than this is withheld whole rather than truncated.

***

<a id="operationid-1"></a>

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

<a id="payloaddigest"></a>

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

<a id="progress-1"></a>

### Progress

> `const` **Progress**: `Schema.Struct`\<\{ `kind`: `Schema.String`; `ordinal`: `Schema.Int`; `render`: `Schema.optionalKey`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Artifact"`\>; `byteSize`: `Schema.Int`; `height`: `Schema.optionalKey`\<`Schema.Int`\>; `mimeType`: `Schema.String`; `path`: `Schema.String`; `width`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Diff"`\>; `patch`: `Schema.String`; `path`: `Schema.String`; \}\>\]\>\>; `renderWithheldBytes`: `Schema.optionalKey`\<`Schema.Int`\>; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"unknown"`\]\>; \}\>

One nested-operation progress record a host projects.

***

<a id="progressdata"></a>

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

<a id="progresskey"></a>

### progressKey

> `const` **progressKey**: `"nestedOperation"` = `"nestedOperation"`

The `ToolContext.Progress` data key nested-operation progress travels under.

***

<a id="progressstatus-1"></a>

### ProgressStatus

> `const` **ProgressStatus**: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"unknown"`\]\>

Lifecycle of one nested operation as the host observes it.

***

<a id="render-2"></a>

### Render

> `const` **Render**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Artifact"`\>; `byteSize`: `Schema.Int`; `height`: `Schema.optionalKey`\<`Schema.Int`\>; `mimeType`: `Schema.String`; `path`: `Schema.String`; `width`: `Schema.optionalKey`\<`Schema.Int`\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Diff"`\>; `patch`: `Schema.String`; `path`: `Schema.String`; \}\>\]\>

A host-derived projection of a nested operation's own outcome.

The value is produced by the handler's `render` function from the operation's real result, never
read from the request payload, so a cell that plants `render` in its input cannot dictate what
the host displays.

***

<a id="replaypolicy-2"></a>

### ReplayPolicy

> `const` **ReplayPolicy**: `Schema.Literals`\<readonly \[`"pure"`, `"provider-idempotent"`, `"never"`\]\>

Replay policy for one nested durable operation.

***

<a id="run-1"></a>

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
