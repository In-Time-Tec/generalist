[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Steering

# Steering

## Classes

### InboxFull

A finite Run inbox rejected an input without admitting it.

#### Extends

- `InboxFull_base`

#### Constructors

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

##### dimension

> `readonly` **dimension**: `"bytes"` \| `"entries"`

###### Inherited from

`InboxFull_base.dimension`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InboxFull_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`InboxFull_base.limit`

##### queue

> `readonly` **queue**: `"steering"` \| `"followUp"`

###### Inherited from

`InboxFull_base.queue`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`InboxFull_base.runId`

***

### PolicyInvalid

A process-local Run inbox policy is not finite and positive.

#### Extends

- `PolicyInvalid_base`

#### Constructors

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

##### field

> `readonly` **field**: `string`

###### Inherited from

`PolicyInvalid_base.field`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyInvalid_base.hint`

##### value

> `readonly` **value**: `string`

###### Inherited from

`PolicyInvalid_base.value`

***

### RollbackRequiresRuntime

Rollback needs a durable journal and is unavailable for a process-local Run.

#### Extends

- `RollbackRequiresRuntime_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RollbackRequiresRuntime_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RollbackRequiresRuntime_base.runId`

***

### RunBusy

A reject-policy message arrived while its process-local Run was executing.

#### Extends

- `RunBusy_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunBusy_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunBusy_base.runId`

***

### RunClosed

A producer attempted to address a Run after its inbox closed.

#### Extends

- `RunClosed_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunClosed_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunClosed_base.runId`

## Interfaces

### Input

Prompt injected into a live agent run.

#### Properties

##### prompt

> `readonly` **prompt**: `RawInput`

***

### Options

Per-Run process-local steering policy.

#### Properties

##### followUp?

> `readonly` `optional` **followUp?**: [`QueuePolicy`](#queuepolicy)

##### maxPendingBytes?

> `readonly` `optional` **maxPendingBytes?**: `number`

##### steering?

> `readonly` `optional` **steering?**: [`QueuePolicy`](#queuepolicy)

***

### Producer

Producer-only process-local control capability for one Run.

#### Properties

##### followUp

> `readonly` **followUp**: (`input`) => `Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

##### steer

> `readonly` **steer**: (`input`) => `Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<\{ `bytes`: `number`; `queue`: `"steering"` \| `"followUp"`; `runId`: `string`; `sequence`: `number`; \}, [`InboxFull`](#inboxfull) \| [`RunClosed`](#runclosed)\>

***

### QueuePolicy

Policy for one steering queue.

#### Properties

##### capacity?

> `readonly` `optional` **capacity?**: `number`

##### mode?

> `readonly` `optional` **mode?**: [`DrainMode`](#drainmode)

##### onFull?

> `readonly` `optional` **onFull?**: [`OverflowStrategy`](#overflowstrategy)

## Type Aliases

### AdmissionPolicy

> **AdmissionPolicy** = *typeof* `AdmissionPolicy.Type`

When one message may enter its target Run.

***

### DrainMode

> **DrainMode** = `"all"` \| `"one-at-a-time"`

How many queued inputs to drain at a boundary.

***

### OverflowStrategy

> **OverflowStrategy** = `"fail"` \| `"backpressure"`

How a process-local producer behaves while its Run inbox is full.

***

### QueueName

> **QueueName** = `"steering"` \| `"followUp"`

Queue identity for typed steering errors.

***

### Receipt

> **Receipt** = *typeof* `Receipt.Type`

Stable receipt for one process-local Run input.

## Variables

### AdmissionPolicy

> `const` **AdmissionPolicy**: `Schema.Literals`\<readonly \[`"steer"`, `"enqueue"`, `"interrupt"`, `"rollback"`, `"reject"`\]\>

When one message may enter its target Run.

***

### defaultCapacity

> `const` **defaultCapacity**: `64` = `64`

Default maximum queued entries in each process-local or durable steering lane.

***

### defaultMaxPendingBytes

> `const` **defaultMaxPendingBytes**: `1048576` = `1048576`

Default aggregate encoded prompt bytes pending for one Run.

***

### promptBytes

> `const` **promptBytes**: (`prompt`) => `number`

Encoded size charged against the aggregate Run inbox byte bound.

#### Parameters

##### prompt

`Prompt.Prompt`

#### Returns

`number`

***

### Receipt

> `const` **Receipt**: `Schema.Struct`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}\>

Stable receipt for one process-local Run input.
