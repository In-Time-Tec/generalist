[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Steering

# Steering

## Classes

<a id="inboxfull"></a>

### InboxFull

A finite Run inbox rejected an input without admitting it.

#### Extends

- `InboxFull_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new InboxFull**(...`args`): [`InboxFull`](#inboxfull)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InboxFull`](#inboxfull)

###### Inherited from

`InboxFull_base.constructor`

#### Properties

<a id="dimension"></a>

##### dimension

> `readonly` **dimension**: `"bytes"` \| `"entries"`

###### Inherited from

`InboxFull_base.dimension`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InboxFull_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`InboxFull_base.limit`

<a id="queue"></a>

##### queue

> `readonly` **queue**: `"steering"` \| `"followUp"`

###### Inherited from

`InboxFull_base.queue`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`InboxFull_base.runId`

***

<a id="policyinvalid"></a>

### PolicyInvalid

A process-local Run inbox policy is not finite and positive.

#### Extends

- `PolicyInvalid_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new PolicyInvalid**(...`args`): [`PolicyInvalid`](#policyinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PolicyInvalid`](#policyinvalid)

###### Inherited from

`PolicyInvalid_base.constructor`

#### Properties

<a id="field"></a>

##### field

> `readonly` **field**: `string`

###### Inherited from

`PolicyInvalid_base.field`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyInvalid_base.hint`

<a id="value"></a>

##### value

> `readonly` **value**: `string`

###### Inherited from

`PolicyInvalid_base.value`

***

<a id="rollbackrequiresruntime"></a>

### RollbackRequiresRuntime

Rollback needs a durable journal and is unavailable for a process-local Run.

#### Extends

- `RollbackRequiresRuntime_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new RollbackRequiresRuntime**(...`args`): [`RollbackRequiresRuntime`](#rollbackrequiresruntime)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RollbackRequiresRuntime`](#rollbackrequiresruntime)

###### Inherited from

`RollbackRequiresRuntime_base.constructor`

#### Properties

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RollbackRequiresRuntime_base.hint`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RollbackRequiresRuntime_base.runId`

***

<a id="runbusy"></a>

### RunBusy

A reject-policy message arrived while its process-local Run was executing.

#### Extends

- `RunBusy_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new RunBusy**(...`args`): [`RunBusy`](#runbusy)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunBusy`](#runbusy)

###### Inherited from

`RunBusy_base.constructor`

#### Properties

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunBusy_base.hint`

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunBusy_base.runId`

***

<a id="runclosed"></a>

### RunClosed

A producer attempted to address a Run after its inbox closed.

#### Extends

- `RunClosed_base`

#### Constructors

<a id="constructor-4"></a>

##### Constructor

> **new RunClosed**(...`args`): [`RunClosed`](#runclosed)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunClosed`](#runclosed)

###### Inherited from

`RunClosed_base.constructor`

#### Properties

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunClosed_base.hint`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunClosed_base.runId`

## Interfaces

<a id="input"></a>

### Input

Prompt injected into a live agent run.

#### Properties

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

***

<a id="options"></a>

### Options

Per-Run process-local steering policy.

#### Properties

<a id="followup"></a>

##### followUp?

> `readonly` `optional` **followUp?**: [`QueuePolicy`](#queuepolicy)

<a id="maxpendingbytes"></a>

##### maxPendingBytes?

> `readonly` `optional` **maxPendingBytes?**: `number`

<a id="steering"></a>

##### steering?

> `readonly` `optional` **steering?**: [`QueuePolicy`](#queuepolicy)

***

<a id="producer"></a>

### Producer

Producer-only process-local control capability for one Run.

#### Properties

<a id="followup-1"></a>

##### followUp

> `readonly` **followUp**: (`input`) => `Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

<a id="steer"></a>

##### steer

> `readonly` **steer**: (`input`) => `Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

***

<a id="queuepolicy"></a>

### QueuePolicy

Policy for one steering queue.

#### Properties

<a id="capacity"></a>

##### capacity?

> `readonly` `optional` **capacity?**: `number`

<a id="mode"></a>

##### mode?

> `readonly` `optional` **mode?**: [`DrainMode`](#drainmode)

<a id="onfull"></a>

##### onFull?

> `readonly` `optional` **onFull?**: [`OverflowStrategy`](#overflowstrategy)

## Type Aliases

<a id="admissionpolicy"></a>

### AdmissionPolicy

> **AdmissionPolicy** = *typeof* `AdmissionPolicy.Type`

When one message may enter its target Run.

***

<a id="drainmode"></a>

### DrainMode

> **DrainMode** = `"all"` \| `"one-at-a-time"`

How many queued inputs to drain at a boundary.

***

<a id="overflowstrategy"></a>

### OverflowStrategy

> **OverflowStrategy** = `"fail"` \| `"backpressure"`

How a process-local producer behaves while its Run inbox is full.

***

<a id="queuename"></a>

### QueueName

> **QueueName** = `"steering"` \| `"followUp"`

Queue identity for typed steering errors.

***

<a id="receipt"></a>

### Receipt

> **Receipt** = *typeof* `Receipt.Type`

Stable receipt for one process-local Run input.

## Variables

<a id="admissionpolicy-1"></a>

### AdmissionPolicy

> `const` **AdmissionPolicy**: `Schema.Literals`\<readonly \[`"steer"`, `"enqueue"`, `"interrupt"`, `"rollback"`, `"reject"`\]\>

When one message may enter its target Run.

***

<a id="defaultcapacity"></a>

### defaultCapacity

> `const` **defaultCapacity**: `64` = `64`

Default maximum queued entries in each process-local or durable steering lane.

***

<a id="defaultmaxpendingbytes"></a>

### defaultMaxPendingBytes

> `const` **defaultMaxPendingBytes**: `1048576` = `1048576`

Default aggregate encoded prompt bytes pending for one Run.

***

<a id="promptbytes"></a>

### promptBytes

> `const` **promptBytes**: (`prompt`) => `number`

Encoded size charged against the aggregate Run inbox byte bound.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`number`

***

<a id="receipt-1"></a>

### Receipt

> `const` **Receipt**: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

Stable receipt for one process-local Run input.
