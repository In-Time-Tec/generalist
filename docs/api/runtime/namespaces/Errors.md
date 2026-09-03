[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / Errors

# Errors

## Classes

### AckBeyondCommitted

The acknowledged sequence is beyond the last committed model cycle.

#### Extends

- `AckBeyondCommitted_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AckBeyondCommitted_base.hint`

##### lastCommittedSequence

> `readonly` **lastCommittedSequence**: `number`

###### Inherited from

`AckBeyondCommitted_base.lastCommittedSequence`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`AckBeyondCommitted_base.runId`

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`AckBeyondCommitted_base.sequence`

***

### AckInvalid

The acknowledged sequence is not a valid processed-through point for the Run.

#### Extends

- `AckInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AckInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AckInvalid_base.message`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`AckInvalid_base.runId`

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`AckInvalid_base.sequence`

***

### AddressNotFound

#### Extends

- `AddressNotFound_base`

#### Constructors

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

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

`AddressNotFound_base.address`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AddressNotFound_base.hint`

***

### AgentExecutionFailure

#### Extends

- `AgentExecutionFailure_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AgentExecutionFailure_base.cause`

##### failure?

> `readonly` `optional` **failure?**: [`StructuredAgentFailure`](#structuredagentfailure)

###### Inherited from

`AgentExecutionFailure_base.failure`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentExecutionFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentExecutionFailure_base.message`

***

### AgentNameConflict

#### Extends

- `AgentNameConflict_base`

#### Constructors

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

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`AgentNameConflict_base.existingRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentNameConflict_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`AgentNameConflict_base.name`

##### scope

> `readonly` **scope**: `string`

###### Inherited from

`AgentNameConflict_base.scope`

***

### ApprovalMismatch

The response conflicts with the authoritative approval identity or decision.

#### Extends

- `ApprovalMismatch_base`

#### Constructors

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

##### approvalId

> `readonly` **approvalId**: `string`

###### Inherited from

`ApprovalMismatch_base.approvalId`

##### expectedApprovalId?

> `readonly` `optional` **expectedApprovalId?**: `string`

###### Inherited from

`ApprovalMismatch_base.expectedApprovalId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalMismatch_base.hint`

##### mismatch

> `readonly` **mismatch**: `"decision"` \| `"approval-id"` \| `"wait-kind"`

###### Inherited from

`ApprovalMismatch_base.mismatch`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ApprovalMismatch_base.runId`

***

### ApprovalStale

The approval no longer names an unresolved request.

#### Extends

- `ApprovalStale_base`

#### Constructors

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

##### approvalId

> `readonly` **approvalId**: `string`

###### Inherited from

`ApprovalStale_base.approvalId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalStale_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ApprovalStale_base.runId`

***

### ChildDepthExceeded

#### Extends

- `ChildDepthExceeded_base`

#### Constructors

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

##### current

> `readonly` **current**: `number`

###### Inherited from

`ChildDepthExceeded_base.current`

##### depth

> `readonly` **depth**: `number`

###### Inherited from

`ChildDepthExceeded_base.depth`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildDepthExceeded_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ChildDepthExceeded_base.limit`

##### parentDepth

> `readonly` **parentDepth**: `number`

###### Inherited from

`ChildDepthExceeded_base.parentDepth`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildDepthExceeded_base.parentRunId`

##### requested

> `readonly` **requested**: `number`

###### Inherited from

`ChildDepthExceeded_base.requested`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`ChildDepthExceeded_base.rootRunId`

***

### ChildLimitExceeded

#### Extends

- `ChildLimitExceeded_base`

#### Constructors

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

##### current

> `readonly` **current**: `number`

###### Inherited from

`ChildLimitExceeded_base.current`

##### depth

> `readonly` **depth**: `number`

###### Inherited from

`ChildLimitExceeded_base.depth`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildLimitExceeded_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`ChildLimitExceeded_base.limit`

##### parentDepth

> `readonly` **parentDepth**: `number`

###### Inherited from

`ChildLimitExceeded_base.parentDepth`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildLimitExceeded_base.parentRunId`

##### requested

> `readonly` **requested**: `number`

###### Inherited from

`ChildLimitExceeded_base.requested`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`ChildLimitExceeded_base.rootRunId`

***

### ChildSelectionMissing

#### Extends

- `ChildSelectionMissing_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildSelectionMissing_base.hint`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`ChildSelectionMissing_base.parentRunId`

##### selection

> `readonly` **selection**: `string`

###### Inherited from

`ChildSelectionMissing_base.selection`

***

### CursorExpired

#### Extends

- `CursorExpired_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `number`

###### Inherited from

`CursorExpired_base.cursor`

##### earliestSequence

> `readonly` **earliestSequence**: `number`

###### Inherited from

`CursorExpired_base.earliestSequence`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CursorExpired_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`CursorExpired_base.runId`

***

### DuplicateAgent

An Agent name is already registered in this Runtime process.

#### Extends

- `DuplicateAgent_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DuplicateAgent_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`DuplicateAgent_base.name`

***

### ExecutableIdentityMismatch

#### Extends

- `ExecutableIdentityMismatch_base`

#### Constructors

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

##### actualRef

> `readonly` **actualRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutableIdentityMismatch_base.actualRef`

##### expectedRef

> `readonly` **expectedRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutableIdentityMismatch_base.expectedRef`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableIdentityMismatch_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ExecutableIdentityMismatch_base.runId`

***

### ExecutablePinMissing

#### Extends

- `ExecutablePinMissing_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutablePinMissing_base.hint`

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

`ExecutablePinMissing_base.ref`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ExecutablePinMissing_base.runId`

***

### ExecutableRegistrationConflict

#### Extends

- `ExecutableRegistrationConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationConflict_base.hint`

##### pin

> `readonly` **pin**: `string`

###### Inherited from

`ExecutableRegistrationConflict_base.pin`

***

### ExecutableRegistrationInvalid

#### Extends

- `ExecutableRegistrationInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ExecutableRegistrationInvalid_base.message`

***

### ExecutableRegistrationMissing

#### Extends

- `ExecutableRegistrationMissing_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ExecutableRegistrationMissing_base.hint`

##### pin

> `readonly` **pin**: `string`

###### Inherited from

`ExecutableRegistrationMissing_base.pin`

***

### FanOutConflict

#### Extends

- `FanOutConflict_base`

#### Constructors

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

##### existingFanOutId

> `readonly` **existingFanOutId**: `string`

###### Inherited from

`FanOutConflict_base.existingFanOutId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutConflict_base.hint`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`FanOutConflict_base.idempotencyKey`

##### parentRunId

> `readonly` **parentRunId**: `string`

###### Inherited from

`FanOutConflict_base.parentRunId`

***

### FanOutInvalid

#### Extends

- `FanOutInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`FanOutInvalid_base.message`

***

### FanOutNotFound

#### Extends

- `FanOutNotFound_base`

#### Constructors

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

##### fanOutId

> `readonly` **fanOutId**: `string`

###### Inherited from

`FanOutNotFound_base.fanOutId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutNotFound_base.hint`

***

### FanOutRemainderUnsupported

#### Extends

- `FanOutRemainderUnsupported_base`

#### Constructors

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

##### durability

> `readonly` **durability**: `"ephemeral"` \| `"durable"`

###### Inherited from

`FanOutRemainderUnsupported_base.durability`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FanOutRemainderUnsupported_base.hint`

##### remainder

> `readonly` **remainder**: `"terminate"`

###### Inherited from

`FanOutRemainderUnsupported_base.remainder`

***

### ForkSequenceInvalid

A fork or rewind sequence is outside the committed journal.

#### Extends

- `ForkSequenceInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ForkSequenceInvalid_base.hint`

##### lastSequence

> `readonly` **lastSequence**: `number`

###### Inherited from

`ForkSequenceInvalid_base.lastSequence`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ForkSequenceInvalid_base.runId`

##### sequence

> `readonly` **sequence**: `number`

###### Inherited from

`ForkSequenceInvalid_base.sequence`

***

### IdempotencyConflict

#### Extends

- `IdempotencyConflict_base`

#### Constructors

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

##### address

> `readonly` **address**: `string` & `Brand`\<`"Address"`\>

###### Inherited from

`IdempotencyConflict_base.address`

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`IdempotencyConflict_base.existingRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`IdempotencyConflict_base.hint`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`IdempotencyConflict_base.idempotencyKey`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`IdempotencyConflict_base.sessionId`

***

### IllegalOperatorAction

#### Extends

- `IllegalOperatorAction_base`

#### Constructors

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

##### action

> `readonly` **action**: `string`

###### Inherited from

`IllegalOperatorAction_base.action`

##### decision

> `readonly` **decision**: \{ \} \| \{ `attempt`: `number`; `operationId`: `string`; \} \| \{ `token`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; \} \| \{ `operationId`: `string`; `reason`: `string`; \} \| \{ `error`: `unknown`; \}

###### Inherited from

`IllegalOperatorAction_base.decision`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`IllegalOperatorAction_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`IllegalOperatorAction_base.runId`

***

### MultiWorkerUnsupported

#### Extends

- `MultiWorkerUnsupported_base`

#### Constructors

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

##### backend

> `readonly` **backend**: `"sqlite"` \| `"mysql"`

###### Inherited from

`MultiWorkerUnsupported_base.backend`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MultiWorkerUnsupported_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`MultiWorkerUnsupported_base.message`

***

### NoSnapshot

A fork point includes sandbox state that has no committed image to restore.

#### Extends

- `NoSnapshot_base`

#### Constructors

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

##### atSequence

> `readonly` **atSequence**: `number`

###### Inherited from

`NoSnapshot_base.atSequence`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NoSnapshot_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`NoSnapshot_base.runId`

***

### NotInFamily

One Run attempted to message a target outside its durable Run family.

#### Extends

- `NotInFamily_base`

#### Constructors

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

##### fromRunId

> `readonly` **fromRunId**: `string`

###### Inherited from

`NotInFamily_base.fromRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`NotInFamily_base.hint`

##### targetRunId

> `readonly` **targetRunId**: `string`

###### Inherited from

`NotInFamily_base.targetRunId`

***

### OperationResolutionConflict

#### Extends

- `OperationResolutionConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`OperationResolutionConflict_base.hint`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`OperationResolutionConflict_base.idempotencyKey`

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`OperationResolutionConflict_base.operationId`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`OperationResolutionConflict_base.runId`

***

### ResponseConflict

#### Extends

- `ResponseConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ResponseConflict_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`ResponseConflict_base.runId`

##### waitId

> `readonly` **waitId**: `string`

###### Inherited from

`ResponseConflict_base.waitId`

***

### RunBusy

A reject-policy message arrived while its target Run was executing.

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

### RunIdConflict

#### Extends

- `RunIdConflict_base`

#### Constructors

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

##### existingRunId

> `readonly` **existingRunId**: `string`

###### Inherited from

`RunIdConflict_base.existingRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunIdConflict_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunIdConflict_base.runId`

***

### RunNotFound

#### Extends

- `RunNotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunNotFound_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunNotFound_base.runId`

***

### RunTerminal

#### Extends

- `RunTerminal_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunTerminal_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunTerminal_base.runId`

##### status

> `readonly` **status**: `"succeeded"` \| `"failed"` \| `"cancelled"`

###### Inherited from

`RunTerminal_base.status`

***

### RuntimeUnavailable

#### Extends

- `RuntimeUnavailable_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RuntimeUnavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`RuntimeUnavailable_base.message`

***

### SessionEntryCorrupt

#### Extends

- `SessionEntryCorrupt_base`

#### Constructors

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

##### entryId

> `readonly` **entryId**: `string`

###### Inherited from

`SessionEntryCorrupt_base.entryId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionEntryCorrupt_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SessionEntryCorrupt_base.message`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionEntryCorrupt_base.sessionId`

***

### SessionEntryNotFound

#### Extends

- `SessionEntryNotFound_base`

#### Constructors

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

##### entryId

> `readonly` **entryId**: `string`

###### Inherited from

`SessionEntryNotFound_base.entryId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SessionEntryNotFound_base.hint`

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`SessionEntryNotFound_base.sessionId`

***

### StaleClaim

#### Extends

- `StaleClaim_base`

#### Constructors

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

##### attemptFence

> `readonly` **attemptFence**: `number`

###### Inherited from

`StaleClaim_base.attemptFence`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StaleClaim_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`StaleClaim_base.runId`

##### workerId

> `readonly` **workerId**: `string`

###### Inherited from

`StaleClaim_base.workerId`

***

### StartInvalid

#### Extends

- `StartInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`StartInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`StartInvalid_base.message`

***

### SteeringConflict

#### Extends

- `SteeringConflict_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SteeringConflict_base.hint`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

###### Inherited from

`SteeringConflict_base.idempotencyKey`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SteeringConflict_base.runId`

***

### SubscriberLagged

#### Extends

- `SubscriberLagged_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SubscriberLagged_base.hint`

##### lastDeliveredSequence

> `readonly` **lastDeliveredSequence**: `number`

###### Inherited from

`SubscriberLagged_base.lastDeliveredSequence`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SubscriberLagged_base.runId`

***

### SubstitutionInvalid

A counterfactual substitution does not name a completed operation in the selected prefix.

#### Extends

- `SubstitutionInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SubstitutionInvalid_base.hint`

##### operationId

> `readonly` **operationId**: `string`

###### Inherited from

`SubstitutionInvalid_base.operationId`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`SubstitutionInvalid_base.runId`

***

### TreeCursorExpired

#### Extends

- `TreeCursorExpired_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorExpired_base.cursor`

##### earliestCursor

> `readonly` **earliestCursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorExpired_base.earliestCursor`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorExpired_base.hint`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorExpired_base.rootRunId`

***

### TreeCursorFuture

The cursor names a position that has not committed.

#### Extends

- `TreeCursorFuture_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorFuture_base.cursor`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorFuture_base.hint`

##### latestCursor

> `readonly` **latestCursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorFuture_base.latestCursor`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorFuture_base.rootRunId`

***

### TreeCursorInvalid

#### Extends

- `TreeCursorInvalid_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorInvalid_base.cursor`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`TreeCursorInvalid_base.message`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorInvalid_base.rootRunId`

***

### TreeCursorRootMismatch

The cursor belongs to a different root Run.

#### Extends

- `TreeCursorRootMismatch_base`

#### Constructors

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

##### cursor

> `readonly` **cursor**: `string` & `Brand`\<`"generalist/runtime/TreeCursor"`\>

###### Inherited from

`TreeCursorRootMismatch_base.cursor`

##### cursorRootRunId

> `readonly` **cursorRootRunId**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.cursorRootRunId`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.hint`

##### rootRunId

> `readonly` **rootRunId**: `string`

###### Inherited from

`TreeCursorRootMismatch_base.rootRunId`

***

### TreePolicyInvalid

#### Extends

- `TreePolicyInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreePolicyInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`TreePolicyInvalid_base.message`

***

### TreeReplayLimitInvalid

A replay request falls outside the fixed page-size contract.

#### Extends

- `TreeReplayLimitInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TreeReplayLimitInvalid_base.hint`

##### maximum

> `readonly` **maximum**: `number`

###### Inherited from

`TreeReplayLimitInvalid_base.maximum`

##### minimum

> `readonly` **minimum**: `number`

###### Inherited from

`TreeReplayLimitInvalid_base.minimum`

##### received

> `readonly` **received**: `string`

###### Inherited from

`TreeReplayLimitInvalid_base.received`

***

### UnknownAgent

A durable Run names an Agent that this Runtime process has not registered.

#### Extends

- `UnknownAgent_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`UnknownAgent_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`UnknownAgent_base.name`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`UnknownAgent_base.runId`

***

### WaitNotOpen

#### Extends

- `WaitNotOpen_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`WaitNotOpen_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`WaitNotOpen_base.runId`

##### waitId

> `readonly` **waitId**: `string`

###### Inherited from

`WaitNotOpen_base.waitId`

## Type Aliases

### StructuredAgentFailure

> **StructuredAgentFailure** = [`Exhausted`](../../generalist/namespaces/RunBudget#exhausted) \| [`GateFailed`](../../generalist/namespaces/Gate#gatefailed) \| [`PermissionDenied`](../../generalist/namespaces/ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](../../generalist/namespaces/AgentEvent#resumemismatch)

The structured Agent failures a durable terminal event preserves verbatim.

## Variables

### StructuredAgentFailure

> **StructuredAgentFailure**: `Codec`\<[`StructuredAgentFailure`](#structuredagentfailure), \{ `expected?`: \{ `checkpoint`: \{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}; `hint?`: `string`; `waits`: readonly `object`[]; \}; `hint?`: `string`; `reason`: `"checkpoint-not-found"` \| `"identity-mismatch"`; `received`: \{ `checkpoint`: \{ `activatedSkills`: readonly `string`[]; `activeTools`: readonly `string`[]; `authorizationContextDigest`: `string`; `calls`: readonly `object`[]; `invocationPath`: readonly `string`[]; `turn`: `number`; \}; `hint?`: `string`; `waits`: readonly `object`[]; \}; \} \| \{ `gate`: \{ `evidence`: `Json`; `name`: `string`; `verdict`: `"pass"` \| `"fail"`; \}; `hint?`: `string`; \} \| \{ `hint?`: `string`; `message`: `string`; \} \| \{ `budget`: `"toolCalls"` \| `"tokens"` \| `"usd"` \| `"duration"` \| `"children"`; `hint?`: `string`; `remaining?`: `number`; `requested`: `number`; \}, `never`, `never`\>

## References

### SchemaChecksumMismatch

Re-exports [SchemaChecksumMismatch](../../runtime.sql-driver/index#schemachecksummismatch)

***

### SchemaDirty

Re-exports [SchemaDirty](../../runtime.sql-driver/index#schemadirty)

***

### SchemaMigrationFailed

Re-exports [SchemaMigrationFailed](../../runtime.sql-driver/index#schemamigrationfailed)

***

### SchemaUpgradeRequired

Re-exports [SchemaUpgradeRequired](../../runtime.sql-driver/index#schemaupgraderequired)

***

### SchemaVersionUnsupported

Re-exports [SchemaVersionUnsupported](../../runtime.sql-driver/index#schemaversionunsupported)
