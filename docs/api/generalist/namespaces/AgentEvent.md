[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentEvent

# AgentEvent

## Classes

<a id="agenterror"></a>

### AgentError

The loop failed. `turn` is the 0-based turn that failed.

#### Extends

- `AgentError_base`

#### Constructors

<a id="constructor"></a>

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

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AgentError_base.cause`

<a id="diagnostics"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AgentError_base.message`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`AgentError_base.turn`

#### Methods

<a id="make"></a>

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

<a id="agentsuspended"></a>

### AgentSuspended

The run suspended with one or more exact authored-order waits.
The run did NOT finish; the host resolves waits out-of-band and re-enters via
`RunOptions.resume` with this exact batch checkpoint.

#### Extends

- `AgentSuspended_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="checkpoint"></a>

##### checkpoint

> `readonly` **checkpoint**: `object`

###### activatedSkills

> `readonly` **activatedSkills**: readonly `string`[]

###### activeTools

> `readonly` **activeTools**: readonly `string`[]

###### argumentTaint?

> `readonly` `optional` **argumentTaint?**: readonly `object`[]

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AgentSuspended_base.hint`

<a id="waits"></a>

##### waits

> `readonly` **waits**: readonly `object`[]

###### Inherited from

`AgentSuspended_base.waits`

***

<a id="childexceedsparent"></a>

### ChildExceedsParent

A child requested authority unavailable to its parent.

#### Extends

- `ChildExceedsParent_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="field"></a>

##### field

> `readonly` **field**: `"tools"` \| `"sandbox"` \| `"permissions"`

###### Inherited from

`ChildExceedsParent_base.field`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ChildExceedsParent_base.hint`

***

<a id="duplicatetoolcallid"></a>

### DuplicateToolCallId

A transformed model response reused a tool-call identifier.

#### Extends

- `DuplicateToolCallId_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="duplicateindex"></a>

##### duplicateIndex

> `readonly` **duplicateIndex**: `number`

###### Inherited from

`DuplicateToolCallId_base.duplicateIndex`

<a id="firstindex"></a>

##### firstIndex

> `readonly` **firstIndex**: `number`

###### Inherited from

`DuplicateToolCallId_base.firstIndex`

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`DuplicateToolCallId_base.hint`

<a id="id"></a>

##### id

> `readonly` **id**: `string`

###### Inherited from

`DuplicateToolCallId_base.id`

***

<a id="invalidoutput"></a>

### InvalidOutput

The model's terminal value did not satisfy the Agent output Schema.

#### Extends

- `InvalidOutput_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="hint-4"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`InvalidOutput_base.hint`

<a id="issues"></a>

##### issues

> `readonly` **issues**: readonly `string`[]

###### Inherited from

`InvalidOutput_base.issues`

***

<a id="middlewareviolation"></a>

### MiddlewareViolation

A ModelMiddleware hook violated the loop contract.

#### Extends

- `MiddlewareViolation_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="detail"></a>

##### detail

> `readonly` **detail**: `string`

###### Inherited from

`MiddlewareViolation_base.detail`

<a id="hint-5"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`MiddlewareViolation_base.hint`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`MiddlewareViolation_base.turn`

***

<a id="policystopped"></a>

### PolicyStopped

A turn policy successfully stopped for a reason other than a configured turn limit.

#### Extends

- `PolicyStopped_base`

#### Constructors

<a id="constructor-6"></a>

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

<a id="hint-6"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PolicyStopped_base.hint`

<a id="pending"></a>

##### pending

> `readonly` **pending**: readonly `object`[]

###### Inherited from

`PolicyStopped_base.pending`

<a id="reason"></a>

##### reason

> `readonly` **reason**: \{ `_tag`: `"TurnLimit"`; `limit`: `number`; \} \| \{ `_tag`: `"GoalSatisfied"`; \} \| \{ `_tag`: `"BudgetExhausted"`; `budget`: `string`; \} \| \{ `_tag`: `"Policy"`; `detail`: `string`; \}

###### Inherited from

`PolicyStopped_base.reason`

<a id="turn-2"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`PolicyStopped_base.turn`

***

<a id="progressoverflow"></a>

### ProgressOverflow

An explicitly failing tool progress queue reached capacity.

#### Extends

- `ProgressOverflow_base`

#### Constructors

<a id="constructor-7"></a>

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

<a id="capacity"></a>

##### capacity

> `readonly` **capacity**: `number`

###### Inherited from

`ProgressOverflow_base.capacity`

<a id="hint-7"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ProgressOverflow_base.hint`

<a id="toolcallid"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

###### Inherited from

`ProgressOverflow_base.toolCallId`

<a id="turn-3"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`ProgressOverflow_base.turn`

***

<a id="resumemismatch"></a>

### ResumeMismatch

A resume identity did not match the current authoritative suspension checkpoint.

#### Extends

- `ResumeMismatch_base`

#### Constructors

<a id="constructor-8"></a>

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

<a id="expected"></a>

##### expected?

> `readonly` `optional` **expected?**: [`AgentSuspended`](#agentsuspended)

###### Inherited from

`ResumeMismatch_base.expected`

<a id="hint-8"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ResumeMismatch_base.hint`

<a id="reason-1"></a>

##### reason

> `readonly` **reason**: `"checkpoint-not-found"` \| `"identity-mismatch"`

###### Inherited from

`ResumeMismatch_base.reason`

<a id="received"></a>

##### received

> `readonly` **received**: [`AgentSuspended`](#agentsuspended)

###### Inherited from

`ResumeMismatch_base.received`

***

<a id="runendedwithoutoutput"></a>

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

<a id="constructor-9"></a>

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

<a id="finishreason"></a>

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

###### Inherited from

`RunEndedWithoutOutput_base.finishReason`

<a id="hint-9"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunEndedWithoutOutput_base.hint`

<a id="providertextcharacters"></a>

##### providerTextCharacters

> `readonly` **providerTextCharacters**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.providerTextCharacters`

<a id="reasoningcharacters"></a>

##### reasoningCharacters

> `readonly` **reasoningCharacters**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.reasoningCharacters`

<a id="turn-4"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`RunEndedWithoutOutput_base.turn`

***

<a id="toolnamecollision"></a>

### ToolNameCollision

The advertised tool set contains more than one declaration for a name.

#### Extends

- `ToolNameCollision_base`

#### Constructors

<a id="constructor-10"></a>

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

<a id="hint-10"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ToolNameCollision_base.hint`

<a id="name"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`ToolNameCollision_base.name`

<a id="origins"></a>

##### origins

> `readonly` **origins**: readonly \[\{ `agent`: `string`; \} \| \{ `builtin`: `"activate_skill"`; \} \| \{ `skill`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}, \{ `agent`: `string`; \} \| \{ `builtin`: `"activate_skill"`; \} \| \{ `skill`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}\]

###### Inherited from

`ToolNameCollision_base.origins`

***

<a id="turnlimitexceeded"></a>

### TurnLimitExceeded

The turn policy declined another turn while tool results were still pending.

#### Extends

- `TurnLimitExceeded_base`

#### Constructors

<a id="constructor-11"></a>

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

<a id="hint-11"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`TurnLimitExceeded_base.hint`

<a id="limit"></a>

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`TurnLimitExceeded_base.limit`

<a id="pending-1"></a>

##### pending

> `readonly` **pending**: readonly `object`[]

###### Inherited from

`TurnLimitExceeded_base.pending`

<a id="turn-5"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

`TurnLimitExceeded_base.turn`

## Interfaces

<a id="approvalrequested"></a>

### ApprovalRequested

Emitted before resolving a permission ask or needsApproval tool.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"ApprovalRequested"`

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="request"></a>

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

<a id="turn-6"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="completed"></a>

### Completed

Terminal event: the run finished without suspension.

#### Type Parameters

##### Output

`Output` = `unknown`

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Completed"`

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="output-1"></a>

##### output

> `readonly` **output**: `Output`

<a id="text"></a>

##### text

> `readonly` **text**: `string`

<a id="transcript"></a>

##### transcript

> `readonly` **transcript**: `Prompt`

<a id="turns"></a>

##### turns

> `readonly` **turns**: `number`

<a id="usage"></a>

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

<a id="gateresult"></a>

### GateResult

One ordered completion gate verdict for a proposed terminal output.

#### Extends

- [`Result`](./Gate#result)

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"GateResult"`

<a id="evidence"></a>

##### evidence

> `readonly` **evidence**: `Json`

###### Inherited from

`CompletionGateResult.evidence`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`CompletionGateResult.name`

<a id="turn-7"></a>

##### turn

> `readonly` **turn**: `number`

<a id="verdict"></a>

##### verdict

> `readonly` **verdict**: `"pass"` \| `"fail"`

###### Inherited from

`CompletionGateResult.verdict`

***

<a id="modelpart"></a>

### ModelPart

A raw model stream part, passed through unchanged.
`modelCallId`, `modelAttemptId`, and 0-based `attempt` join the part to its
model-call and attempt lifecycle events.

#### Properties

<a id="_tag-3"></a>

##### \_tag

> `readonly` **\_tag**: `"ModelPart"`

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="metadata-2"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="modelattemptid"></a>

##### modelAttemptId

> `readonly` **modelAttemptId**: `string`

<a id="modelcallid"></a>

##### modelCallId

> `readonly` **modelCallId**: `string`

<a id="part"></a>

##### part

> `readonly` **part**: `StreamPart`\<`Record`\<`string`, `Any`\>\>

<a id="turn-8"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="steeringdrained"></a>

### SteeringDrained

A steering or follow-up queue was drained into the next prompt.

#### Properties

<a id="_tag-4"></a>

##### \_tag

> `readonly` **\_tag**: `"SteeringDrained"`

<a id="count"></a>

##### count

> `readonly` **count**: `number`

<a id="metadata-3"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="queue"></a>

##### queue

> `readonly` **queue**: [`SteeringQueueName`](#steeringqueuename)

<a id="turn-9"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="toolexecutioncompleted"></a>

### ToolExecutionCompleted

A tool call finished; `result` is the part re-fed to the model.

#### Properties

<a id="_tag-5"></a>

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionCompleted"`

<a id="artifactread"></a>

##### artifactRead?

> `readonly` `optional` **artifactRead?**: `object`

###### artifact

> `readonly` **artifact**: `string`

###### branch?

> `readonly` `optional` **branch?**: `string`

###### version

> `readonly` **version**: `number`

<a id="artifactupdated"></a>

##### artifactUpdated?

> `readonly` `optional` **artifactUpdated?**: `object`

###### artifact

> `readonly` **artifact**: `string`

###### attribution

> `readonly` **attribution**: \{ `actor`: `string`; `runId`: `string`; \} \| \{ `actor`: `string`; \}

###### base

> `readonly` **base**: `number`

###### branch?

> `readonly` `optional` **branch?**: `string`

###### result

> `readonly` **result**: `number`

<a id="call-1"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="metadata-4"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\> & `object`

###### Type Declaration

###### toolProgress?

> `readonly` `optional` **toolProgress?**: `object`

###### toolProgress.dropped

> `readonly` **dropped**: `number`

<a id="result"></a>

##### result

> `readonly` **result**: `ToolResultPart`\<`string`, `unknown`, `unknown`\> & `object`

###### Type Declaration

###### taint

> `readonly` **taint**: readonly `object`[]

<a id="tasksupdated"></a>

##### tasksUpdated?

> `readonly` `optional` **tasksUpdated?**: readonly `object`[]

<a id="turn-10"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="toolexecutionstarted"></a>

### ToolExecutionStarted

A tool call is about to execute via the ToolExecutor service.

#### Properties

<a id="_tag-6"></a>

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionStarted"`

<a id="call-2"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="metadata-5"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="turn-11"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="toolexecutionwaiting"></a>

### ToolExecutionWaiting

A tool reached a durable wait without disturbing admitted siblings.

#### Properties

<a id="_tag-7"></a>

##### \_tag

> `readonly` **\_tag**: `"ToolExecutionWaiting"`

<a id="awaitevent"></a>

##### awaitEvent?

> `readonly` `optional` **awaitEvent?**: `object`

###### deadline

> `readonly` **deadline**: `string`

###### filter

> `readonly` **filter**: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"update"` \| `"create"` \| `"remove"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}

<a id="call-3"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="metadata-6"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="token"></a>

##### token

> `readonly` **token**: `string`

<a id="turn-12"></a>

##### turn

> `readonly` **turn**: `number`

<a id="waitid"></a>

##### waitId

> `readonly` **waitId**: `string`

***

<a id="toolprogress"></a>

### ToolProgress

An in-flight progress update from a running tool.

#### Properties

<a id="_tag-8"></a>

##### \_tag

> `readonly` **\_tag**: `"ToolProgress"`

<a id="data"></a>

##### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `Json`\>

<a id="message-1"></a>

##### message?

> `readonly` `optional` **message?**: `string`

<a id="metadata-7"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="toolcallid-1"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

<a id="turn-13"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="turncompleted"></a>

### TurnCompleted

Emitted after each model turn completes (after tool executions
for that turn). `transcript` is the full chat history at this point — hosts
that persist conversation state read it
from here.

#### Properties

<a id="_tag-9"></a>

##### \_tag

> `readonly` **\_tag**: `"TurnCompleted"`

<a id="finishreason-1"></a>

##### finishReason?

> `readonly` `optional` **finishReason?**: `"stop"` \| `"length"` \| `"content-filter"` \| `"tool-calls"` \| `"error"` \| `"pause"` \| `"other"` \| `"unknown"`

<a id="metadata-8"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="transcript-1"></a>

##### transcript

> `readonly` **transcript**: `Prompt`

<a id="turn-14"></a>

##### turn

> `readonly` **turn**: `number`

<a id="usage-1"></a>

##### usage?

> `readonly` `optional` **usage?**: `Usage`

***

<a id="turnstarted"></a>

### TurnStarted

A model turn has started. `turn` is 0-based.

#### Properties

<a id="_tag-10"></a>

##### \_tag

> `readonly` **\_tag**: `"TurnStarted"`

<a id="metadata-9"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="turn-15"></a>

##### turn

> `readonly` **turn**: `number`

## Type Aliases

<a id="approvalid"></a>

### ApprovalId

> **ApprovalId** = *typeof* `ApprovalId.Type`

Stable identity for one authorization request.

***

<a id="approvalrequest"></a>

### ApprovalRequest

> **ApprovalRequest** = *typeof* `ApprovalRequest.Type`

Canonical identity and payload for one authorization request.

***

<a id="event"></a>

### Event

> **Event**\<`Output`\> = [`TurnStarted`](#turnstarted) \| [`ModelPart`](#modelpart) \| `ModelResponseCommitted` \| [`ToolExecutionStarted`](#toolexecutionstarted) \| [`ToolProgress`](#toolprogress) \| [`ToolExecutionCompleted`](#toolexecutioncompleted) \| [`ToolExecutionWaiting`](#toolexecutionwaiting) \| `HandoffRequested` \| `HandoffCompleted` \| `RejectedEvent` \| [`ApprovalRequested`](#approvalrequested) \| [`SteeringDrained`](#steeringdrained) \| [`TurnCompleted`](#turncompleted) \| [`GateResult`](#gateresult) \| [`Completed`](#completed)\<`Output`\> \| [`Event`](./ModelTelemetry#event)

Closed union of Generalist loop events.

#### Type Parameters

##### Output

`Output` = `unknown`

***

<a id="metadata-10"></a>

### Metadata

> **Metadata** = `Readonly`\<`Record`\<`string`, `Schema.Json`\>\>

Escape-hatch metadata carried by loop events.

***

<a id="steeringqueuename"></a>

### SteeringQueueName

> **SteeringQueueName** = `"steering"` \| `"followUp"`

Steering queue whose inputs were consumed at a turn boundary.

***

<a id="toolorigin"></a>

### ToolOrigin

> **ToolOrigin** = *typeof* `ToolOrigin.Type`

The origin of one tool declaration in an Agent run.

## Variables

<a id="addusage"></a>

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

<a id="approvalid-1"></a>

### ApprovalId

> `const` **ApprovalId**: `Schema.String`

Stable identity for one authorization request.

***

<a id="approvalrequest-1"></a>

### ApprovalRequest

> `const` **ApprovalRequest**: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>

Canonical identity and payload for one authorization request.

***

<a id="toolorigin-1"></a>

### ToolOrigin

> `const` **ToolOrigin**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Static"`, \{ `agent`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Builtin"`, \{ `builtin`: `Schema.Literal`\<`"activate_skill"`\>; \}\>, `Schema.TaggedStruct`\<`"Skill"`, \{ `skill`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Handoff"`, \{ `mode`: `Schema.Literals`\<readonly \[`"same-run"`, `"delegate"`\]\>; `specialist`: `Schema.String`; \}\>\]\>

The origin of one tool declaration in an Agent run.
