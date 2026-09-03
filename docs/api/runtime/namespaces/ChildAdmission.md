[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ChildAdmission

# ChildAdmission

## Classes

<a id="agentchildren"></a>

### AgentChildren

#### Effect-expect-leaking

ToolContext
ToolContext is the per-call ambient identity of the running execution. Binding one Run into the
service at Layer creation would let a caller admit and cancel children under another Run, which is
exactly the forgery this contract exists to prevent.

#### Extends

- `AgentChildren_base`

#### Constructors

<a id="constructor"></a>

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

<a id="childparentageinvalid"></a>

### ChildParentageInvalid

A Run addressed a child it does not own.

Parentage is read from the durable child record, so knowing a child Run id grants nothing to a
Run that did not admit it.

#### Extends

- `ChildParentageInvalid_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="childrunid"></a>

##### childRunId

> `readonly` **childRunId**: `string`

###### Inherited from

`ChildParentageInvalid_base.childRunId`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildParentageInvalid_base.hint`

<a id="parentrunid"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildParentageInvalid_base.parentRunId`

## Interfaces

<a id="childadmissionidentity"></a>

### ChildAdmissionIdentity

The complete admission identity one invocation id carries.

#### Properties

<a id="key"></a>

##### key

> `readonly` **key**: `string`

<a id="origin"></a>

##### origin?

> `readonly` `optional` **origin?**: [`ChildOrigin`](#childorigin)

<a id="toolcallid"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="childinspection"></a>

### ChildInspection

One direct child as the parent may observe it.

#### Properties

<a id="childrunid-1"></a>

##### childRunId

> `readonly` **childRunId**: `string`

<a id="invocationid"></a>

##### invocationId?

> `readonly` `optional` **invocationId?**: `string`

<a id="origin-1"></a>

##### origin?

> `readonly` `optional` **origin?**: [`ChildOrigin`](#childorigin)

<a id="outcome"></a>

##### outcome?

> `readonly` `optional` **outcome?**: [`RunOutcome`](./Run#runoutcome)

<a id="readiness"></a>

##### readiness

> `readonly` **readiness**: `"queued"` \| `"ready"` \| `"settled"`

<a id="status"></a>

##### status

> `readonly` **status**: `"queued"` \| `"running"` \| `"waiting"` \| `"needs-resolution"` \| `"cancelling"` \| `"succeeded"` \| `"failed"` \| `"cancelled"`

***

<a id="childorigin"></a>

### ChildOrigin

Where one admitted child came from, carried on the admission itself.

A cell admits many children in one tool call, so the tool call alone does not say which cell
statement produced which child, nor in what order. Origin names the operation that ran the code
and the host-assigned ordinal within it, so a presentation layer can group children under their
originating cell in source order. It is derived from the ambient `ToolContext` and the host's own
counter, never from model-authored text.

#### Properties

<a id="operationkey"></a>

##### operationKey

> `readonly` **operationKey**: `string`

<a id="ordinal"></a>

##### ordinal

> `readonly` **ordinal**: `number`

***

<a id="service"></a>

### Service

#### Properties

<a id="admit"></a>

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

<a id="cancel"></a>

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

<a id="inspect"></a>

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

<a id="join"></a>

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

<a id="listdirect"></a>

##### listDirect

> `readonly` **listDirect**: (`parentRunId`) => `Effect`\<readonly [`ChildInspection`](#childinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

###### Parameters

###### parentRunId

`string`

###### Returns

`Effect`\<readonly [`ChildInspection`](#childinspection)[], [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`RunNotFound`](./Errors#runnotfound)\>

## Type Aliases

<a id="admitchilderror"></a>

### AdmitChildError

> **AdmitChildError** = [`ChildDepthExceeded`](./Errors#childdepthexceeded) \| [`ChildLimitExceeded`](./Errors#childlimitexceeded) \| [`ChildSelectionMissing`](./Errors#childselectionmissing) \| [`IdempotencyConflict`](./Errors#idempotencyconflict) \| [`RunIdConflict`](./Errors#runidconflict) \| [`RunNotFound`](./Errors#runnotfound) \| [`RunTerminal`](./Errors#runterminal) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable) \| [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted)

Non-blocking direct-child operations scoped to one parent Run.

Every operation takes the parent Run id the host derived from the ambient `ToolContext`. Model
code never supplies parentage, so a child cannot be adopted, inspected, or cancelled by a Run
that does not own it.

***

<a id="admitparameters"></a>

### AdmitParameters

> **AdmitParameters** = *typeof* `AdmitParameters.Type`

Parameters for one non-blocking child admission.

***

<a id="admitreceipt"></a>

### AdmitReceipt

> **AdmitReceipt** = *typeof* `AdmitReceipt.Type`

Stable receipt returned at admission, never an outcome.

Admission answers "which durable child owns this work", not "what did it produce". A caller that
wants the answer joins explicitly, so a crash between admission and join never loses the child.

***

<a id="childlookuperror"></a>

### ChildLookupError

> **ChildLookupError** = [`ChildParentageInvalid`](#childparentageinvalid) \| [`RunNotFound`](./Errors#runnotfound) \| [`RuntimeUnavailable`](./Errors#runtimeunavailable)

## Variables

<a id="admissionof"></a>

### admissionOf

> `const` **admissionOf**: (`invocationId`) => [`ChildAdmissionIdentity`](#childadmissionidentity) \| `undefined`

Read the admission identity an invocation id encodes, if it is one.

#### Parameters

##### invocationId

`string`

#### Returns

[`ChildAdmissionIdentity`](#childadmissionidentity) \| `undefined`

***

<a id="admitparameters-1"></a>

### AdmitParameters

> `const` **AdmitParameters**: `Schema.Struct`\<\{ `key`: `Schema.String`; `prompt`: `Schema.String`; `selection`: `Schema.String`; \}\>

Parameters for one non-blocking child admission.

***

<a id="admitreceipt-1"></a>

### AdmitReceipt

> `const` **AdmitReceipt**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `duplicate`: `Schema.Boolean`; `key`: `Schema.String`; \}\>

Stable receipt returned at admission, never an outcome.

Admission answers "which durable child owns this work", not "what did it produce". A caller that
wants the answer joins explicitly, so a crash between admission and join never loses the child.

***

<a id="invocationidfor"></a>

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

<a id="make"></a>

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

<a id="makeagentchildren"></a>

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

<a id="originof"></a>

### originOf

> `const` **originOf**: (`invocationId`) => [`ChildOrigin`](#childorigin) \| `undefined`

Read the origin an invocation id carries, if it carries one.

#### Parameters

##### invocationId

`string`

#### Returns

[`ChildOrigin`](#childorigin) \| `undefined`

***

<a id="parentrunid-1"></a>

### parentRunId

> `const` **parentRunId**: `Effect.Effect`\<`string`, [`ChildParentageInvalid`](#childparentageinvalid), [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>

Parent Run identity the host derived, never text the model supplied.

A route reads parentage here rather than from tool parameters, which is what makes admission,
inspection, and cancellation unforgeable from model code.
