[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentEvent

# AgentEvent

## Classes

### AgentError

The loop failed. `turn` is the 0-based turn that failed.

#### Extends

- `AgentError_base`

#### Constructors

##### Constructor

> **new AgentError**(...`args`): [`AgentError`](#agenterror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentError`](#agenterror)

###### Inherited from

`AgentError_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AgentError_base.cause`

##### diagnostics?

> `readonly` `optional` **diagnostics?**: `object`

###### alignmentCount

> `readonly` **alignmentCount**: `number`

###### authoritativeMessageCount

> `readonly` **authoritativeMessageCount**: `number`

###### commonPrefixLength

> `readonly` **commonPrefixLength**: `number`

###### durableEntryCount

> `readonly` **durableEntryCount**: `number`

###### durableMessageCount

> `readonly` **durableMessageCount**: `number`

###### firstDivergence?

> `readonly` `optional` **firstDivergence?**: `object`

###### firstDivergence.authoritativeDigest?

> `readonly` `optional` **authoritativeDigest?**: `string`

###### firstDivergence.authoritativePartTypes

> `readonly` **authoritativePartTypes**: readonly `string`[]

###### firstDivergence.authoritativeRole?

> `readonly` `optional` **authoritativeRole?**: `string`

###### firstDivergence.durableDigest?

> `readonly` `optional` **durableDigest?**: `string`

###### firstDivergence.durablePartTypes

> `readonly` **durablePartTypes**: readonly `string`[]

###### firstDivergence.durableRole?

> `readonly` `optional` **durableRole?**: `string`

###### firstDivergence.index

> `readonly` **index**: `number`

###### lastDurableEntryTag?

> `readonly` `optional` **lastDurableEntryTag?**: `string`

###### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

`AgentError_base.diagnostics`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentError_base.message`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`AgentError_base.turn`

#### Methods

##### make()

> `static` **make**(`props`, `options?`): [`AgentError`](#agenterror)

###### Parameters

###### props

###### cause?

`unknown`

###### diagnostics?

\{ `alignmentCount`: `number`; `authoritativeMessageCount`: `number`; `commonPrefixLength`: `number`; `durableEntryCount`: `number`; `durableMessageCount`: `number`; `firstDivergence?`: \{ `authoritativeDigest?`: `string`; `authoritativePartTypes`: readonly `string`[]; `authoritativeRole?`: `string`; `durableDigest?`: `string`; `durablePartTypes`: readonly `string`[]; `durableRole?`: `string`; `index`: `number`; \}; `lastDurableEntryTag?`: `string`; `sessionId`: `string`; \}

###### diagnostics.alignmentCount

`number`

###### diagnostics.authoritativeMessageCount

`number`

###### diagnostics.commonPrefixLength

`number`

###### diagnostics.durableEntryCount

`number`

###### diagnostics.durableMessageCount

`number`

###### diagnostics.firstDivergence?

\{ `authoritativeDigest?`: `string`; `authoritativePartTypes`: readonly `string`[]; `authoritativeRole?`: `string`; `durableDigest?`: `string`; `durablePartTypes`: readonly `string`[]; `durableRole?`: `string`; `index`: `number`; \}

###### diagnostics.firstDivergence.authoritativeDigest?

`string`

###### diagnostics.firstDivergence.authoritativePartTypes

readonly `string`[]

###### diagnostics.firstDivergence.authoritativeRole?

`string`

###### diagnostics.firstDivergence.durableDigest?

`string`

###### diagnostics.firstDivergence.durablePartTypes

readonly `string`[]

###### diagnostics.firstDivergence.durableRole?

`string`

###### diagnostics.firstDivergence.index

`number`

###### diagnostics.lastDurableEntryTag?

`string`

###### diagnostics.sessionId

`string`

###### hint?

`string`

###### message

`string`

###### turn

`number`

###### options?

`MakeOptions`

###### Returns

[`AgentError`](#agenterror)

###### Overrides

`AgentError_base.make`

***

### AgentSuspended

The run suspended with one or more exact authored-order waits.
The run did NOT finish; the host resolves waits out-of-band and re-enters via
`RunOptions.resume` with this exact batch checkpoint.

#### Extends

- `AgentSuspended_base`

#### Constructors

##### Constructor

> **new AgentSuspended**(...`args`): [`AgentSuspended`](#agentsuspended)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AgentSuspended`](#agentsuspended)

###### Inherited from

`AgentSuspended_base.constructor`

#### Properties

##### checkpoint

> `readonly` **checkpoint**: `object`

###### activatedSkills

> `readonly` **activatedSkills**: readonly `string`[]

###### activeTools

> `readonly` **activeTools**: readonly `string`[]

###### authorizationContextDigest

> `readonly` **authorizationContextDigest**: `string`

###### calls

> `readonly` **calls**: readonly `object`[]

###### invocationPath

> `readonly` **invocationPath**: readonly `string`[]

###### turn

> `readonly` **turn**: `number`

###### Inherited from

`AgentSuspended_base.checkpoint`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentSuspended_base.hint`

##### waits

> `readonly` **waits**: readonly `object`[]

###### Inherited from

`AgentSuspended_base.waits`

***

### ChildExceedsParent

A child requested authority unavailable to its parent.

#### Extends

- `ChildExceedsParent_base`

#### Constructors

##### Constructor

> **new ChildExceedsParent**(...`args`): [`ChildExceedsParent`](#childexceedsparent)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ChildExceedsParent`](#childexceedsparent)

###### Inherited from

`ChildExceedsParent_base.constructor`

#### Properties

##### field

> `readonly` **field**: `"tools"` \| `"sandbox"` \| `"permissions"`

###### Inherited from

`ChildExceedsParent_base.field`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildExceedsParent_base.hint`

***

### DuplicateToolCallId

A transformed model response reused a tool-call identifier.

#### Extends

- `DuplicateToolCallId_base`

#### Constructors

##### Constructor

> **new DuplicateToolCallId**(...`args`): [`DuplicateToolCallId`](#duplicatetoolcallid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`DuplicateToolCallId`](#duplicatetoolcallid)

###### Inherited from

`DuplicateToolCallId_base.constructor`

#### Properties

##### duplicateIndex

> `readonly` **duplicateIndex**: `number`

###### Inherited from

`DuplicateToolCallId_base.duplicateIndex`

##### firstIndex

> `readonly` **firstIndex**: `number`

###### Inherited from

`DuplicateToolCallId_base.firstIndex`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DuplicateToolCallId_base.hint`

##### id

> `readonly` **id**: `string`

###### Inherited from

`DuplicateToolCallId_base.id`

***

### InvalidOutput

The model's terminal value did not satisfy the Agent output Schema.

#### Extends

- `InvalidOutput_base`

#### Constructors

##### Constructor

> **new InvalidOutput**(...`args`): [`InvalidOutput`](#invalidoutput)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InvalidOutput`](#invalidoutput)

###### Inherited from

`InvalidOutput_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidOutput_base.hint`

##### issues

> `readonly` **issues**: readonly `string`[]

###### Inherited from

`InvalidOutput_base.issues`

***

### MiddlewareViolation

A ModelMiddleware hook violated the loop contract.

#### Extends

- `MiddlewareViolation_base`

#### Constructors

##### Constructor

> **new MiddlewareViolation**(...`args`): [`MiddlewareViolation`](#middlewareviolation)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`MiddlewareViolation`](#middlewareviolation)

###### Inherited from

`MiddlewareViolation_base.constructor`

#### Properties

##### detail

> `readonly` **detail**: `string`

###### Inherited from

`MiddlewareViolation_base.detail`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MiddlewareViolation_base.hint`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`MiddlewareViolation_base.turn`

***

### PolicyStopped

A turn policy successfully stopped for a reason other than a configured turn limit.

#### Extends

- `PolicyStopped_base`

#### Constructors

##### Constructor

> **new PolicyStopped**(...`args`): [`PolicyStopped`](#policystopped)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PolicyStopped`](#policystopped)

###### Inherited from

`PolicyStopped_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyStopped_base.hint`

##### pending

> `readonly` **pending**: readonly `object`[]

###### Inherited from

`PolicyStopped_base.pending`

##### reason

> `readonly` **reason**: \{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

###### Inherited from

`PolicyStopped_base.reason`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`PolicyStopped_base.turn`

***

### ProgressOverflow

An explicitly failing tool progress queue reached capacity.

#### Extends

- `ProgressOverflow_base`

#### Constructors

##### Constructor

> **new ProgressOverflow**(...`args`): [`ProgressOverflow`](#progressoverflow)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ProgressOverflow`](#progressoverflow)

###### Inherited from

`ProgressOverflow_base.constructor`

#### Properties

##### capacity

> `readonly` **capacity**: `number`

###### Inherited from

`ProgressOverflow_base.capacity`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgressOverflow_base.hint`

##### toolCallId

> `readonly` **toolCallId**: `string`

###### Inherited from

`ProgressOverflow_base.toolCallId`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`ProgressOverflow_base.turn`

***

### ResumeMismatch

A resume identity did not match the current authoritative suspension checkpoint.

#### Extends

- `ResumeMismatch_base`

#### Constructors

##### Constructor

> **new ResumeMismatch**(...`args`): [`ResumeMismatch`](#resumemismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ResumeMismatch`](#resumemismatch)

###### Inherited from

`ResumeMismatch_base.constructor`

#### Properties

##### expected?

> `readonly` `optional` **expected?**: [`AgentSuspended`](#agentsuspended)

###### Inherited from

`ResumeMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ResumeMismatch_base.hint`

##### reason

> `readonly` **reason**: `"checkpoint-not-found"` \| `"identity-mismatch"`

###### Inherited from

`ResumeMismatch_base.reason`

##### received

> `readonly` **received**: [`AgentSuspended`](#agentsuspended)

###### Inherited from

`ResumeMismatch_base.received`

***

### RunEndedWithoutOutput

The turn that would have ended the run left no assistant text,
so the run has no answer to report and never completes. `finishReason` is
what the provider reported for that turn: `"unknown"` means the provider
never said why it stopped, and an absent reason means no terminal event was
observed at all. `providerTextCharacters` and `reasoningCharacters` count
what the provider streamed across every attempt of that turn, before
middleware ran, so zero text with reasoning is a provider that stopped after
thinking and zero of both is a provider that produced nothing. Non-zero text
means text was streamed but never committed: a middleware chain removed it,
or the attempt that streamed it was discarded before release.

#### Extends

- `RunEndedWithoutOutput_base`

#### Constructors

##### Constructor

> **new RunEndedWithoutOutput**(...`args`): [`RunEndedWithoutOutput`](#runendedwithoutoutput)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RunEndedWithoutOutput`](#runendedwithoutoutput)

###### Inherited from

`RunEndedWithoutOutput_base.constructor`

#### Properties

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

`RunEndedWithoutOutput_base.finishReason`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunEndedWithoutOutput_base.hint`

##### providerTextCharacters

> `readonly` **providerTextCharacters**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.providerTextCharacters`

##### reasoningCharacters

> `readonly` **reasoningCharacters**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.reasoningCharacters`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.turn`

***

### ToolNameCollision

The advertised tool set contains more than one declaration for a name.

#### Extends

- `ToolNameCollision_base`

#### Constructors

##### Constructor

> **new ToolNameCollision**(...`args`): [`ToolNameCollision`](#toolnamecollision)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ToolNameCollision`](#toolnamecollision)

###### Inherited from

`ToolNameCollision_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ToolNameCollision_base.hint`

##### name

> `readonly` **name**: `string`

###### Inherited from

`ToolNameCollision_base.name`

##### origins

> `readonly` **origins**: readonly \[\{ `agent`: `string`; \} \| \{ `builtin`: `"activate_skill"`; \} \| \{ `skill`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}, \{ `agent`: `string`; \} \| \{ `builtin`: `"activate_skill"`; \} \| \{ `skill`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}\]

###### Inherited from

`ToolNameCollision_base.origins`

***

### TurnLimitExceeded

The turn policy declined another turn while tool results were still pending.

#### Extends

- `TurnLimitExceeded_base`

#### Constructors

##### Constructor

> **new TurnLimitExceeded**(...`args`): [`TurnLimitExceeded`](#turnlimitexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`TurnLimitExceeded`](#turnlimitexceeded)

###### Inherited from

`TurnLimitExceeded_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TurnLimitExceeded_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`TurnLimitExceeded_base.limit`

##### pending

> `readonly` **pending**: readonly `object`[]

###### Inherited from

`TurnLimitExceeded_base.pending`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`TurnLimitExceeded_base.turn`

## Interfaces

### ApprovalRequested

Emitted before resolving a permission ask or needsApproval tool.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ApprovalRequested"`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### request

> `readonly` **request**: `object`

###### approvalId

> `readonly` **approvalId**: `string`

###### capability

> `readonly` **capability**: `string`

###### input

> `readonly` **input**: `unknown`

###### operation

> `readonly` **operation**: `string`

##### turn

> `readonly` **turn**: `number`

***

### Completed

Terminal event: the run finished without suspension.

#### Type Parameters

##### Output

`Output` = `unknown`

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Completed"`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### output

> `readonly` **output**: `Output`

##### text

> `readonly` **text**: `string`

##### transcript

> `readonly` **transcript**: `Prompt`

##### turns

> `readonly` **turns**: `number`

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

### GateResult

One ordered completion gate verdict for a proposed terminal output.

#### Extends

- [`Result`](./Gate#result)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"GateResult"`

##### evidence

> `readonly` **evidence**: `Json`

###### Inherited from

`CompletionGateResult.evidence`

##### name

> `readonly` **name**: `string`

###### Inherited from

`CompletionGateResult.name`

##### turn

> `readonly` **turn**: `number`

##### verdict

> `readonly` **verdict**: `"pass"` \| `"fail"`

###### Inherited from

`CompletionGateResult.verdict`

***

### ModelPart

A raw model stream part, passed through unchanged.
`modelCallId`, `modelAttemptId`, and 0-based `attempt` join the part to its
model-call and attempt lifecycle events.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ModelPart"`

##### attempt

> `readonly` **attempt**: `number`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

##### modelCallId

> `readonly` **modelCallId**: `string`

##### part

> `readonly` **part**: `StreamPart`\<`Record`\<`string`, `Any`\>\>

##### turn

> `readonly` **turn**: `number`

***

### SteeringDrained

A steering or follow-up queue was drained into the next prompt.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"SteeringDrained"`

##### count

> `readonly` **count**: `number`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### queue

> `readonly` **queue**: [`SteeringQueueName`](#steeringqueuename)

##### turn

> `readonly` **turn**: `number`

***

### ToolExecutionCompleted

A tool call finished; `result` is the part re-fed to the model.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionCompleted"`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\> & `object`

###### Type Declaration

###### toolProgress?

> `readonly` `optional` **toolProgress?**: `object`

###### toolProgress.dropped

> `readonly` **dropped**: `number`

##### result

> `readonly` **result**: `ToolResultPart`\<`string`, `unknown`, `unknown`\>

##### tasksUpdated?

> `readonly` `optional` **tasksUpdated?**: readonly `object`[]

##### turn

> `readonly` **turn**: `number`

***

### ToolExecutionStarted

A tool call is about to execute via the ToolExecutor service.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionStarted"`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### turn

> `readonly` **turn**: `number`

***

### ToolExecutionWaiting

A tool reached a durable wait without disturbing admitted siblings.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionWaiting"`

##### awaitEvent?

> `readonly` `optional` **awaitEvent?**: `object`

###### deadline

> `readonly` **deadline**: `string`

###### filter

> `readonly` **filter**: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### token

> `readonly` **token**: `string`

##### turn

> `readonly` **turn**: `number`

##### waitId

> `readonly` **waitId**: `string`

***

### ToolProgress

An in-flight progress update from a running tool.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"ToolProgress"`

##### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `Json`\>

##### message?

> `readonly` `optional` **message?**: `string`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### toolCallId

> `readonly` **toolCallId**: `string`

##### turn

> `readonly` **turn**: `number`

***

### TurnCompleted

Emitted after each model turn completes (after tool executions
for that turn). `transcript` is the full chat history at this point — hosts
that persist conversation state read it
from here.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"TurnCompleted"`

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### transcript

> `readonly` **transcript**: `Prompt`

##### turn

> `readonly` **turn**: `number`

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

### TurnStarted

A model turn has started. `turn` is 0-based.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"TurnStarted"`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### turn

> `readonly` **turn**: `number`

## Type Aliases

### ApprovalId

> **ApprovalId** = *typeof* `ApprovalId.Type`

Stable identity for one authorization request.

***

### ApprovalRequest

> **ApprovalRequest** = *typeof* `ApprovalRequest.Type`

Canonical identity and payload for one authorization request.

***

### Event

> **Event**\<`Output`\> = [`TurnStarted`](#turnstarted) \| [`ModelPart`](#modelpart) \| `ModelResponseCommitted` \| [`ToolExecutionStarted`](#toolexecutionstarted) \| [`ToolProgress`](#toolprogress) \| [`ToolExecutionCompleted`](#toolexecutioncompleted) \| [`ToolExecutionWaiting`](#toolexecutionwaiting) \| `HandoffRequested` \| `HandoffCompleted` \| `RejectedEvent` \| [`ApprovalRequested`](#approvalrequested) \| [`SteeringDrained`](#steeringdrained) \| [`TurnCompleted`](#turncompleted) \| [`GateResult`](#gateresult) \| [`Completed`](#completed)\<`Output`\> \| [`Event`](./ModelTelemetry#event)

Closed union of Generalist loop events.

#### Type Parameters

##### Output

`Output` = `unknown`

***

### Metadata

> **Metadata** = `Readonly`\<`Record`\<`string`, `Schema.Json`\>\>

Escape-hatch metadata carried by loop events.

***

### SteeringQueueName

> **SteeringQueueName** = `"steering"` \| `"followUp"`

Steering queue whose inputs were consumed at a turn boundary.

***

### ToolOrigin

> **ToolOrigin** = *typeof* `ToolOrigin.Type`

The origin of one tool declaration in an Agent run.

## Variables

### addUsage

> `const` **addUsage**: \{(`right`): (`left`) => `Usage`; (`left`, `right`): `Usage`; \}

Fieldwise sum of upstream model usage values.

#### Call Signature

> (`right`): (`left`) => `Usage`

##### Parameters

###### right

`Usage`

##### Returns

(`left`) => `Usage`

#### Call Signature

> (`left`, `right`): `Usage`

##### Parameters

###### left

`Usage`

###### right

`Usage`

##### Returns

`Usage`

***

### ApprovalId

> `const` **ApprovalId**: `Schema.String`

Stable identity for one authorization request.

***

### ApprovalRequest

> `const` **ApprovalRequest**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>

Canonical identity and payload for one authorization request.

***

### ToolOrigin

> `const` **ToolOrigin**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Static"`, \{ `agent`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Builtin"`, \{ `builtin`: `Schema.Literal`\<`"activate_skill"`\>; \}\>, `Schema.TaggedStruct`\<`"Skill"`, \{ `skill`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Handoff"`, \{ `mode`: `Schema.Literals`\<readonly \[`"same-run"`, `"delegate"`\]\>; `specialist`: `Schema.String`; \}\>\]\>

The origin of one tool declaration in an Agent run.
