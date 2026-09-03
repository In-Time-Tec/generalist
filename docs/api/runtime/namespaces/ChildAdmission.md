[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ChildAdmission

# ChildAdmission

## Classes

### AgentChildren

#### Effect-expect-leaking

ToolContext
ToolContext is the per-call ambient identity of the running execution. Binding one Run into the
service at Layer creation would let a caller admit and cancel children under another Run, which is
exactly the forgery this contract exists to prevent.

#### Extends

- `AgentChildren_base`

#### Constructors

##### Constructor

> **new AgentChildren**(`_`): [`AgentChildren`](#agentchildren)

###### Parameters

###### \_

`never`

###### Returns

[`AgentChildren`](#agentchildren)

###### Inherited from

`AgentChildren_base.constructor`

***

### ChildParentageInvalid

A Run addressed a child it does not own.

Parentage is read from the durable child record, so knowing a child Run id grants nothing to a
Run that did not admit it.

#### Extends

- `ChildParentageInvalid_base`

#### Constructors

##### Constructor

> **new ChildParentageInvalid**(...`args`): [`ChildParentageInvalid`](#childparentageinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ChildParentageInvalid`](#childparentageinvalid)

###### Inherited from

`ChildParentageInvalid_base.constructor`

#### Properties

##### childRunId

> `readonly` **childRunId**: `string`

###### Inherited from

`ChildParentageInvalid_base.childRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildParentageInvalid_base.hint`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildParentageInvalid_base.parentRunId`

## Interfaces

### ChildAdmissionIdentity

The complete admission identity one invocation id carries.

#### Properties

##### key

> `readonly` **key**: `string`

##### origin?

> `readonly` `optional` **origin?**: [`ChildOrigin`](#childorigin)

##### toolCallId

> `readonly` **toolCallId**: `string`

***

### ChildInspection

One direct child as the parent may observe it.

#### Properties

##### childRunId

> `readonly` **childRunId**: `string`

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

##### origin?

> `readonly` `optional` **origin?**: [`ChildOrigin`](#childorigin)

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](./Run#runoutcome)

##### readiness

> `readonly` **readiness**: `"queued"` \| `"ready"` \| `"settled"`

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

***

### ChildOrigin

Where one admitted child came from, carried on the admission itself.

A cell admits many children in one tool call, so the tool call alone does not say which cell
statement produced which child, nor in what order. Origin names the operation that ran the code
and the host-assigned ordinal within it, so a presentation layer can group children under their
originating cell in source order. It is derived from the ambient `ToolContext` and the host's own
counter, never from model-authored text.

#### Properties

##### operationKey

> `readonly` **operationKey**: `string`

##### ordinal

> `readonly` **ordinal**: `number`

***

### Service

#### Properties

##### admit

> `readonly` **admit**: (`input`) => `Effect`\<\{ `childRunId`: `string`; `duplicate`: `boolean`; `key`: `string`; \}, [`AdmitChildError`](#admitchilderror)\>

###### Parameters

###### input

###### key

`string`

###### origin?

[`ChildOrigin`](#childorigin)

###### parentRunId

`string`

###### prompt

`string`

###### selection

`string`

###### toolCallId

`string`

###### Returns

`Effect`\<\{ `childRunId`: `string`; `duplicate`: `boolean`; `key`: `string`; \}, [`AdmitChildError`](#admitchilderror)\>

##### cancel

> `readonly` **cancel**: (`input`) => `Effect`\<`void`, [`ChildLookupError`](#childlookuperror)\>

###### Parameters

###### input

###### childRunId

`string`

###### parentRunId

`string`

###### reason?

`string`

###### Returns

`Effect`\<`void`, [`ChildLookupError`](#childlookuperror)\>

##### inspect

> `readonly` **inspect**: (`input`) => `Effect`\<[`ChildInspection`](#childinspection), [`ChildLookupError`](#childlookuperror)\>

###### Parameters

###### input

###### childRunId

`string`

###### parentRunId

`string`

###### Returns

`Effect`\<[`ChildInspection`](#childinspection), [`ChildLookupError`](#childlookuperror)\>

##### join

> `readonly` **join**: (`input`) => `Effect`\<[`ChildInspection`](#childinspection), [`ChildLookupError`](#childlookuperror)\>

Read a child's current state. This does NOT block until the child is terminal: an admission
handle never carries an answer, so a caller that must wait polls this or follows Run events.

###### Parameters

###### input

###### childRunId

`string`

###### parentRunId

`string`

###### Returns

`Effect`\<[`ChildInspection`](#childinspection), [`ChildLookupError`](#childlookuperror)\>

##### listDirect

> `readonly` **listDirect**: (`parentRunId`) => `Effect`\<readonly [`ChildInspection`](#childinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### parentRunId

`string`

###### Returns

`Effect`\<readonly [`ChildInspection`](#childinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

## Type Aliases

### AdmitChildError

> **AdmitChildError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

Non-blocking direct-child operations scoped to one parent Run.

Every operation takes the parent Run id the host derived from the ambient `ToolContext`. Model
code never supplies parentage, so a child cannot be adopted, inspected, or cancelled by a Run
that does not own it.

***

### AdmitParameters

> **AdmitParameters** = *typeof* `AdmitParameters.Type`

Parameters for one non-blocking child admission.

***

### AdmitReceipt

> **AdmitReceipt** = *typeof* `AdmitReceipt.Type`

Stable receipt returned at admission, never an outcome.

Admission answers "which durable child owns this work", not "what did it produce". A caller that
wants the answer joins explicitly, so a crash between admission and join never loses the child.

***

### ChildLookupError

> **ChildLookupError** = [`ChildParentageInvalid`](#childparentageinvalid) \| [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

## Variables

### admissionOf

> `const` **admissionOf**: (`invocationId`) => [`ChildAdmissionIdentity`](#childadmissionidentity) \| `undefined`

Read the admission identity an invocation id encodes, if it is one.

#### Parameters

##### invocationId

`string`

#### Returns

[`ChildAdmissionIdentity`](#childadmissionidentity) \| `undefined`

***

### AdmitParameters

> `const` **AdmitParameters**: `Schema.Struct`\<\{ `key`: `Schema.String`; `prompt`: `Schema.String`; `selection`: `Schema.String`; \}\>

Parameters for one non-blocking child admission.

***

### AdmitReceipt

> `const` **AdmitReceipt**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `duplicate`: `Schema.Boolean`; `key`: `Schema.String`; \}\>

Stable receipt returned at admission, never an outcome.

Admission answers "which durable child owns this work", not "what did it produce". A caller that
wants the answer joins explicitly, so a crash between admission and join never loses the child.

***

### invocationIdFor

> `const` **invocationIdFor**: (`input`) => `string`

The invocation identity one admission key names beneath its parent.

Origin travels inside the invocation id because `invocationId` is the one admission field that
Generalist already carries into `ChildLinked` and every canonical child-tree event. Encoding it here
means correlation survives replay, restart, and reload with no event-schema change and no
reconstruction from cell source.

#### Parameters

##### input

###### key

`string`

###### origin?

[`ChildOrigin`](#childorigin)

###### toolCallId

`string`

#### Returns

`string`

***

### make

> `const` **make**: (`store`) => [`Service`](#service)

Build non-blocking child admission over one RunStore.

This is additive: blocking `invoke` and the child-group operations keep their existing semantics.
A host that wants an immediate handle uses `admit`; a host that wants the loop to wait uses the
blocking route exactly as before.

#### Parameters

##### store

[`Service`](./RunStore#service)

#### Returns

[`Service`](#service)

***

### makeAgentChildren

> `const` **makeAgentChildren**: (`store`) => [`AgentChildren`](#agentchildren)\[`"Service"`\]

Build in-execution direct-child operations over one RunStore.

The ordinal is derived from the parent's own durable children, never from an in-process counter
and never from the caller's payload. Two properties depend on that choice. It is unforgeable,
because cell code cannot influence what the Run store already recorded. And it is stable across
replay: the ordinal is encoded into the invocation id, which derives the idempotency key, so a
counter that restarted at zero after a restart would mint a second invocation id for the same
logical spawn and silently duplicate a child Run. A key already admitted under this operation
keeps the exact ordinal it was first given; only a genuinely new key extends the sequence.

This costs one direct-child read per admission. That cost is deliberate: caching the sequence in
process would reintroduce exactly the duplicate-child failure above, so restart safety is chosen
over speed here and the read must not be optimised away.

#### Parameters

##### store

[`Service`](./RunStore#service)

#### Returns

[`AgentChildren`](#agentchildren)\[`"Service"`\]

***

### originOf

> `const` **originOf**: (`invocationId`) => [`ChildOrigin`](#childorigin) \| `undefined`

Read the origin an invocation id carries, if it carries one.

#### Parameters

##### invocationId

`string`

#### Returns

[`ChildOrigin`](#childorigin) \| `undefined`

***

### parentRunId

> `const` **parentRunId**: `Effect.Effect`\<`string`, [`ChildParentageInvalid`](#childparentageinvalid), [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>

Parent Run identity the host derived, never text the model supplied.

A route reads parentage here rather than from tool parameters, which is what makes admission,
inspection, and cancellation unforgeable from model code.
