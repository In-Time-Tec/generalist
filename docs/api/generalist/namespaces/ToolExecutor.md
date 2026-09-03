[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolExecutor

# ToolExecutor

## Classes

### CancellationFailure

A concrete executor could not definitively cancel one admitted operation.

#### Extends

- `CancellationFailure_base`

#### Constructors

##### Constructor

> **new CancellationFailure**(...`args`): [`CancellationFailure`](#cancellationfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CancellationFailure`](#cancellationfailure)

###### Inherited from

`CancellationFailure_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CancellationFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`CancellationFailure_base.message`

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`CancellationFailure_base.tool`

***

### FrameworkFailure

#### Extends

- `FrameworkFailure_base`

#### Constructors

##### Constructor

> **new FrameworkFailure**(...`args`): [`FrameworkFailure`](#frameworkfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`FrameworkFailure`](#frameworkfailure)

###### Inherited from

`FrameworkFailure_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FrameworkFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`FrameworkFailure_base.message`

##### stage

> `readonly` **stage**: `"route"` \| `"authorization"` \| `"decode-input"` \| `"handler"` \| `"encode-success"` \| `"encode-domain-failure"` \| `"missing-handler"` \| `"placement"`

###### Inherited from

`FrameworkFailure_base.stage`

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`FrameworkFailure_base.tool`

***

### RemoteRetryMisconfigured

#### Extends

- `RemoteRetryMisconfigured_base`

#### Constructors

##### Constructor

> **new RemoteRetryMisconfigured**(...`args`): [`RemoteRetryMisconfigured`](#remoteretrymisconfigured)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RemoteRetryMisconfigured`](#remoteretrymisconfigured)

###### Inherited from

`RemoteRetryMisconfigured_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RemoteRetryMisconfigured_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`RemoteRetryMisconfigured_base.message`

##### reason

> `readonly` **reason**: `"invalid-max-retries"` \| `"missing-operation-key"` \| `"changed-operation-key"`

###### Inherited from

`RemoteRetryMisconfigured_base.reason`

***

### ToolExecutor

#### Extends

- `ToolExecutor_base`

#### Constructors

##### Constructor

> **new ToolExecutor**(`_`): [`ToolExecutor`](#toolexecutor)

###### Parameters

###### \_

`never`

###### Returns

[`ToolExecutor`](#toolexecutor)

###### Inherited from

`ToolExecutor_base.constructor`

## Interfaces

### CancellationRequest

Stable identity for semantic cancellation of one admitted tool operation.

#### Properties

##### attempt

> `readonly` **attempt**: `number`

##### execution

> `readonly` **execution**: [`Request`](#request)

##### operationKey

> `readonly` **operationKey**: `string`

##### rootRunId

> `readonly` **rootRunId**: `string`

##### runId

> `readonly` **runId**: `string`

##### sessionId

> `readonly` **sessionId**: `string`

##### toolCallId

> `readonly` **toolCallId**: `string`

##### toolName

> `readonly` **toolName**: `string`

***

### ClosedToolSet

#### Type Parameters

##### R

`R` = `unknown`

##### T

`T` *extends* `SchemaTool` = `SchemaTool`

#### Properties

##### invoke

> `readonly` **invoke**: (`name`, `params`) => `Effect`\<`unknown`, `unknown`, `R`\>

###### Parameters

###### name

`string`

###### params

`unknown`

###### Returns

`Effect`\<`unknown`, `unknown`, `R`\>

##### tools

> `readonly` **tools**: `Readonly`\<`Record`\<`string`, `T`\>\>

***

### DomainFailure

#### Properties

##### \_tag

> `readonly` **\_tag**: `"DomainFailure"`

##### encodedFailure

> `readonly` **encodedFailure**: `unknown`

##### failure

> `readonly` **failure**: `unknown`

***

### Request

#### Extended by

- [`PlacementRequest`](./ToolPlacement#placementrequest)

#### Properties

##### agentName

> `readonly` **agentName**: `string`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### sessionId

> `readonly` **sessionId**: `string`

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

##### turn

> `readonly` **turn**: `number`

***

### Service

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](#cancellationoutcome), [`CancellationFailure`](#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](#cancellationoutcome), [`CancellationFailure`](#cancellationfailure), `R`\>

##### cancellable?

> `readonly` `optional` **cancellable?**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](#request)

###### Returns

`boolean`

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](#replaypolicy-1)

###### Parameters

###### request

[`Request`](#request)

###### Returns

[`ReplayPolicy`](#replaypolicy-1)

##### transformResolved?

> `readonly` `optional` **transformResolved?**: (`request`, `outcome`) => `Effect`\<[`SettledOutcome`](#settledoutcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](#request)

###### outcome

[`SettledOutcome`](#settledoutcome)

###### Returns

`Effect`\<[`SettledOutcome`](#settledoutcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

***

### Success

#### Extended by

- [`BoundedSuccess`](./ToolOutput#boundedsuccess)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Success"`

##### encodedResult

> `readonly` **encodedResult**: `unknown`

##### memoized?

> `readonly` `optional` **memoized?**: `object`

###### fromOperation

> `readonly` **fromOperation**: `string`

###### fromRun

> `readonly` **fromRun**: `string`

##### result

> `readonly` **result**: `unknown`

***

### Suspend

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Suspend"`

##### awaitEvent?

> `readonly` `optional` **awaitEvent?**: `object`

###### deadline

> `readonly` **deadline**: `string`

###### filter

> `readonly` **filter**: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}

##### token

> `readonly` **token**: `string`

## Type Aliases

### CancellationOutcome

> **CancellationOutcome** = \{ `_tag`: `"Cancelled"`; \} \| \{ `_tag`: `"AlreadyTerminal"`; `outcome`: [`TerminalOutcome`](#terminaloutcome); \}

A definitive executor/provider acknowledgement of semantic cancellation.

***

### FrameworkStage

> **FrameworkStage** = *typeof* `FrameworkStage.Type`

***

### Outcome

> **Outcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure) \| [`Suspend`](#suspend)

Durable tool execution outcome.

***

### ReplayPolicy

> **ReplayPolicy** = `"never"` \| `"provider-idempotent"`

***

### SettledOutcome

> **SettledOutcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure)

***

### TerminalOutcome

> **TerminalOutcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure)

A completed tool outcome reported while cancelling an exact durable operation.

***

### ToolkitInput

> **ToolkitInput**\<`Tools`\> = `Toolkit.Toolkit`\<`Tools`\> \| `Toolkit.WithHandler`\<`Tools`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

## Variables

### client

> `const` **client**: \<`Tools`, `E`\>(`options`) => [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

Route tool calls to a user/browser/desktop client.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](#frameworkfailure)

#### Parameters

##### options

[`PlacementRouteOptions`](./ToolPlacement#placementrouteoptions)\<`Tools`, `E`\>

#### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

***

### executeToolkit

> `const` **executeToolkit**: *typeof* `executeToolkitUncurried` & \{\<`R`, `T`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), [`ToolContext`](./ToolContext#toolcontext) \| `R` \| `ToolSchemaServices`\<`T`\>\>; \<`Name`, `Parameters`, `SuccessSchema`, `R`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure), [`ToolContext`](./ToolContext#toolcontext) \| `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>; \<`Tools`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), `HandlerServices`\<`Tools`\[keyof `Tools`\]\>\>; \<`Tools`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), `HandlersFor`\<`Tools`\> \| `HandlerServices`\<`Tools`\[keyof `Tools`\]\>\>; \}

***

### FrameworkStage

> `const` **FrameworkStage**: `Schema.Literals`\<readonly \[`"decode-input"`, `"handler"`, `"encode-success"`, `"encode-domain-failure"`, `"missing-handler"`, `"route"`, `"placement"`, `"authorization"`\]\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ToolExecutor`](#toolexecutor)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ToolExecutor`](#toolexecutor)\>

***

### mcp

> `const` **mcp**: \<`Tools`, `E`\>(`options`) => [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

Route tool calls to an MCP placement adapter.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](#frameworkfailure)

#### Parameters

##### options

[`PlacementRouteOptions`](./ToolPlacement#placementrouteoptions)\<`Tools`, `E`\>

#### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

***

### Outcome

> `const` **Outcome**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Success"`\>; `encodedResult`: `Schema.Unknown`; `memoized`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `fromOperation`: `Schema.String`; `fromRun`: `Schema.String`; \}\>\>; `outputPaths`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.String`\>\>; `result`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"DomainFailure"`\>; `encodedFailure`: `Schema.Unknown`; `failure`: `Schema.Unknown`; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Suspend"`\>; `awaitEvent`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>\>; `token`: `Schema.String`; \}\>\]\>

Durable tool execution outcome.

***

### remote

> `const` **remote**: \<`Tools`, `E`\>(`options`) => [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

Route tool calls to a remote tool worker or service.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](#frameworkfailure)

#### Parameters

##### options

[`RemoteRouteOptions`](./ToolPlacement#remoterouteoptions)\<`Tools`, `E`\>

#### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

***

### sandbox

> `const` **sandbox**: \<`Tools`, `E`\>(`options`) => [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

Route tool calls to a workspace or sandbox runtime.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](#frameworkfailure)

#### Parameters

##### options

[`PlacementRouteOptions`](./ToolPlacement#placementrouteoptions)\<`Tools`, `E`\>

#### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

## Functions

### layerRouter()

#### Call Signature

> **layerRouter**(`routes`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext)\>

##### Parameters

###### routes

`Iterable`\<[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext)\>

#### Call Signature

> **layerRouter**\<`R`\>(`routes`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

##### Type Parameters

###### R

`R`

##### Parameters

###### routes

`Iterable`\<[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\> \| `Effect`\<[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>, `never`, `R`\>\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

#### Call Signature

> **layerRouter**\<`R`\>(`routes`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

##### Type Parameters

###### R

`R`

##### Parameters

###### routes

`Iterable`\<[`RouteInput`](./ToolPlacement#routeinput)\<[`ToolContext`](./ToolContext#toolcontext)\> \| [`RouteInput`](./ToolPlacement#routeinput)\<`R`\>\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, [`ToolContext`](./ToolContext#toolcontext) \| `R`\>

#### Call Signature

> **layerRouter**\<`R1`, `R2`\>(`routes`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R1` \| `R2`\>

##### Type Parameters

###### R1

`R1`

###### R2

`R2`

##### Parameters

###### routes

`Iterable`\<[`RouteInput`](./ToolPlacement#routeinput)\<`R1`\> \| [`RouteInput`](./ToolPlacement#routeinput)\<`R2`\>\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R1` \| `R2`\>

#### Call Signature

> **layerRouter**\<`R`\>(`routes`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R`\>

##### Type Parameters

###### R

`R`

##### Parameters

###### routes

`Iterable`\<[`RouteInput`](./ToolPlacement#routeinput)\<`R`\>\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R`\>

***

### layerToolkit()

#### Call Signature

> **layerToolkit**\<`Name`, `Parameters`, `SuccessSchema`, `R`\>(`toolkit`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>

##### Type Parameters

###### Name

`Name` *extends* `string`

###### Parameters

`Parameters` *extends* `Top`

###### SuccessSchema

`SuccessSchema` *extends* `Top`

###### R

`R`

##### Parameters

###### toolkit

[`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`Name`, `Parameters`, `SuccessSchema`, `R`\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>

#### Call Signature

> **layerToolkit**\<`R`\>(`toolkit`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R`\>

##### Type Parameters

###### R

`R`

##### Parameters

###### toolkit

[`ClosedToolSet`](#closedtoolset)\<`R`, `Any`\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R`\>

#### Call Signature

> **layerToolkit**\<`R`, `T`\>(`toolkit`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R` \| `ToolSchemaServices`\<`T`\>\>

##### Type Parameters

###### R

`R`

###### T

`T` *extends* `SchemaTool`

##### Parameters

###### toolkit

[`ClosedToolSet`](#closedtoolset)\<`R`, `T`\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `R` \| `ToolSchemaServices`\<`T`\>\>

#### Call Signature

> **layerToolkit**\<`Tools`\>(`toolkit`): `Layer`\<[`ToolExecutor`](#toolexecutor)\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

##### Parameters

###### toolkit

`WithHandler`\<`Tools`\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor)\>

#### Call Signature

> **layerToolkit**\<`Tools`\>(`toolkit`): `Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `HandlersFor`\<`Tools`\>\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

##### Parameters

###### toolkit

`Toolkit`\<`Tools`\>

##### Returns

`Layer`\<[`ToolExecutor`](#toolexecutor), `never`, `HandlersFor`\<`Tools`\>\>

***

### route()

#### Call Signature

> **route**(`options`): [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>

##### Parameters

###### options

[`RouteOptions`](./ToolPlacement#routeoptions)\<[`ToolContext`](./ToolContext#toolcontext)\>

##### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>

#### Call Signature

> **route**\<`R`\>(`options`): [`Route`](./ToolPlacement#route)\<`R`\>

##### Type Parameters

###### R

`R`

##### Parameters

###### options

[`RouteOptions`](./ToolPlacement#routeoptions)\<`R`\>

##### Returns

[`Route`](./ToolPlacement#route)\<`R`\>

***

### routeToolkit()

#### Call Signature

> **routeToolkit**\<`Name`, `Parameters`, `SuccessSchema`, `R`\>(`toolkit`): [`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>

##### Type Parameters

###### Name

`Name` *extends* `string`

###### Parameters

`Parameters` *extends* `Top`

###### SuccessSchema

`SuccessSchema` *extends* `Top`

###### R

`R`

##### Parameters

###### toolkit

[`AgentToolToolkit`](./AgentTool#agenttooltoolkit)\<`Name`, `Parameters`, `SuccessSchema`, `R`\>

##### Returns

[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext) \| `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>

#### Call Signature

> **routeToolkit**\<`R`, `T`\>(`toolkit`): [`RouteInput`](./ToolPlacement#routeinput)\<[`ToolContext`](./ToolContext#toolcontext) \| `R` \| `ToolSchemaServices`\<`T`\>\>

##### Type Parameters

###### R

`R`

###### T

`T` *extends* `SchemaTool`

##### Parameters

###### toolkit

[`ClosedToolSet`](#closedtoolset)\<`R`, `T`\>

##### Returns

[`RouteInput`](./ToolPlacement#routeinput)\<[`ToolContext`](./ToolContext#toolcontext) \| `R` \| `ToolSchemaServices`\<`T`\>\>

#### Call Signature

> **routeToolkit**\<`Tools`\>(`toolkit`): [`Route`](./ToolPlacement#route)

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

##### Parameters

###### toolkit

`WithHandler`\<`Tools`\>

##### Returns

[`Route`](./ToolPlacement#route)

#### Call Signature

> **routeToolkit**\<`Tools`\>(`toolkit`): `Effect`\<[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>, `never`, `HandlersFor`\<`Tools`\>\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

##### Parameters

###### toolkit

`Toolkit`\<`Tools`\>

##### Returns

`Effect`\<[`Route`](./ToolPlacement#route)\<[`ToolContext`](./ToolContext#toolcontext)\>, `never`, `HandlersFor`\<`Tools`\>\>
