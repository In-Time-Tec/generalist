[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolExecutor

# ToolExecutor

## Classes

<a id="cancellationfailure"></a>

### CancellationFailure

A concrete executor could not definitively cancel one admitted operation.

#### Extends

- `CancellationFailure_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CancellationFailure_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`CancellationFailure_base.message`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`CancellationFailure_base.tool`

***

<a id="frameworkfailure"></a>

### FrameworkFailure

#### Extends

- `FrameworkFailure_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`FrameworkFailure_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`FrameworkFailure_base.message`

<a id="stage"></a>

##### stage

> `readonly` **stage**: `"route"` \| `"authorization"` \| `"decode-input"` \| `"handler"` \| `"encode-success"` \| `"encode-domain-failure"` \| `"missing-handler"` \| `"placement"`

###### Inherited from

`FrameworkFailure_base.stage`

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `string`

###### Inherited from

`FrameworkFailure_base.tool`

***

<a id="remoteretrymisconfigured"></a>

### RemoteRetryMisconfigured

#### Extends

- `RemoteRetryMisconfigured_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RemoteRetryMisconfigured_base.hint`

<a id="message-2"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`RemoteRetryMisconfigured_base.message`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"invalid-max-retries"` \| `"missing-operation-key"` \| `"changed-operation-key"`

###### Inherited from

`RemoteRetryMisconfigured_base.reason`

***

<a id="toolexecutor"></a>

### ToolExecutor

#### Extends

- `ToolExecutor_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="cancellationrequest"></a>

### CancellationRequest

Stable identity for semantic cancellation of one admitted tool operation.

#### Properties

<a id="attempt"></a>

##### attempt

> `readonly` **attempt**: `number`

<a id="execution"></a>

##### execution

> `readonly` **execution**: [`Request`](#request)

<a id="operationkey"></a>

##### operationKey

> `readonly` **operationKey**: `string`

<a id="rootrunid"></a>

##### rootRunId

> `readonly` **rootRunId**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="toolcallid"></a>

##### toolCallId

> `readonly` **toolCallId**: `string`

<a id="toolname"></a>

##### toolName

> `readonly` **toolName**: `string`

***

<a id="closedtoolset"></a>

### ClosedToolSet

#### Type Parameters

##### R

`R` = `unknown`

##### T

`T` *extends* `SchemaTool` = `SchemaTool`

#### Properties

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`name`, `params`) => `Effect`\<`unknown`, `unknown`, `R`\>

###### Parameters

###### name

`string`

###### params

`unknown`

###### Returns

`Effect`\<`unknown`, `unknown`, `R`\>

<a id="tools"></a>

##### tools

> `readonly` **tools**: `Readonly`\<`Record`\<`string`, `T`\>\>

***

<a id="domainfailure"></a>

### DomainFailure

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"DomainFailure"`

<a id="encodedfailure"></a>

##### encodedFailure

> `readonly` **encodedFailure**: `unknown`

<a id="failure"></a>

##### failure

> `readonly` **failure**: `unknown`

<a id="taint"></a>

##### taint?

> `readonly` `optional` **taint?**: readonly `object`[]

***

<a id="request"></a>

### Request

#### Extended by

- [`PlacementRequest`](./ToolPlacement#placementrequest)

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="tasks"></a>

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

<a id="toolcallbatch"></a>

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

<a id="toolcallindex"></a>

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="service"></a>

### Service

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

<a id="cancel"></a>

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](#cancellationoutcome), [`CancellationFailure`](#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](#cancellationoutcome), [`CancellationFailure`](#cancellationfailure), `R`\>

<a id="cancellable"></a>

##### cancellable?

> `readonly` `optional` **cancellable?**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](#request)

###### Returns

`boolean`

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure) \| [`RemoteRetryMisconfigured`](#remoteretrymisconfigured), `R`\>

<a id="replaypolicy"></a>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](#replaypolicy-1)

###### Parameters

###### request

[`Request`](#request)

###### Returns

[`ReplayPolicy`](#replaypolicy-1)

<a id="transformresolved"></a>

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

<a id="success"></a>

### Success

#### Extended by

- [`BoundedSuccess`](./ToolOutput#boundedsuccess)

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Success"`

<a id="encodedresult"></a>

##### encodedResult

> `readonly` **encodedResult**: `unknown`

<a id="memoized"></a>

##### memoized?

> `readonly` `optional` **memoized?**: `object`

###### fromOperation

> `readonly` **fromOperation**: `string`

###### fromRun

> `readonly` **fromRun**: `string`

<a id="result"></a>

##### result

> `readonly` **result**: `unknown`

<a id="taint-1"></a>

##### taint?

> `readonly` `optional` **taint?**: readonly `object`[]

***

<a id="suspend"></a>

### Suspend

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Suspend"`

<a id="awaitevent"></a>

##### awaitEvent?

> `readonly` `optional` **awaitEvent?**: `object`

###### deadline

> `readonly` **deadline**: `string`

###### filter

> `readonly` **filter**: \{ `scheduleId?`: `string`; \} \| \{ `source?`: `string`; \} \| \{ `childRunId?`: `string`; \} \| \{ `kind?`: `"create"` \| `"remove"` \| `"update"`; `path?`: `string`; \} \| \{ `approvalId?`: `string`; \}

<a id="token"></a>

##### token

> `readonly` **token**: `string`

## Type Aliases

<a id="cancellationoutcome"></a>

### CancellationOutcome

> **CancellationOutcome** = \{ `_tag`: `"Cancelled"`; \} \| \{ `_tag`: `"AlreadyTerminal"`; `outcome`: [`TerminalOutcome`](#terminaloutcome); \}

A definitive executor/provider acknowledgement of semantic cancellation.

***

<a id="frameworkstage"></a>

### FrameworkStage

> **FrameworkStage** = *typeof* `FrameworkStage.Type`

***

<a id="outcome"></a>

### Outcome

> **Outcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure) \| [`Suspend`](#suspend)

Durable tool execution outcome.

***

<a id="replaypolicy-1"></a>

### ReplayPolicy

> **ReplayPolicy** = `"never"` \| `"provider-idempotent"`

***

<a id="settledoutcome"></a>

### SettledOutcome

> **SettledOutcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure)

***

<a id="terminaloutcome"></a>

### TerminalOutcome

> **TerminalOutcome** = [`Success`](#success) \| [`DomainFailure`](#domainfailure)

A completed tool outcome reported while cancelling an exact durable operation.

***

<a id="toolkitinput"></a>

### ToolkitInput

> **ToolkitInput**\<`Tools`\> = `Toolkit.Toolkit`\<`Tools`\> \| `Toolkit.WithHandler`\<`Tools`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

## Variables

<a id="client"></a>

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

<a id="executetoolkit"></a>

### executeToolkit

> `const` **executeToolkit**: *typeof* `executeToolkitUncurried` & \{\<`R`, `T`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), [`ToolContext`](./ToolContext#toolcontext) \| `R` \| `ToolSchemaServices`\<`T`\>\>; \<`Name`, `Parameters`, `SuccessSchema`, `R`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](#frameworkfailure), [`ToolContext`](./ToolContext#toolcontext) \| `R` \| `AgentToolSchemaServices`\<`Parameters`, `SuccessSchema`\>\>; \<`Tools`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), `HandlerServices`\<`Tools`\[keyof `Tools`\]\>\>; \<`Tools`\>(`request`): (`toolkit`) => `Effect`\<[`Outcome`](#outcome), [`FrameworkFailure`](#frameworkfailure), `HandlersFor`\<`Tools`\> \| `HandlerServices`\<`Tools`\[keyof `Tools`\]\>\>; \}

***

<a id="frameworkstage-1"></a>

### FrameworkStage

> `const` **FrameworkStage**: `Schema.Literals`\<readonly \[`"decode-input"`, `"handler"`, `"encode-success"`, `"encode-domain-failure"`, `"missing-handler"`, `"route"`, `"placement"`, `"authorization"`\]\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`ToolExecutor`](#toolexecutor)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`ToolExecutor`](#toolexecutor)\>

***

<a id="mcp"></a>

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

<a id="outcome-1"></a>

### Outcome

> `const` **Outcome**: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Success"`\>; `encodedResult`: `Schema.Unknown`; `memoized`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `fromOperation`: `Schema.String`; `fromRun`: `Schema.String`; \}\>\>; `outputPaths`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.String`\>\>; `result`: `Schema.Unknown`; `taint`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Struct`\<\{ `capabilityId`: `Schema.brand`\<`Schema.String`, `"generalist/capability/CapabilityId"`\>; `tool`: `Schema.String`; `toolCallId`: `Schema.String`; \}\>\>\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"DomainFailure"`\>; `encodedFailure`: `Schema.Unknown`; `failure`: `Schema.Unknown`; `taint`: `Schema.optionalKey`\<`Schema.$Array`\<`Schema.Struct`\<\{ `capabilityId`: `Schema.brand`\<`Schema.String`, `"generalist/capability/CapabilityId"`\>; `tool`: `Schema.String`; `toolCallId`: `Schema.String`; \}\>\>\>; \}\>, `Schema.Struct`\<\{ `_tag`: `Schema.tag`\<`"Suspend"`\>; `awaitEvent`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[..., ..., ..., ..., ...\]\>; \}\>\>; `token`: `Schema.String`; \}\>\]\>

Durable tool execution outcome.

***

<a id="remote"></a>

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

<a id="sandbox"></a>

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

<a id="layerrouter"></a>

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

<a id="layertoolkit"></a>

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

<a id="route"></a>

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

<a id="routetoolkit"></a>

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
