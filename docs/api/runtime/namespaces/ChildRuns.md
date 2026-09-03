[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ChildRuns

# ChildRuns

## Classes

<a id="childruns"></a>

### ChildRuns

Runtime-owned child execution service.

#### Extends

- `ChildRuns_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ChildRuns**(`_`): [`ChildRuns`](#childruns)

###### Parameters

###### \_

`never`

###### Returns

[`ChildRuns`](#childruns)

###### Inherited from

`ChildRuns_base.constructor`

## Interfaces

<a id="authority"></a>

### Authority

Exact declared child authority used to constrain model-visible selections.

#### Properties

<a id="children"></a>

##### children

> `readonly` **children**: readonly `object`[]

***

<a id="fanoutgroupinput"></a>

### FanOutGroupInput

Internal typed child-group admission used by AgentTool.fanOut.

#### Properties

<a id="budgetdivisor"></a>

##### budgetDivisor?

> `readonly` `optional` **budgetDivisor?**: `number`

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

<a id="join"></a>

##### join

> `readonly` **join**: \{ \} \| \{ \} \| \{ \} \| \{ `required`: `number`; \} \| \{ \}

<a id="members"></a>

##### members

> `readonly` **members**: readonly `object`[]

<a id="operationkey"></a>

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

<a id="parentrunid"></a>

##### parentRunId

> `readonly` **parentRunId**: `string`

<a id="remainder"></a>

##### remainder

> `readonly` **remainder**: `"await"` \| `"abandon"` \| `"request-cancel"` \| `"terminate"`

<a id="tasks"></a>

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

<a id="toolcallid"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="service"></a>

### Service

Runtime-owned child execution operations used by the model-facing routes.

#### Properties

<a id="awaitgroup"></a>

##### awaitGroup

> `readonly` **awaitGroup**: (`input`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

###### Parameters

###### input

[`AwaitGroupInput`](#awaitgroupinput)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

<a id="fanout"></a>

##### fanOut

> `readonly` **fanOut**: (`input`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

###### Parameters

###### input

[`FanOutGroupInput`](#fanoutgroupinput)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`input`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

<a id="rungroup"></a>

##### runGroup

> `readonly` **runGroup**: (`input`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

###### Parameters

###### input

[`StartGroupInput`](#startgroupinput)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

<a id="startgroup"></a>

##### startGroup

> `readonly` **startGroup**: (`input`) => `Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

###### Parameters

###### input

[`StartGroupInput`](#startgroupinput)

###### Returns

`Effect`\<[`Outcome`](../../generalist/namespaces/ToolExecutor#outcome), `ChildHookError`\>

<a id="transformresolved"></a>

##### transformResolved?

> `readonly` `optional` **transformResolved?**: (`request`, `outcome`) => `Effect`\<[`SettledOutcome`](../../generalist/namespaces/ToolExecutor#settledoutcome), `ChildHookError`\>

###### Parameters

###### request

[`Request`](../../generalist/namespaces/ToolExecutor#request)

###### outcome

[`SettledOutcome`](../../generalist/namespaces/ToolExecutor#settledoutcome)

###### Returns

`Effect`\<[`SettledOutcome`](../../generalist/namespaces/ToolExecutor#settledoutcome), `ChildHookError`\>

## Type Aliases

<a id="awaitgroupinput"></a>

### AwaitGroupInput

> **AwaitGroupInput** = [`AwaitGroupParameters`](#awaitgroupparameters) & `object`

Input for one durable child-group join.

#### Type Declaration

##### parentRunId

> `readonly` **parentRunId**: `string`

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="awaitgroupparameters"></a>

### AwaitGroupParameters

> **AwaitGroupParameters** = *typeof* `AwaitGroupParameters.Type`

Parameters for durably joining one previously admitted child group.

***

<a id="failure"></a>

### Failure

> **Failure** = *typeof* `Failure.Type`

Typed policy failures preserved through model-facing child tools.

***

<a id="groupchildreceipt"></a>

### GroupChildReceipt

> **GroupChildReceipt** = *typeof* `GroupChildReceipt.Type`

Stable receipt for one member of an admitted child group.

***

<a id="groupchildresult"></a>

### GroupChildResult

> **GroupChildResult** = *typeof* `GroupChildResult.Type`

Ordered terminal or remainder state for one child group member.

***

<a id="groupreceipt"></a>

### GroupReceipt

> **GroupReceipt** = *typeof* `GroupReceipt.Type`

Stable receipt returned without waiting for a child group.

***

<a id="groupresult"></a>

### GroupResult

> **GroupResult** = *typeof* `GroupResult.Type`

Ordered durable join result for one child group.

***

<a id="input"></a>

### Input

> **Input** = *typeof* `Parameters.Type` & `object`

Input for one blocking child invocation.

#### Type Declaration

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

##### parentRunId

> `readonly` **parentRunId**: `string`

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="startgroupinput"></a>

### StartGroupInput

> **StartGroupInput** = [`StartGroupParameters`](#startgroupparameters) & `object`

Input for one non-blocking bounded child-group admission.

#### Type Declaration

##### operationKey?

> `readonly` `optional` **operationKey?**: `string`

##### parentRunId

> `readonly` **parentRunId**: `string`

##### toolCallId

> `readonly` **toolCallId**: `string`

***

<a id="startgroupparameters"></a>

### StartGroupParameters

> **StartGroupParameters** = *typeof* `StartGroupParameters.Type`

Parameters for atomically starting one bounded child group.

## Variables

<a id="awaitgroupparameters-1"></a>

### AwaitGroupParameters

> `const` **AwaitGroupParameters**: `Schema.Struct`\<\{ `groupId`: `Schema.String`; \}\>

Parameters for durably joining one previously admitted child group.

***

<a id="awaitgrouptool"></a>

### awaitGroupTool

> `const` **awaitGroupTool**: `Tool.Tool`\<`"await_child_group"`, \{ `failure`: `Schema.Union`\<readonly \[*typeof* [`ChildDepthExceeded`](./Errors#childdepthexceeded), *typeof* [`ChildLimitExceeded`](./Errors#childlimitexceeded), `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>\]\>; `failureMode`: `"error"`; `parameters`: `Schema.Struct`\<\{ `groupId`: `Schema.String`; \}\>; `success`: `Schema.Struct`\<\{ `children`: `Schema.$Array`\<`Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `message`: `Schema.optionalKey`\<`Schema.String`\>; `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `text`: `Schema.optionalKey`\<`Schema.String`\>; `turns`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `groupId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>; \}, `never`\>

Durable join tool for a previously admitted child group.

***

<a id="awaitgrouptoolname"></a>

### awaitGroupToolName

> `const` **awaitGroupToolName**: `"await_child_group"` = `"await_child_group"`

Name of the durable child-group join tool.

***

<a id="executor"></a>

### Executor

> `const` **Executor**: `object`

Tool executor that owns Runtime child routes.

#### Type Declaration

<a id="make"></a>

##### make

> **make**: *typeof* `makeExecutor`

***

<a id="failure-1"></a>

### Failure

> `const` **Failure**: `Schema.Union`\<readonly \[*typeof* [`ChildDepthExceeded`](./Errors#childdepthexceeded), *typeof* [`ChildLimitExceeded`](./Errors#childlimitexceeded), `Schema.Struct`\<\{ `message`: `Schema.String`; \}\>\]\>

Typed policy failures preserved through model-facing child tools.

***

<a id="groupchildreceipt-1"></a>

### GroupChildReceipt

> `const` **GroupChildReceipt**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `selection`: `Schema.String`; \}\>

Stable receipt for one member of an admitted child group.

***

<a id="groupchildresult-1"></a>

### GroupChildResult

> `const` **GroupChildResult**: `Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `message`: `Schema.optionalKey`\<`Schema.String`\>; `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `text`: `Schema.optionalKey`\<`Schema.String`\>; `turns`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>

Ordered terminal or remainder state for one child group member.

***

<a id="groupidfromsuspension"></a>

### groupIdFromSuspension

> `const` **groupIdFromSuspension**: \<`Suspension`\>(`suspension`) => `string` \| `undefined`

Return the owned group named by an await-child-group suspension, if any.

#### Type Parameters

##### Suspension

`Suspension`

#### Parameters

##### suspension

`Suspension`

#### Returns

`string` \| `undefined`

***

<a id="groupreceipt-1"></a>

### GroupReceipt

> `const` **GroupReceipt**: `Schema.Struct`\<\{ `children`: `Schema.$Array`\<`Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `selection`: `Schema.String`; \}\>\>; `groupId`: `Schema.String`; \}\>

Stable receipt returned without waiting for a child group.

***

<a id="groupresult-1"></a>

### GroupResult

> `const` **GroupResult**: `Schema.Struct`\<\{ `children`: `Schema.$Array`\<`Schema.Struct`\<\{ `childRunId`: `Schema.String`; `depth`: `Schema.Int`; `error`: `Schema.optionalKey`\<`Schema.Unknown`\>; `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `message`: `Schema.optionalKey`\<`Schema.String`\>; `output`: `Schema.optionalKey`\<`Schema.Unknown`\>; `readiness`: `Schema.Literals`\<readonly \[`"queued"`, `"ready"`, `"settled"`\]\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; `selection`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"pending"`, `"running"`, `"succeeded"`, `"failed"`, `"cancelled"`, `"abandoned"`\]\>; `text`: `Schema.optionalKey`\<`Schema.String`\>; `turns`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `groupId`: `Schema.String`; `status`: `Schema.Literals`\<readonly \[`"running"`, `"succeeded"`, `"failed"`, `"cancelled"`\]\>; \}\>

Ordered durable join result for one child group.

***

<a id="groupwaitsfromsuspension"></a>

### groupWaitsFromSuspension

> `const` **groupWaitsFromSuspension**: \<`Suspension`\>(`suspension`) => `ReadonlyArray`\<\{ `groupId`: `string`; `waitId`: `string`; \}\>

Every exact aggregate wait that owns one child group, in authored order.

#### Type Parameters

##### Suspension

`Suspension`

#### Parameters

##### suspension

`Suspension`

#### Returns

`ReadonlyArray`\<\{ `groupId`: `string`; `waitId`: `string`; \}\>

***

<a id="make-1"></a>

### make

> `const` **make**: (`store`) => [`Service`](#service)

Construct Runtime-owned child execution operations over one RunStore.

#### Parameters

##### store

[`Service`](./RunStore#service)

#### Returns

[`Service`](#service)

***

<a id="ownschildsuspension"></a>

### ownsChildSuspension

> `const` **ownsChildSuspension**: (`input`) => `boolean`

Whether persisted child metadata and suspension authorize one direct blocking handoff.

#### Parameters

##### input

###### childRunId

`string`

###### metadata

`SerializedMetadata`

###### parentRunId

`string`

###### suspension

`unknown`

###### waitId

`string`

#### Returns

`boolean`

***

<a id="parameters"></a>

### Parameters

> `const` **Parameters**: `Schema.Struct`\<\{ `label`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.String`; `selection`: `Schema.Codec`\<`string`, `string`, `never`, `never`\>; \}\>

Parameters for one dependent child Run.

***

<a id="result"></a>

### Result

> `const` **Result**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Succeeded"`, \{ `childRunId`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `text`: `Schema.String`; `turns`: `Schema.Int`; \}\>, `Schema.TaggedStruct`\<`"Failed"`, \{ `childRunId`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `message`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Cancelled"`, \{ `childRunId`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>

Result of one dependent child Run.

***

<a id="resultfromchildevent"></a>

### resultFromChildEvent

> `const` **resultFromChildEvent**: (`input`) => `unknown`

Project one canonical child terminal event into its blocking parent handoff.

#### Parameters

##### input

###### childRunId

`string`

###### event

`ChildTerminalEvent`

###### metadata

`SerializedMetadata`

#### Returns

`unknown`

***

<a id="resultfrominspection"></a>

### resultFromInspection

> `const` **resultFromInspection**: (`inspection`) => [`GroupResult`](#groupresult)

Project one persisted fan-out inspection into the model-facing ordered child-group result.

#### Parameters

##### inspection

[`FanOutInspection`](./FanOut#fanoutinspection)

#### Returns

[`GroupResult`](#groupresult)

***

<a id="route"></a>

### route

> `const` **route**: [`Route`](../../generalist/namespaces/ToolPlacement#route)\<[`ChildRuns`](#childruns) \| [`ToolContext`](../../generalist/namespaces/ToolContext#toolcontext)\>

Route for the blocking and grouped child tools.

***

<a id="rungrouptool"></a>

### runGroupTool

> `const` **runGroupTool**: `Tool.Any`

Blocking tool for one exact all-settled child group.

***

<a id="rungrouptoolname"></a>

### runGroupToolName

> `const` **runGroupToolName**: `"run_child_group"` = `"run_child_group"`

Name of the blocking atomic child-group tool.

***

<a id="startgroupparameters-1"></a>

### StartGroupParameters

> `const` **StartGroupParameters**: `Schema.Struct`\<\{ `concurrency`: `Schema.optionalKey`\<`Schema.Int`\>; `members`: `Schema.$Array`\<`Schema.Struct`\<\{ `key`: `Schema.String`; `label`: `Schema.optionalKey`\<`Schema.String`\>; `prompt`: `Schema.String`; `selection`: `Schema.Codec`\<`string`, `string`, `never`, `never`\>; \}\>\>; \}\>

Parameters for atomically starting one bounded child group.

***

<a id="startgrouptool"></a>

### startGroupTool

> `const` **startGroupTool**: `Tool.Any`

Non-blocking tool for bounded independent child work.

***

<a id="startgrouptoolname"></a>

### startGroupToolName

> `const` **startGroupToolName**: `"start_child_group"` = `"start_child_group"`

Name of the non-blocking child-group admission tool.

***

<a id="tool"></a>

### tool

> `const` **tool**: `Tool.Any`

Blocking tool for dependent singleton child work.

***

<a id="toolname"></a>

### toolName

> `const` **toolName**: `"run_child"` = `"run_child"`

Name of the blocking dependent-child tool.

***

<a id="tools"></a>

### Tools

> `const` **Tools**: `object`

Runtime-owned child-group tool declarations.

#### Type Declaration

<a id="make-2"></a>

##### make

> **make**: *typeof* `makeTools`

***

<a id="waitidforchild"></a>

### waitIdForChild

> `const` **waitIdForChild**: (`input`) => `string` \| `undefined`

Return the exact aggregate wait owned by one direct child.

#### Parameters

##### input

###### childRunId

`string`

###### metadata

`SerializedMetadata`

###### parentRunId

`string`

###### suspension

`unknown`

#### Returns

`string` \| `undefined`

***

<a id="waitidforgroup"></a>

### waitIdForGroup

> `const` **waitIdForGroup**: \{(`groupId`): \<`Suspension`\>(`suspension`) => `string` \| `undefined`; \<`Suspension`\>(`suspension`, `groupId`): `string` \| `undefined`; \}

Return the exact wait that owns one child group in an aggregate Agent suspension.

#### Call Signature

> (`groupId`): \<`Suspension`\>(`suspension`) => `string` \| `undefined`

##### Parameters

###### groupId

`string`

##### Returns

\<`Suspension`\>(`suspension`) => `string` \| `undefined`

#### Call Signature

> \<`Suspension`\>(`suspension`, `groupId`): `string` \| `undefined`

##### Type Parameters

###### Suspension

`Suspension`

##### Parameters

###### suspension

`Suspension`

###### groupId

`string`

##### Returns

`string` \| `undefined`
