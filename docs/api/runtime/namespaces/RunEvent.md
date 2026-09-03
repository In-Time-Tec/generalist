[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / RunEvent

# RunEvent

## Type Aliases

<a id="agentloopevent"></a>

### AgentLoopEvent

> **AgentLoopEvent** = `Exclude`\<[`Event`](../../generalist/namespaces/AgentEvent#event), [`Completed`](../../generalist/namespaces/AgentEvent#completed)\>

***

<a id="awaiting"></a>

### Awaiting

> **Awaiting** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Awaiting"`

##### deadline

> `readonly` **deadline**: `string`

##### filter

> `readonly` **filter**: [`WakeEventFilter`](../../generalist/namespaces/Agent#wakeeventfilter)

##### waitId

> `readonly` **waitId**: `string`

***

<a id="budgetextended"></a>

### BudgetExtended

> **BudgetExtended** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"BudgetExtended"`

##### delta

> `readonly` **delta**: [`BudgetLimits`](../../generalist/namespaces/RunBudget#budgetlimits)

***

<a id="budgetsuspended"></a>

### BudgetSuspended

> **BudgetSuspended** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"BudgetSuspended"`

##### budget

> `readonly` **budget**: [`Dimension`](../../generalist/namespaces/RunBudget#dimension)

***

<a id="childlinked"></a>

### ChildLinked

> **ChildLinked** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ChildLinked"`

##### budget?

> `readonly` `optional` **budget?**: [`BudgetLimits`](../../generalist/namespaces/RunBudget#budgetlimits)

##### childDepth

> `readonly` **childDepth**: `number`

##### childRunId

> `readonly` **childRunId**: `string`

##### inherit

> `readonly` **inherit**: [`Inheritance`](../../generalist/namespaces/Agent#inheritance)

##### invocationId

> `readonly` **invocationId**: `string`

##### key?

> `readonly` `optional` **key?**: `string`

##### label?

> `readonly` `optional` **label?**: `string`

##### origin?

> `readonly` `optional` **origin?**: `FanOutOrigin`

##### prompt

> `readonly` **prompt**: `Prompt.Prompt`

##### readiness

> `readonly` **readiness**: [`ChildReadiness`](./ChildReadiness#childreadiness)

##### selection

> `readonly` **selection**: `string`

***

<a id="childreadinesschanged"></a>

### ChildReadinessChanged

> **ChildReadinessChanged** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ChildReadinessChanged"`

##### childRunId

> `readonly` **childRunId**: `string`

##### readiness

> `readonly` **readiness**: [`ChildReadiness`](./ChildReadiness#childreadiness)

***

<a id="childsettled"></a>

### ChildSettled

> **ChildSettled** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"ChildSettled"`

##### childRunId

> `readonly` **childRunId**: `string`

##### spend?

> `readonly` `optional` **spend?**: [`Spend`](../../generalist/namespaces/RunBudget#spend)

##### terminalEventId

> `readonly` **terminalEventId**: `string`

***

<a id="completedmodelresponse"></a>

### CompletedModelResponse

> **CompletedModelResponse** = *typeof* `CompletedModelResponse.Type`

***

<a id="duplicate"></a>

### Duplicate

> **Duplicate** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Duplicate"`

##### dedupeKey

> `readonly` **dedupeKey**: `string`

***

<a id="fanoutadmitted"></a>

### FanOutAdmitted

> **FanOutAdmitted** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"FanOutAdmitted"`

##### concurrency

> `readonly` **concurrency**: `number`

##### fanOutId

> `readonly` **fanOutId**: `string`

##### join

> `readonly` **join**: [`FanOutJoin`](./FanOut#fanoutjoin)

##### memberCount

> `readonly` **memberCount**: `number`

##### remainder

> `readonly` **remainder**: [`FanOutRemainder`](./FanOut#fanoutremainder)

***

<a id="fanoutjoined"></a>

### FanOutJoined

> **FanOutJoined** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"FanOutJoined"`

##### abandoned

> `readonly` **abandoned**: `number`

##### cancelled

> `readonly` **cancelled**: `number`

##### failed

> `readonly` **failed**: `number`

##### fanOutId

> `readonly` **fanOutId**: `string`

##### remainder

> `readonly` **remainder**: `ReadonlyArray`\<\{ `action`: `"cancellation-requested"` \| `"abandoned"`; `childRunId`: `string`; \}\>

##### status

> `readonly` **status**: `"succeeded"` \| `"failed"` \| `"cancelled"`

##### succeeded

> `readonly` **succeeded**: `number`

***

<a id="inbox"></a>

### Inbox

> **Inbox** = [`RunEventBase`](#runeventbase) & `object`

One accepted Run inbox message, journaled before it becomes eligible for delivery.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Inbox"`

##### addressed?

> `readonly` `optional` **addressed?**: [`Message`](./Message#message)

##### digest

> `readonly` **digest**: `string`

##### entryId

> `readonly` **entryId**: `string`

##### from

> `readonly` **from**: [`MessageSource`](./Steering#messagesource)

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### inboxSequence

> `readonly` **inboxSequence**: `number`

##### message

> `readonly` **message**: `Prompt.Prompt`

##### policy

> `readonly` **policy**: [`AdmissionPolicy`](../../generalist/namespaces/Steering#admissionpolicy)

***

<a id="lifecycleevent"></a>

### LifecycleEvent

> **LifecycleEvent** = `TriggerEvent` \| [`RunAccepted`](#runaccepted) \| [`BudgetExtended`](#budgetextended) \| [`BudgetSuspended`](#budgetsuspended) \| [`RunAttemptStarted`](#runattemptstarted) \| [`RunWaiting`](#runwaiting) \| [`RunResumed`](#runresumed) \| [`Inbox`](#inbox) \| [`SteeringAccepted`](#steeringaccepted) \| [`SteeringConsumed`](#steeringconsumed) \| [`SteeringDiscarded`](#steeringdiscarded) \| [`OperationUnknown`](#operationunknown) \| [`Substituted`](#substituted) \| [`ChildLinked`](#childlinked) \| [`ChildReadinessChanged`](#childreadinesschanged) \| [`ChildSettled`](#childsettled) \| [`FanOutAdmitted`](#fanoutadmitted) \| [`FanOutJoined`](#fanoutjoined) \| [`RunCompleted`](#runcompleted) \| [`RunFailed`](#runfailed) \| [`RunCancellationRequested`](#runcancellationrequested) \| [`RunCancelled`](#runcancelled) \| `ProgramLog` \| [`Rewarded`](#rewarded)

***

<a id="operationunknown"></a>

### OperationUnknown

> **OperationUnknown** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"OperationUnknown"`

##### operationId

> `readonly` **operationId**: `string`

***

<a id="rewarded"></a>

### Rewarded

> **Rewarded** = [`RunEventBase`](#runeventbase) & `object`

Scalar reward assigned to one exported trajectory leaf.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Rewarded"`

##### leaf

> `readonly` **leaf**: `string`

##### source

> `readonly` **source**: `string`

##### value

> `readonly` **value**: `number`

***

<a id="rewardinput"></a>

### RewardInput

> **RewardInput** = `Pick`\<[`Rewarded`](#rewarded), `"runId"` \| `"leaf"` \| `"value"` \| `"source"`\>

Reward payload accepted by the Runtime journal.

***

<a id="runaccepted"></a>

### RunAccepted

> **RunAccepted** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunAccepted"`

##### address

> `readonly` **address**: [`Address`](./Address#address)

##### budget?

> `readonly` `optional` **budget?**: [`BudgetLimits`](../../generalist/namespaces/RunBudget#budgetlimits)

##### messageId

> `readonly` **messageId**: `string`

***

<a id="runattemptstarted"></a>

### RunAttemptStarted

> **RunAttemptStarted** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunAttemptStarted"`

##### attempt

> `readonly` **attempt**: `number`

***

<a id="runcancellationrequested"></a>

### RunCancellationRequested

> **RunCancellationRequested** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunCancellationRequested"`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="runcancelled"></a>

### RunCancelled

> **RunCancelled** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunCancelled"`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="runcompleted"></a>

### RunCompleted

> **RunCompleted** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunCompleted"`

##### result

> `readonly` **result**: [`ExecutionResult`](./ExecutionState#executionresult)

***

<a id="runevent"></a>

### RunEvent

> **RunEvent** = [`RunEventBase`](#runeventbase) & `DurableAgentLoopEvent` \| [`LifecycleEvent`](#lifecycleevent)

***

<a id="runeventbase"></a>

### RunEventBase

> **RunEventBase** = *typeof* `RunEventBase.Type`

***

<a id="runfailed"></a>

### RunFailed

> **RunFailed** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunFailed"`

##### error

> `readonly` **error**: [`RunFailure`](#runfailure)

***

<a id="runfailure"></a>

### RunFailure

> **RunFailure** = [`RunFailure`](./Run#runfailure)

***

<a id="runresumed"></a>

### RunResumed

> **RunResumed** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunResumed"`

##### resolution

> `readonly` **resolution**: [`WaitResolution`](./RunWait#waitresolution)

##### waitId

> `readonly` **waitId**: `string`

***

<a id="runwaiting"></a>

### RunWaiting

> **RunWaiting** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"RunWaiting"`

##### wait

> `readonly` **wait**: [`RunWait`](./RunWait#runwait)

***

<a id="sequence"></a>

### Sequence

> **Sequence** = *typeof* `Sequence.Type`

***

<a id="specversion"></a>

### SpecVersion

> **SpecVersion** = *typeof* `SpecVersion.Type`

***

<a id="steeringaccepted"></a>

### SteeringAccepted

> **SteeringAccepted** = [`RunEventBase`](#runeventbase) & `object`

Exact durable steering admission fact.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"SteeringAccepted"`

##### digest

> `readonly` **digest**: `string`

##### entryId

> `readonly` **entryId**: `string`

##### idempotencyKey

> `readonly` **idempotencyKey**: `string`

##### prompt

> `readonly` **prompt**: `Prompt.Prompt`

##### steeringSequence

> `readonly` **steeringSequence**: `number`

***

<a id="steeringconsumed"></a>

### SteeringConsumed

> **SteeringConsumed** = [`RunEventBase`](#runeventbase) & `object`

Exact durable steering consumption fact.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"SteeringConsumed"`

##### entryIds

> `readonly` **entryIds**: `ReadonlyArray`\<`string`\>

##### operationId

> `readonly` **operationId**: `string`

***

<a id="steeringdiscarded"></a>

### SteeringDiscarded

> **SteeringDiscarded** = [`RunEventBase`](#runeventbase) & `object`

Exact terminal disposition fact for unconsumed steering.

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"SteeringDiscarded"`

##### entryIds

> `readonly` **entryIds**: `ReadonlyArray`\<`string`\>

##### reason

> `readonly` **reason**: [`SteeringDiscardReason`](#steeringdiscardreason)

***

<a id="steeringdiscardreason"></a>

### SteeringDiscardReason

> **SteeringDiscardReason** = *typeof* `SteeringDiscardReason.Type`

Terminal disposition category for accepted steering.

***

<a id="substituted"></a>

### Substituted

> **Substituted** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"Substituted"`

##### operationId

> `readonly` **operationId**: `string`

***

<a id="timedout"></a>

### TimedOut

> **TimedOut** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"TimedOut"`

##### deadline

> `readonly` **deadline**: `string`

##### waitId

> `readonly` **waitId**: `string`

***

<a id="wakereceived"></a>

### WakeReceived

> **WakeReceived** = [`RunEventBase`](#runeventbase) & `object`

#### Type Declaration

##### \_tag

> `readonly` **\_tag**: `"WakeReceived"`

##### event

> `readonly` **event**: [`WakeEvent`](../../generalist/namespaces/Agent#wakeevent)

## Variables

<a id="agentloopeventschema"></a>

### AgentLoopEventSchema

> `const` **AgentLoopEventSchema**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"TurnStarted"`, \{ `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ModelResponseCommitted"`, \{ `attempt`: `Schema.Finite`; `budgetCharge`: `Schema.Int`; `digest`: `Schema.String`; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `operationKey`: `Schema.String`; `sessionEntryId`: `Schema.String`; `sessionId`: `Schema.String`; `sessionParentId`: `Schema.NullOr`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<...\>; `cacheWrite`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; `uncached`: `Schema.optionalKey`\<...\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<...\>; `text`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; \}\>; \}\>\>; \}\>, `Schema.TaggedStruct`\<`"ModelResponseInterrupted"`, \{ `attempt`: `Schema.Finite`; `digest`: `Schema.String`; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `operationKey`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[`"cancel"`, `"failure"`\]\>; `sessionEntryId`: `Schema.String`; `sessionId`: `Schema.String`; `sessionParentId`: `Schema.NullOr`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<...\>; `cacheWrite`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; `uncached`: `Schema.optionalKey`\<...\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<...\>; `text`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; \}\>; \}\>\>; \}\>, `Schema.TaggedStruct`\<`"ToolExecutionStarted"`, \{ `call`: `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolProgress"`, \{ `data`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `message`: `Schema.optionalKey`\<`Schema.String`\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `toolCallId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolExecutionCompleted"`, \{ `call`: `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `result`: `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `encodedResult`: `Schema.Unknown`; `id`: `Schema.String`; `isFailure`: `Schema.Boolean`; `memoized`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `fromOperation`: `Schema.String`; `fromRun`: `Schema.String`; \}\>\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `preliminary`: `Schema.Boolean`; `providerExecuted`: `Schema.Boolean`; `result`: `Schema.Unknown`; `taint`: `Schema.$Array`\<`Schema.Struct`\<\{ `capabilityId`: `Schema.brand`\<..., ...\>; `tool`: `Schema.String`; `toolCallId`: `Schema.String`; \}\>\>; `type`: `Schema.Literal`\<`"tool-result"`\>; \}\>; `tasksUpdated`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Struct`\<\{ `id`: `Schema.String`; `note`: `Schema.optionalKey`\<`Schema.String`\>; `status`: `Schema.Literals`\<readonly ...\>; `title`: `Schema.String`; \}\>\>\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ToolExecutionWaiting"`, \{ `awaitEvent`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>\>; `call`: `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `token`: `Schema.String`; `turn`: `Schema.Finite`; `waitId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"HandoffRequested"`, \{ `handoffId`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"HandoffCompleted"`, \{ `handoffId`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `source`: `Schema.String`; `target`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"Rejected"`, \{ `handoffId`: `Schema.String`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `reason`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"ApprovalRequested"`, \{ `call`: `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `request`: `Schema.Struct`\<\{ `approvalId`: `Schema.String`; `capability`: `Schema.String`; `input`: `Schema.Unknown`; `operation`: `Schema.String`; \}\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"SteeringDrained"`, \{ `count`: `Schema.Finite`; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.TaggedStruct`\<`"TurnCompleted"`, \{ `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `metadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>\>\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<...\>; `cacheWrite`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; `uncached`: `Schema.optionalKey`\<...\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<...\>; `text`: `Schema.optionalKey`\<...\>; `total`: `Schema.optionalKey`\<...\>; \}\>; \}\>\>; \}\>, `Schema.TaggedStruct`\<`"GateResult"`, \{ `evidence`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `name`: `Schema.String`; `turn`: `Schema.Finite`; `verdict`: `Schema.Literals`\<readonly \[`"pass"`, `"fail"`\]\>; \}\>, `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallStarted"`\>; `compactionId`: `Schema.optionalKey`\<`Schema.String`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptStarted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `deliveryId`: `Schema.String`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `startedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFirstOutput"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptCompleted"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `finishReason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerMetadata`: `Schema.optionalKey`\<`Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<...\>\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `requestId`: `Schema.optionalKey`\<`Schema.String`\>; `responseModel`: `Schema.optionalKey`\<`Schema.String`\>; `serviceTier`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; `usage`: `Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<...\>; `outputTokens`: `Schema.Struct`\<...\>; \}\>; `usageAt`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelAttemptFailed"`\>; `attempt`: `Schema.Int`; `candidate`: `Schema.optionalKey`\<`Schema.Int`\>; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `classification`: `Schema.Literals`\<readonly \[..., ...\]\>; `deliveryId`: `Schema.String`; `disposition`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `failedAt`: `Schema.Finite`; `model`: `Schema.optionalKey`\<`Schema.String`\>; `modelAttemptId`: `Schema.String`; `modelCallId`: `Schema.String`; `provider`: `Schema.optionalKey`\<`Schema.String`\>; `providerUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `registrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelRetryScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `delayMillis`: `Schema.Finite`; `deliveryId`: `Schema.String`; `modelCallId`: `Schema.String`; `reason`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelFallbackScheduled"`\>; `at`: `Schema.Finite`; `attempt`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `deliveryId`: `Schema.String`; `fromCandidate`: `Schema.Int`; `fromModel`: `Schema.String`; `fromProvider`: `Schema.String`; `fromRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `modelCallId`: `Schema.String`; `toCandidate`: `Schema.Int`; `toModel`: `Schema.String`; `toProvider`: `Schema.String`; `toRegistrationKey`: `Schema.optionalKey`\<`Schema.String`\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallCompleted"`\>; `attempts`: `Schema.Int`; `completedAt`: `Schema.Finite`; `deliveryId`: `Schema.String`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[..., ..., ..., ..., ..., ..., ..., ...\]\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `turn`: `Schema.Finite`; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; \}\>\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"ModelCallFailed"`\>; `attempts`: `Schema.Int`; `category`: `Schema.Literals`\<readonly \[..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ..., ...\]\>; `classification`: `Schema.Literals`\<readonly \[..., ...\]\>; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `failedAttemptUsage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: ...; `outputTokens`: ...; `totalTokens`: ...; \}\>\>; `modelCallId`: `Schema.String`; `purpose`: `Schema.Literals`\<readonly \[..., ..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionStarted"`\>; `compactionId`: `Schema.String`; `contextTokensBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `deliveryId`: `Schema.String`; `entriesBefore`: `Schema.optionalKey`\<`Schema.Finite`\>; `startedAt`: `Schema.Finite`; `trigger`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionSkipped"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `skippedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionApplied"`\>; `appliedAt`: `Schema.Finite`; `checkpointId`: `Schema.String`; `commit`: `Schema.Struct`\<\{ `checkpointId`: `Schema.String`; `compactionId`: `Schema.String`; `contextTokensAfter`: `Schema.optionalKey`\<...\>; `contextTokensBefore`: `Schema.optionalKey`\<...\>; `entriesAfter`: `Schema.optionalKey`\<...\>; `entriesBefore`: `Schema.optionalKey`\<...\>; `summaryModelCallId`: `Schema.optionalKey`\<...\>; \}\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[..., ...\]\>; `turn`: `Schema.Finite`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"CompactionFailed"`\>; `compactionId`: `Schema.String`; `deliveryId`: `Schema.String`; `failedAt`: `Schema.Finite`; `turn`: `Schema.Finite`; \}\>\]\>\]\>

***

<a id="completedmodelresponse-1"></a>

### CompletedModelResponse

> `const` **CompletedModelResponse**: `Schema.Struct`\<\{ `content`: `Schema.$Array`\<`Schema.Union`\<readonly \[`Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `text`: `Schema.String`; `type`: `Schema.tag`\<`"text"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `text`: `Schema.String`; `type`: `Schema.tag`\<`"reasoning"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `approvalId`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `toolCallId`: `Schema.String`; `type`: `Schema.tag`\<`"tool-approval-request"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `data`: `Schema.Uint8ArrayFromBase64`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `type`: `Schema.tag`\<`"file"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `fileName`: `Schema.optionalKey`\<`Schema.String`\>; `id`: `Schema.String`; `mediaType`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `sourceType`: `Schema.tag`\<`"document"`\>; `title`: `Schema.String`; `type`: `Schema.tag`\<`"source"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `id`: `Schema.String`; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `sourceType`: `Schema.tag`\<`"url"`\>; `title`: `Schema.String`; `type`: `Schema.tag`\<`"source"`\>; `url`: `Schema.URLFromString`; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `id`: `Schema.optional`\<`Schema.String`\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `modelId`: `Schema.optional`\<`Schema.String`\>; `request`: `Schema.optional`\<*typeof* `Response.HttpRequestDetails`\>; `timestamp`: `Schema.optional`\<`Schema.DateTimeUtcFromString`\>; `type`: `Schema.tag`\<`"response-metadata"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.tag`\<`"~effect/ai/Content/Part"`\>\>; `metadata`: `Schema.withDecodingDefault`\<`Schema.$Record`\<`Schema.String`, `Schema.Codec`\<...\>\>\>; `reason`: `Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>; `response`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Struct`\<...\>\>\>; `type`: `Schema.tag`\<`"finish"`\>; `usage`: `Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<...\>; `outputTokens`: `Schema.Struct`\<...\>; \}\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `id`: `Schema.String`; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<..., ..., ..., ...\>\>\>; `name`: `Schema.String`; `params`: `Schema.Unknown`; `providerExecuted`: `Schema.Boolean`; `type`: `Schema.Literal`\<`"tool-call"`\>; \}\>, `Schema.Struct`\<\{ `~effect/ai/Content/Part`: `Schema.withDecodingDefaultKey`\<`Schema.Literal`\<`"~effect/ai/Content/Part"`\>, `never`\>; `encodedResult`: `Schema.Unknown`; `id`: `Schema.String`; `isFailure`: `Schema.Boolean`; `memoized`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `fromOperation`: ...; `fromRun`: ...; \}\>\>; `metadata`: `Schema.$Record`\<`Schema.String`, `Schema.NullOr`\<`Schema.Codec`\<..., ..., ..., ...\>\>\>; `name`: `Schema.String`; `preliminary`: `Schema.Boolean`; `providerExecuted`: `Schema.Boolean`; `result`: `Schema.Unknown`; `taint`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Struct`\<...\>\>\>; `type`: `Schema.Literal`\<`"tool-result"`\>; \}\>\]\>\>; `finishReason`: `Schema.optionalKey`\<`Schema.Literals`\<\[`"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"pause"`, `"other"`, `"unknown"`\]\>\>; `usage`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `inputTokens`: `Schema.Struct`\<\{ `cacheRead`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; `cacheWrite`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; `total`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; `uncached`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; \}\>; `outputTokens`: `Schema.Struct`\<\{ `reasoning`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; `text`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; `total`: `Schema.optionalKey`\<`Schema.UndefinedOr`\<`Schema.Finite`\>\>; \}\>; \}\>\>; \}\>

***

<a id="eventidfor"></a>

### eventIdFor

> `const` **eventIdFor**: \{(`sequence`): (`runId`) => `string`; (`runId`, `sequence`): `string`; \}

#### Call Signature

> (`sequence`): (`runId`) => `string`

##### Parameters

###### sequence

`number`

##### Returns

(`runId`) => `string`

#### Call Signature

> (`runId`, `sequence`): `string`

##### Parameters

###### runId

`string`

###### sequence

`number`

##### Returns

`string`

***

<a id="lifecycletag"></a>

### LifecycleTag

> `const` **LifecycleTag**: `Schema.Literals`\<readonly \[`"Awaiting"`, `"Duplicate"`, `"TimedOut"`, `"WakeReceived"`, `"RunAccepted"`, `"BudgetExtended"`, `"BudgetSuspended"`, `"RunAttemptStarted"`, `"RunWaiting"`, `"RunResumed"`, `"Inbox"`, `"SteeringAccepted"`, `"SteeringConsumed"`, `"SteeringDiscarded"`, `"OperationUnknown"`, `"Substituted"`, `"ChildLinked"`, `"ChildReadinessChanged"`, `"ChildSettled"`, `"FanOutAdmitted"`, `"FanOutJoined"`, `"RunCompleted"`, `"RunFailed"`, `"RunCancellationRequested"`, `"RunCancelled"`, `"ProgramLog"`, `"Rewarded"`\]\>

***

<a id="runevent-1"></a>

### RunEvent

> **RunEvent**: `Codec`\<[`RunEvent`](#runevent), `RunEventEncoded`, `never`, `never`\>

***

<a id="runeventbase-1"></a>

### RunEventBase

> `const` **RunEventBase**: `Schema.Struct`\<\{ `attemptId`: `Schema.optionalKey`\<`Schema.String`\>; `causationId`: `Schema.optionalKey`\<`Schema.String`\>; `correlationId`: `Schema.optionalKey`\<`Schema.String`\>; `depth`: `Schema.Int`; `eventId`: `Schema.String`; `executableRef`: `Schema.Struct`\<\{ `active`: `Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>; `executable`: `Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>; \}\>; `occurredAt`: `Schema.String`; `parentRunId`: `Schema.optionalKey`\<`Schema.String`\>; `rootRunId`: `Schema.String`; `runId`: `Schema.String`; `sequence`: `Schema.Int`; `specVersion`: `Schema.Literals`\<readonly \[`"1"`\]\>; \}\>

***

<a id="runfailure-1"></a>

### RunFailure

> `const` **RunFailure**: `Schema.Codec`\<[`RunFailure`](#runfailure), `unknown`\>

***

<a id="sequence-1"></a>

### Sequence

> `const` **Sequence**: `Schema.Int`

***

<a id="specversion-1"></a>

### SpecVersion

> `const` **SpecVersion**: `Schema.Literals`\<readonly \[`"1"`\]\>

***

<a id="steeringdiscardreason-1"></a>

### SteeringDiscardReason

> `const` **SteeringDiscardReason**: `Schema.Literals`\<readonly \[`"completed"`, `"failed"`, `"cancelled"`\]\>

Terminal disposition category for accepted steering.

## References

<a id="executionresult"></a>

### ExecutionResult

Re-exports [ExecutionResult](./ExecutionState#executionresult-1)

***

<a id="executionresultschema"></a>

### ExecutionResultSchema

Renames and re-exports [ExecutionResult](./Run#executionresult-1)
