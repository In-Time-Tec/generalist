[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Errors

# Errors

## Classes

<a id="ackbeyondcommitted"></a>

### AckBeyondCommitted

The acknowledged sequence is beyond the last committed model cycle.

#### Extends

- `AckBeyondCommitted_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AckBeyondCommitted**(...`args`): [`AckBeyondCommitted`](#ackbeyondcommitted)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AckBeyondCommitted`](#ackbeyondcommitted)

###### Inherited from

`AckBeyondCommitted_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AckBeyondCommitted_base.hint`

<a id="lastcommittedsequence"></a>

##### lastCommittedSequence

> `readonly` **lastCommittedSequence**: `number`

###### Inherited from

`AckBeyondCommitted_base.lastCommittedSequence`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`AckBeyondCommitted_base.runId`

<a id="sequence"></a>

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`AckBeyondCommitted_base.sequence`

***

<a id="ackinvalid"></a>

### AckInvalid

The acknowledged sequence is not a valid processed-through point for the Run.

#### Extends

- `AckInvalid_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new AckInvalid**(...`args`): [`AckInvalid`](#ackinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AckInvalid`](#ackinvalid)

###### Inherited from

`AckInvalid_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AckInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AckInvalid_base.message`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`AckInvalid_base.runId`

<a id="sequence-1"></a>

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`AckInvalid_base.sequence`

***

<a id="addressnotfound"></a>

### AddressNotFound

#### Extends

- `AddressNotFound_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new AddressNotFound**(...`args`): [`AddressNotFound`](#addressnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AddressNotFound`](#addressnotfound)

###### Inherited from

`AddressNotFound_base.constructor`

#### Properties

<a id="address"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

`AddressNotFound_base.address`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AddressNotFound_base.hint`

***

<a id="agentexecutionfailure"></a>

### AgentExecutionFailure

#### Extends

- `AgentExecutionFailure_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new AgentExecutionFailure**(...`args`): [`AgentExecutionFailure`](#agentexecutionfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentExecutionFailure`](#agentexecutionfailure)

###### Inherited from

`AgentExecutionFailure_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AgentExecutionFailure_base.cause`

<a id="failure"></a>

##### failure?

> `readonly` `optional` **failure?**: [`StructuredAgentFailure`](#structuredagentfailure)

###### Inherited from

`AgentExecutionFailure_base.failure`

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentExecutionFailure_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentExecutionFailure_base.message`

***

<a id="agentnameconflict"></a>

### AgentNameConflict

#### Extends

- `AgentNameConflict_base`

#### Constructors

<a id="constructor-4"></a>

##### Constructor

> **new AgentNameConflict**(...`args`): [`AgentNameConflict`](#agentnameconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentNameConflict`](#agentnameconflict)

###### Inherited from

`AgentNameConflict_base.constructor`

#### Properties

<a id="existingrunid"></a>

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`AgentNameConflict_base.existingRunId`

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentNameConflict_base.hint`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentNameConflict_base.name`

<a id="scope"></a>

##### scope

> `readonly` **scope**: `string`

###### Inherited from

`AgentNameConflict_base.scope`

***

<a id="approvalmismatch"></a>

### ApprovalMismatch

The response conflicts with the authoritative approval identity or decision.

#### Extends

- `ApprovalMismatch_base`

#### Constructors

<a id="constructor-5"></a>

##### Constructor

> **new ApprovalMismatch**(...`args`): [`ApprovalMismatch`](#approvalmismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ApprovalMismatch`](#approvalmismatch)

###### Inherited from

`ApprovalMismatch_base.constructor`

#### Properties

<a id="approvalid"></a>

##### approvalId

> `readonly` **approvalId**: `string`

###### Inherited from

`ApprovalMismatch_base.approvalId`

<a id="expectedapprovalid"></a>

##### expectedApprovalId?

> `readonly` `optional` **expectedApprovalId?**: `string`

###### Inherited from

`ApprovalMismatch_base.expectedApprovalId`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalMismatch_base.hint`

<a id="mismatch"></a>

##### mismatch

> `readonly` **mismatch**: `"decision"` \| `"approval-id"` \| `"wait-kind"`

###### Inherited from

`ApprovalMismatch_base.mismatch`

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ApprovalMismatch_base.runId`

***

<a id="approvalstale"></a>

### ApprovalStale

The approval no longer names an unresolved request.

#### Extends

- `ApprovalStale_base`

#### Constructors

<a id="constructor-6"></a>

##### Constructor

> **new ApprovalStale**(...`args`): [`ApprovalStale`](#approvalstale)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ApprovalStale`](#approvalstale)

###### Inherited from

`ApprovalStale_base.constructor`

#### Properties

<a id="approvalid-1"></a>

##### approvalId

> `readonly` **approvalId**: `string`

###### Inherited from

`ApprovalStale_base.approvalId`

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalStale_base.hint`

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ApprovalStale_base.runId`

***

<a id="childdepthexceeded"></a>

### ChildDepthExceeded

#### Extends

- `ChildDepthExceeded_base`

#### Constructors

<a id="constructor-7"></a>

##### Constructor

> **new ChildDepthExceeded**(...`args`): [`ChildDepthExceeded`](#childdepthexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ChildDepthExceeded`](#childdepthexceeded)

###### Inherited from

`ChildDepthExceeded_base.constructor`

#### Properties

<a id="current"></a>

##### current

> `readonly` **current**: `number`

###### Inherited from

`ChildDepthExceeded_base.current`

<a id="depth"></a>

##### depth

> `readonly` **depth**: `number`

###### Inherited from

`ChildDepthExceeded_base.depth`

<a id="hint-7"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildDepthExceeded_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ChildDepthExceeded_base.limit`

<a id="parentdepth"></a>

##### parentDepth

> `readonly` **parentDepth**: `number`

###### Inherited from

`ChildDepthExceeded_base.parentDepth`

<a id="parentrunid"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildDepthExceeded_base.parentRunId`

<a id="requested"></a>

##### requested

> `readonly` **requested**: `number`

###### Inherited from

`ChildDepthExceeded_base.requested`

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`ChildDepthExceeded_base.rootRunId`

***

<a id="childlimitexceeded"></a>

### ChildLimitExceeded

#### Extends

- `ChildLimitExceeded_base`

#### Constructors

<a id="constructor-8"></a>

##### Constructor

> **new ChildLimitExceeded**(...`args`): [`ChildLimitExceeded`](#childlimitexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ChildLimitExceeded`](#childlimitexceeded)

###### Inherited from

`ChildLimitExceeded_base.constructor`

#### Properties

<a id="current-1"></a>

##### current

> `readonly` **current**: `number`

###### Inherited from

`ChildLimitExceeded_base.current`

<a id="depth-1"></a>

##### depth

> `readonly` **depth**: `number`

###### Inherited from

`ChildLimitExceeded_base.depth`

<a id="hint-8"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildLimitExceeded_base.hint`

<a id="limit-1"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ChildLimitExceeded_base.limit`

<a id="parentdepth-1"></a>

##### parentDepth

> `readonly` **parentDepth**: `number`

###### Inherited from

`ChildLimitExceeded_base.parentDepth`

<a id="parentrunid-1"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildLimitExceeded_base.parentRunId`

<a id="requested-1"></a>

##### requested

> `readonly` **requested**: `number`

###### Inherited from

`ChildLimitExceeded_base.requested`

<a id="rootrunid-1"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`ChildLimitExceeded_base.rootRunId`

***

<a id="childselectionmissing"></a>

### ChildSelectionMissing

#### Extends

- `ChildSelectionMissing_base`

#### Constructors

<a id="constructor-9"></a>

##### Constructor

> **new ChildSelectionMissing**(...`args`): [`ChildSelectionMissing`](#childselectionmissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ChildSelectionMissing`](#childselectionmissing)

###### Inherited from

`ChildSelectionMissing_base.constructor`

#### Properties

<a id="hint-9"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildSelectionMissing_base.hint`

<a id="parentrunid-2"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildSelectionMissing_base.parentRunId`

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

###### Inherited from

`ChildSelectionMissing_base.selection`

***

<a id="cursorexpired"></a>

### CursorExpired

#### Extends

- `CursorExpired_base`

#### Constructors

<a id="constructor-10"></a>

##### Constructor

> **new CursorExpired**(...`args`): [`CursorExpired`](#cursorexpired)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CursorExpired`](#cursorexpired)

###### Inherited from

`CursorExpired_base.constructor`

#### Properties

<a id="cursor"></a>

##### cursor

> `readonly` **cursor**: `number`

###### Inherited from

`CursorExpired_base.cursor`

<a id="earliestsequence"></a>

##### earliestSequence

> `readonly` **earliestSequence**: `number`

###### Inherited from

`CursorExpired_base.earliestSequence`

<a id="hint-10"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CursorExpired_base.hint`

<a id="runid-4"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`CursorExpired_base.runId`

***

<a id="duplicateagent"></a>

### DuplicateAgent

An Agent name is already registered in this Runtime process.

#### Extends

- `DuplicateAgent_base`

#### Constructors

<a id="constructor-11"></a>

##### Constructor

> **new DuplicateAgent**(...`args`): [`DuplicateAgent`](#duplicateagent)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DuplicateAgent`](#duplicateagent)

###### Inherited from

`DuplicateAgent_base.constructor`

#### Properties

<a id="hint-11"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DuplicateAgent_base.hint`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`DuplicateAgent_base.name`

***

<a id="executableidentitymismatch"></a>

### ExecutableIdentityMismatch

#### Extends

- `ExecutableIdentityMismatch_base`

#### Constructors

<a id="constructor-12"></a>

##### Constructor

> **new ExecutableIdentityMismatch**(...`args`): [`ExecutableIdentityMismatch`](#executableidentitymismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutableIdentityMismatch`](#executableidentitymismatch)

###### Inherited from

`ExecutableIdentityMismatch_base.constructor`

#### Properties

<a id="actualref"></a>

##### actualRef

> `readonly` **actualRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutableIdentityMismatch_base.actualRef`

<a id="expectedref"></a>

##### expectedRef

> `readonly` **expectedRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutableIdentityMismatch_base.expectedRef`

<a id="hint-12"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableIdentityMismatch_base.hint`

<a id="runid-5"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ExecutableIdentityMismatch_base.runId`

***

<a id="executablepinmissing"></a>

### ExecutablePinMissing

#### Extends

- `ExecutablePinMissing_base`

#### Constructors

<a id="constructor-13"></a>

##### Constructor

> **new ExecutablePinMissing**(...`args`): [`ExecutablePinMissing`](#executablepinmissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutablePinMissing`](#executablepinmissing)

###### Inherited from

`ExecutablePinMissing_base.constructor`

#### Properties

<a id="hint-13"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutablePinMissing_base.hint`

<a id="ref"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutablePinMissing_base.ref`

<a id="runid-6"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ExecutablePinMissing_base.runId`

***

<a id="executableregistrationconflict"></a>

### ExecutableRegistrationConflict

#### Extends

- `ExecutableRegistrationConflict_base`

#### Constructors

<a id="constructor-14"></a>

##### Constructor

> **new ExecutableRegistrationConflict**(...`args`): [`ExecutableRegistrationConflict`](#executableregistrationconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutableRegistrationConflict`](#executableregistrationconflict)

###### Inherited from

`ExecutableRegistrationConflict_base.constructor`

#### Properties

<a id="hint-14"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationConflict_base.hint`

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string`

###### Inherited from

`ExecutableRegistrationConflict_base.pin`

***

<a id="executableregistrationinvalid"></a>

### ExecutableRegistrationInvalid

#### Extends

- `ExecutableRegistrationInvalid_base`

#### Constructors

<a id="constructor-15"></a>

##### Constructor

> **new ExecutableRegistrationInvalid**(...`args`): [`ExecutableRegistrationInvalid`](#executableregistrationinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutableRegistrationInvalid`](#executableregistrationinvalid)

###### Inherited from

`ExecutableRegistrationInvalid_base.constructor`

#### Properties

<a id="hint-15"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationInvalid_base.hint`

<a id="message-2"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ExecutableRegistrationInvalid_base.message`

***

<a id="executableregistrationmissing"></a>

### ExecutableRegistrationMissing

#### Extends

- `ExecutableRegistrationMissing_base`

#### Constructors

<a id="constructor-16"></a>

##### Constructor

> **new ExecutableRegistrationMissing**(...`args`): [`ExecutableRegistrationMissing`](#executableregistrationmissing)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ExecutableRegistrationMissing`](#executableregistrationmissing)

###### Inherited from

`ExecutableRegistrationMissing_base.constructor`

#### Properties

<a id="hint-16"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationMissing_base.hint`

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string`

###### Inherited from

`ExecutableRegistrationMissing_base.pin`

***

<a id="fanoutconflict"></a>

### FanOutConflict

#### Extends

- `FanOutConflict_base`

#### Constructors

<a id="constructor-17"></a>

##### Constructor

> **new FanOutConflict**(...`args`): [`FanOutConflict`](#fanoutconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FanOutConflict`](#fanoutconflict)

###### Inherited from

`FanOutConflict_base.constructor`

#### Properties

<a id="existingfanoutid"></a>

##### existingFanOutId

> `readonly` **existingFanOutId**: `string`

###### Inherited from

`FanOutConflict_base.existingFanOutId`

<a id="hint-17"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutConflict_base.hint`

<a id="idempotencykey"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`FanOutConflict_base.idempotencyKey`

<a id="parentrunid-3"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`FanOutConflict_base.parentRunId`

***

<a id="fanoutinvalid"></a>

### FanOutInvalid

#### Extends

- `FanOutInvalid_base`

#### Constructors

<a id="constructor-18"></a>

##### Constructor

> **new FanOutInvalid**(...`args`): [`FanOutInvalid`](#fanoutinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FanOutInvalid`](#fanoutinvalid)

###### Inherited from

`FanOutInvalid_base.constructor`

#### Properties

<a id="hint-18"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutInvalid_base.hint`

<a id="message-3"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`FanOutInvalid_base.message`

***

<a id="fanoutnotfound"></a>

### FanOutNotFound

#### Extends

- `FanOutNotFound_base`

#### Constructors

<a id="constructor-19"></a>

##### Constructor

> **new FanOutNotFound**(...`args`): [`FanOutNotFound`](#fanoutnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FanOutNotFound`](#fanoutnotfound)

###### Inherited from

`FanOutNotFound_base.constructor`

#### Properties

<a id="fanoutid"></a>

##### fanOutId

> `readonly` **fanOutId**: `string`

###### Inherited from

`FanOutNotFound_base.fanOutId`

<a id="hint-19"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutNotFound_base.hint`

***

<a id="fanoutremainderunsupported"></a>

### FanOutRemainderUnsupported

#### Extends

- `FanOutRemainderUnsupported_base`

#### Constructors

<a id="constructor-20"></a>

##### Constructor

> **new FanOutRemainderUnsupported**(...`args`): [`FanOutRemainderUnsupported`](#fanoutremainderunsupported)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FanOutRemainderUnsupported`](#fanoutremainderunsupported)

###### Inherited from

`FanOutRemainderUnsupported_base.constructor`

#### Properties

<a id="durability"></a>

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

`FanOutRemainderUnsupported_base.durability`

<a id="hint-20"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutRemainderUnsupported_base.hint`

<a id="remainder"></a>

##### remainder

> `readonly` **remainder**: `"terminate"`

###### Inherited from

`FanOutRemainderUnsupported_base.remainder`

***

<a id="forksequenceinvalid"></a>

### ForkSequenceInvalid

A fork or rewind sequence is outside the committed journal.

#### Extends

- `ForkSequenceInvalid_base`

#### Constructors

<a id="constructor-21"></a>

##### Constructor

> **new ForkSequenceInvalid**(...`args`): [`ForkSequenceInvalid`](#forksequenceinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ForkSequenceInvalid`](#forksequenceinvalid)

###### Inherited from

`ForkSequenceInvalid_base.constructor`

#### Properties

<a id="hint-21"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ForkSequenceInvalid_base.hint`

<a id="lastsequence"></a>

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

`ForkSequenceInvalid_base.lastSequence`

<a id="runid-7"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ForkSequenceInvalid_base.runId`

<a id="sequence-2"></a>

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`ForkSequenceInvalid_base.sequence`

***

<a id="idempotencyconflict"></a>

### IdempotencyConflict

#### Extends

- `IdempotencyConflict_base`

#### Constructors

<a id="constructor-22"></a>

##### Constructor

> **new IdempotencyConflict**(...`args`): [`IdempotencyConflict`](#idempotencyconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`IdempotencyConflict`](#idempotencyconflict)

###### Inherited from

`IdempotencyConflict_base.constructor`

#### Properties

<a id="address-1"></a>

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

`IdempotencyConflict_base.address`

<a id="existingrunid-1"></a>

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`IdempotencyConflict_base.existingRunId`

<a id="hint-22"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`IdempotencyConflict_base.hint`

<a id="idempotencykey-1"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`IdempotencyConflict_base.idempotencyKey`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`IdempotencyConflict_base.sessionId`

***

<a id="illegaloperatoraction"></a>

### IllegalOperatorAction

#### Extends

- `IllegalOperatorAction_base`

#### Constructors

<a id="constructor-23"></a>

##### Constructor

> **new IllegalOperatorAction**(...`args`): [`IllegalOperatorAction`](#illegaloperatoraction)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`IllegalOperatorAction`](#illegaloperatoraction)

###### Inherited from

`IllegalOperatorAction_base.constructor`

#### Properties

<a id="action"></a>

##### action

> `readonly` **action**: `string`

###### Inherited from

`IllegalOperatorAction_base.action`

<a id="decision"></a>

##### decision

> `readonly` **decision**: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}

###### Inherited from

`IllegalOperatorAction_base.decision`

<a id="hint-23"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`IllegalOperatorAction_base.hint`

<a id="runid-8"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`IllegalOperatorAction_base.runId`

***

<a id="multiworkerunsupported"></a>

### MultiWorkerUnsupported

#### Extends

- `MultiWorkerUnsupported_base`

#### Constructors

<a id="constructor-24"></a>

##### Constructor

> **new MultiWorkerUnsupported**(...`args`): [`MultiWorkerUnsupported`](#multiworkerunsupported)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MultiWorkerUnsupported`](#multiworkerunsupported)

###### Inherited from

`MultiWorkerUnsupported_base.constructor`

#### Properties

<a id="backend"></a>

##### backend

> `readonly` **backend**: `"sqlite"` \| `"mysql"`

###### Inherited from

`MultiWorkerUnsupported_base.backend`

<a id="hint-24"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MultiWorkerUnsupported_base.hint`

<a id="message-4"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`MultiWorkerUnsupported_base.message`

***

<a id="nosnapshot"></a>

### NoSnapshot

A fork point includes sandbox state that has no committed image to restore.

#### Extends

- `NoSnapshot_base`

#### Constructors

<a id="constructor-25"></a>

##### Constructor

> **new NoSnapshot**(...`args`): [`NoSnapshot`](#nosnapshot)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`NoSnapshot`](#nosnapshot)

###### Inherited from

`NoSnapshot_base.constructor`

#### Properties

<a id="atsequence"></a>

##### atSequence

> `readonly` **atSequence**: `number`

###### Inherited from

`NoSnapshot_base.atSequence`

<a id="hint-25"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NoSnapshot_base.hint`

<a id="runid-9"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`NoSnapshot_base.runId`

***

<a id="notinfamily"></a>

### NotInFamily

One Run attempted to message a target outside its durable Run family.

#### Extends

- `NotInFamily_base`

#### Constructors

<a id="constructor-26"></a>

##### Constructor

> **new NotInFamily**(...`args`): [`NotInFamily`](#notinfamily)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`NotInFamily`](#notinfamily)

###### Inherited from

`NotInFamily_base.constructor`

#### Properties

<a id="fromrunid"></a>

##### fromRunId

> `readonly` **fromRunId**: `string`

###### Inherited from

`NotInFamily_base.fromRunId`

<a id="hint-26"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NotInFamily_base.hint`

<a id="targetrunid"></a>

##### targetRunId

> `readonly` **targetRunId**: `string`

###### Inherited from

`NotInFamily_base.targetRunId`

***

<a id="operationresolutionconflict"></a>

### OperationResolutionConflict

#### Extends

- `OperationResolutionConflict_base`

#### Constructors

<a id="constructor-27"></a>

##### Constructor

> **new OperationResolutionConflict**(...`args`): [`OperationResolutionConflict`](#operationresolutionconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`OperationResolutionConflict`](#operationresolutionconflict)

###### Inherited from

`OperationResolutionConflict_base.constructor`

#### Properties

<a id="hint-27"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`OperationResolutionConflict_base.hint`

<a id="idempotencykey-2"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`OperationResolutionConflict_base.idempotencyKey`

<a id="operationid"></a>

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`OperationResolutionConflict_base.operationId`

<a id="runid-10"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`OperationResolutionConflict_base.runId`

***

<a id="responseconflict"></a>

### ResponseConflict

#### Extends

- `ResponseConflict_base`

#### Constructors

<a id="constructor-28"></a>

##### Constructor

> **new ResponseConflict**(...`args`): [`ResponseConflict`](#responseconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ResponseConflict`](#responseconflict)

###### Inherited from

`ResponseConflict_base.constructor`

#### Properties

<a id="hint-28"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ResponseConflict_base.hint`

<a id="runid-11"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ResponseConflict_base.runId`

<a id="waitid"></a>

##### waitId

> `readonly` **waitId**: `string`

###### Inherited from

`ResponseConflict_base.waitId`

***

<a id="runbusy"></a>

### RunBusy

A reject-policy message arrived while its target Run was executing.

#### Extends

- `RunBusy_base`

#### Constructors

<a id="constructor-29"></a>

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

<a id="hint-29"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunBusy_base.hint`

<a id="runid-12"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunBusy_base.runId`

***

<a id="runidconflict"></a>

### RunIdConflict

#### Extends

- `RunIdConflict_base`

#### Constructors

<a id="constructor-30"></a>

##### Constructor

> **new RunIdConflict**(...`args`): [`RunIdConflict`](#runidconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunIdConflict`](#runidconflict)

###### Inherited from

`RunIdConflict_base.constructor`

#### Properties

<a id="existingrunid-2"></a>

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`RunIdConflict_base.existingRunId`

<a id="hint-30"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunIdConflict_base.hint`

<a id="runid-13"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunIdConflict_base.runId`

***

<a id="runnotfound"></a>

### RunNotFound

#### Extends

- `RunNotFound_base`

#### Constructors

<a id="constructor-31"></a>

##### Constructor

> **new RunNotFound**(...`args`): [`RunNotFound`](#runnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunNotFound`](#runnotfound)

###### Inherited from

`RunNotFound_base.constructor`

#### Properties

<a id="hint-31"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunNotFound_base.hint`

<a id="runid-14"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunNotFound_base.runId`

***

<a id="runterminal"></a>

### RunTerminal

#### Extends

- `RunTerminal_base`

#### Constructors

<a id="constructor-32"></a>

##### Constructor

> **new RunTerminal**(...`args`): [`RunTerminal`](#runterminal)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunTerminal`](#runterminal)

###### Inherited from

`RunTerminal_base.constructor`

#### Properties

<a id="hint-32"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunTerminal_base.hint`

<a id="runid-15"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunTerminal_base.runId`

<a id="status"></a>

##### status

> `readonly` **status**: `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Inherited from

`RunTerminal_base.status`

***

<a id="runtimeunavailable"></a>

### RuntimeUnavailable

#### Extends

- `RuntimeUnavailable_base`

#### Constructors

<a id="constructor-33"></a>

##### Constructor

> **new RuntimeUnavailable**(...`args`): [`RuntimeUnavailable`](#runtimeunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RuntimeUnavailable`](#runtimeunavailable)

###### Inherited from

`RuntimeUnavailable_base.constructor`

#### Properties

<a id="hint-33"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RuntimeUnavailable_base.hint`

<a id="message-5"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`RuntimeUnavailable_base.message`

***

<a id="sessionentrycorrupt"></a>

### SessionEntryCorrupt

#### Extends

- `SessionEntryCorrupt_base`

#### Constructors

<a id="constructor-34"></a>

##### Constructor

> **new SessionEntryCorrupt**(...`args`): [`SessionEntryCorrupt`](#sessionentrycorrupt)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionEntryCorrupt`](#sessionentrycorrupt)

###### Inherited from

`SessionEntryCorrupt_base.constructor`

#### Properties

<a id="entryid"></a>

##### entryId

> `readonly` **entryId**: `string`

###### Inherited from

`SessionEntryCorrupt_base.entryId`

<a id="hint-34"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionEntryCorrupt_base.hint`

<a id="message-6"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`SessionEntryCorrupt_base.message`

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionEntryCorrupt_base.sessionId`

***

<a id="sessionentrynotfound"></a>

### SessionEntryNotFound

#### Extends

- `SessionEntryNotFound_base`

#### Constructors

<a id="constructor-35"></a>

##### Constructor

> **new SessionEntryNotFound**(...`args`): [`SessionEntryNotFound`](#sessionentrynotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SessionEntryNotFound`](#sessionentrynotfound)

###### Inherited from

`SessionEntryNotFound_base.constructor`

#### Properties

<a id="entryid-1"></a>

##### entryId

> `readonly` **entryId**: `string`

###### Inherited from

`SessionEntryNotFound_base.entryId`

<a id="hint-35"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionEntryNotFound_base.hint`

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionEntryNotFound_base.sessionId`

***

<a id="staleclaim"></a>

### StaleClaim

#### Extends

- `StaleClaim_base`

#### Constructors

<a id="constructor-36"></a>

##### Constructor

> **new StaleClaim**(...`args`): [`StaleClaim`](#staleclaim)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`StaleClaim`](#staleclaim)

###### Inherited from

`StaleClaim_base.constructor`

#### Properties

<a id="attemptfence"></a>

##### attemptFence

> `readonly` **attemptFence**: `number`

###### Inherited from

`StaleClaim_base.attemptFence`

<a id="hint-36"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StaleClaim_base.hint`

<a id="runid-16"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`StaleClaim_base.runId`

<a id="workerid"></a>

##### workerId

> `readonly` **workerId**: `string`

###### Inherited from

`StaleClaim_base.workerId`

***

<a id="startinvalid"></a>

### StartInvalid

#### Extends

- `StartInvalid_base`

#### Constructors

<a id="constructor-37"></a>

##### Constructor

> **new StartInvalid**(...`args`): [`StartInvalid`](#startinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`StartInvalid`](#startinvalid)

###### Inherited from

`StartInvalid_base.constructor`

#### Properties

<a id="hint-37"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StartInvalid_base.hint`

<a id="message-7"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`StartInvalid_base.message`

***

<a id="steeringconflict"></a>

### SteeringConflict

#### Extends

- `SteeringConflict_base`

#### Constructors

<a id="constructor-38"></a>

##### Constructor

> **new SteeringConflict**(...`args`): [`SteeringConflict`](#steeringconflict)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SteeringConflict`](#steeringconflict)

###### Inherited from

`SteeringConflict_base.constructor`

#### Properties

<a id="hint-38"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SteeringConflict_base.hint`

<a id="idempotencykey-3"></a>

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`SteeringConflict_base.idempotencyKey`

<a id="runid-17"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SteeringConflict_base.runId`

***

<a id="subscriberlagged"></a>

### SubscriberLagged

#### Extends

- `SubscriberLagged_base`

#### Constructors

<a id="constructor-39"></a>

##### Constructor

> **new SubscriberLagged**(...`args`): [`SubscriberLagged`](#subscriberlagged)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SubscriberLagged`](#subscriberlagged)

###### Inherited from

`SubscriberLagged_base.constructor`

#### Properties

<a id="hint-39"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SubscriberLagged_base.hint`

<a id="lastdeliveredsequence"></a>

##### lastDeliveredSequence

> `readonly` **lastDeliveredSequence**: `number`

###### Inherited from

`SubscriberLagged_base.lastDeliveredSequence`

<a id="runid-18"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SubscriberLagged_base.runId`

***

<a id="substitutioninvalid"></a>

### SubstitutionInvalid

A counterfactual substitution does not name a completed operation in the selected prefix.

#### Extends

- `SubstitutionInvalid_base`

#### Constructors

<a id="constructor-40"></a>

##### Constructor

> **new SubstitutionInvalid**(...`args`): [`SubstitutionInvalid`](#substitutioninvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SubstitutionInvalid`](#substitutioninvalid)

###### Inherited from

`SubstitutionInvalid_base.constructor`

#### Properties

<a id="hint-40"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SubstitutionInvalid_base.hint`

<a id="operationid-1"></a>

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`SubstitutionInvalid_base.operationId`

<a id="runid-19"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SubstitutionInvalid_base.runId`

***

<a id="treecursorexpired"></a>

### TreeCursorExpired

#### Extends

- `TreeCursorExpired_base`

#### Constructors

<a id="constructor-41"></a>

##### Constructor

> **new TreeCursorExpired**(...`args`): [`TreeCursorExpired`](#treecursorexpired)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreeCursorExpired`](#treecursorexpired)

###### Inherited from

`TreeCursorExpired_base.constructor`

#### Properties

<a id="cursor-1"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorExpired_base.cursor`

<a id="earliestcursor"></a>

##### earliestCursor

> `readonly` **earliestCursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorExpired_base.earliestCursor`

<a id="hint-41"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorExpired_base.hint`

<a id="rootrunid-2"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorExpired_base.rootRunId`

***

<a id="treecursorfuture"></a>

### TreeCursorFuture

The cursor names a position that has not committed.

#### Extends

- `TreeCursorFuture_base`

#### Constructors

<a id="constructor-42"></a>

##### Constructor

> **new TreeCursorFuture**(...`args`): [`TreeCursorFuture`](#treecursorfuture)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreeCursorFuture`](#treecursorfuture)

###### Inherited from

`TreeCursorFuture_base.constructor`

#### Properties

<a id="cursor-2"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorFuture_base.cursor`

<a id="hint-42"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorFuture_base.hint`

<a id="latestcursor"></a>

##### latestCursor

> `readonly` **latestCursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorFuture_base.latestCursor`

<a id="rootrunid-3"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorFuture_base.rootRunId`

***

<a id="treecursorinvalid"></a>

### TreeCursorInvalid

#### Extends

- `TreeCursorInvalid_base`

#### Constructors

<a id="constructor-43"></a>

##### Constructor

> **new TreeCursorInvalid**(...`args`): [`TreeCursorInvalid`](#treecursorinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreeCursorInvalid`](#treecursorinvalid)

###### Inherited from

`TreeCursorInvalid_base.constructor`

#### Properties

<a id="cursor-3"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorInvalid_base.cursor`

<a id="hint-43"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorInvalid_base.hint`

<a id="message-8"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`TreeCursorInvalid_base.message`

<a id="rootrunid-4"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorInvalid_base.rootRunId`

***

<a id="treecursorrootmismatch"></a>

### TreeCursorRootMismatch

The cursor belongs to a different root Run.

#### Extends

- `TreeCursorRootMismatch_base`

#### Constructors

<a id="constructor-44"></a>

##### Constructor

> **new TreeCursorRootMismatch**(...`args`): [`TreeCursorRootMismatch`](#treecursorrootmismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreeCursorRootMismatch`](#treecursorrootmismatch)

###### Inherited from

`TreeCursorRootMismatch_base.constructor`

#### Properties

<a id="cursor-4"></a>

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorRootMismatch_base.cursor`

<a id="cursorrootrunid"></a>

##### cursorRootRunId

> `readonly` **cursorRootRunId**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.cursorRootRunId`

<a id="hint-44"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.hint`

<a id="rootrunid-5"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.rootRunId`

***

<a id="treepolicyinvalid"></a>

### TreePolicyInvalid

#### Extends

- `TreePolicyInvalid_base`

#### Constructors

<a id="constructor-45"></a>

##### Constructor

> **new TreePolicyInvalid**(...`args`): [`TreePolicyInvalid`](#treepolicyinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreePolicyInvalid`](#treepolicyinvalid)

###### Inherited from

`TreePolicyInvalid_base.constructor`

#### Properties

<a id="hint-45"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreePolicyInvalid_base.hint`

<a id="message-9"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`TreePolicyInvalid_base.message`

***

<a id="treereplaylimitinvalid"></a>

### TreeReplayLimitInvalid

A replay request falls outside the fixed page-size contract.

#### Extends

- `TreeReplayLimitInvalid_base`

#### Constructors

<a id="constructor-46"></a>

##### Constructor

> **new TreeReplayLimitInvalid**(...`args`): [`TreeReplayLimitInvalid`](#treereplaylimitinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TreeReplayLimitInvalid`](#treereplaylimitinvalid)

###### Inherited from

`TreeReplayLimitInvalid_base.constructor`

#### Properties

<a id="hint-46"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeReplayLimitInvalid_base.hint`

<a id="maximum"></a>

##### maximum

> `readonly` **maximum**: `number`

###### Inherited from

`TreeReplayLimitInvalid_base.maximum`

<a id="minimum"></a>

##### minimum

> `readonly` **minimum**: `number`

###### Inherited from

`TreeReplayLimitInvalid_base.minimum`

<a id="received"></a>

##### received

> `readonly` **received**: `string`

###### Inherited from

`TreeReplayLimitInvalid_base.received`

***

<a id="unknownagent"></a>

### UnknownAgent

A durable Run names an Agent that this Runtime process has not registered.

#### Extends

- `UnknownAgent_base`

#### Constructors

<a id="constructor-47"></a>

##### Constructor

> **new UnknownAgent**(...`args`): [`UnknownAgent`](#unknownagent)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`UnknownAgent`](#unknownagent)

###### Inherited from

`UnknownAgent_base.constructor`

#### Properties

<a id="hint-47"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`UnknownAgent_base.hint`

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`UnknownAgent_base.name`

<a id="runid-20"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`UnknownAgent_base.runId`

***

<a id="waitnotopen"></a>

### WaitNotOpen

#### Extends

- `WaitNotOpen_base`

#### Constructors

<a id="constructor-48"></a>

##### Constructor

> **new WaitNotOpen**(...`args`): [`WaitNotOpen`](#waitnotopen)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`WaitNotOpen`](#waitnotopen)

###### Inherited from

`WaitNotOpen_base.constructor`

#### Properties

<a id="hint-48"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WaitNotOpen_base.hint`

<a id="runid-21"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`WaitNotOpen_base.runId`

<a id="waitid-1"></a>

##### waitId

> `readonly` **waitId**: `string`

###### Inherited from

`WaitNotOpen_base.waitId`

## Type Aliases

<a id="structuredagentfailure"></a>

### StructuredAgentFailure

> **StructuredAgentFailure** = [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`GateFailed`](../../generalist/namespaces/Gate#gatefailed) \| [`PermissionDenied`](../../generalist/namespaces/ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](../../generalist/namespaces/AgentEvent#resumemismatch)

The structured Agent failures a durable terminal event preserves verbatim.

## Variables

<a id="structuredagentfailure-1"></a>

### StructuredAgentFailure

> **StructuredAgentFailure**: `Codec`\<[`StructuredAgentFailure`](#structuredagentfailure), \{ `expected?`: \{ `checkpoint`: \{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `argumentTaint?`: readonly `object`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}; `hint?`: `string`; `waits`: readonly `object`[]; \}; `hint?`: `string`; `reason`: `"checkpoint-not-found"` \| `"identity-mismatch"`; `received`: \{ `checkpoint`: \{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `argumentTaint?`: readonly `object`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}; `hint?`: `string`; `waits`: readonly `object`[]; \}; \} \| \{ `gate`: \{ `evidence`: `Json`; `name`: `string`; `verdict`: `"pass"` \| `"fail"`; \}; `hint?`: `string`; \} \| \{ `hint?`: `string`; `message`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; `hint?`: `string`; `remaining?`: `number`; `requested`: `number`; \}, `never`, `never`\>

## References

<a id="schemachecksummismatch"></a>

### SchemaChecksumMismatch

Re-exports [SchemaChecksumMismatch](../../runtime.sql-driver/index#schemachecksummismatch)

***

<a id="schemadirty"></a>

### SchemaDirty

Re-exports [SchemaDirty](../../runtime.sql-driver/index#schemadirty)

***

<a id="schemamigrationfailed"></a>

### SchemaMigrationFailed

Re-exports [SchemaMigrationFailed](../../runtime.sql-driver/index#schemamigrationfailed)

***

<a id="schemaupgraderequired"></a>

### SchemaUpgradeRequired

Re-exports [SchemaUpgradeRequired](../../runtime.sql-driver/index#schemaupgraderequired)

***

<a id="schemaversionunsupported"></a>

### SchemaVersionUnsupported

Re-exports [SchemaVersionUnsupported](../../runtime.sql-driver/index#schemaversionunsupported)
