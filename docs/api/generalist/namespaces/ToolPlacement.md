[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolPlacement

# ToolPlacement

## Interfaces

<a id="placementrequest"></a>

### PlacementRequest

#### Extends

- [`Request`](./ToolExecutor#request)

#### Extended by

- [`RemotePlacementRequest`](#remoteplacementrequest)

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`Request`](./ToolExecutor#request).[`agentName`](./ToolExecutor#agentname)

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`Request`](./ToolExecutor#request).[`call`](./ToolExecutor#call)

<a id="placement"></a>

##### placement

> `readonly` **placement**: [`Placement`](#placement-2)

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

[`Request`](./ToolExecutor#request).[`sessionId`](./ToolExecutor#sessionid-1)

<a id="tasks"></a>

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

###### Inherited from

[`Request`](./ToolExecutor#request).[`tasks`](./ToolExecutor#tasks)

<a id="tool"></a>

##### tool

> `readonly` **tool**: `Any`

<a id="toolcallbatch"></a>

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

###### Inherited from

[`Request`](./ToolExecutor#request).[`toolCallBatch`](./ToolExecutor#toolcallbatch)

<a id="toolcallindex"></a>

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

###### Inherited from

[`Request`](./ToolExecutor#request).[`toolCallIndex`](./ToolExecutor#toolcallindex)

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`Request`](./ToolExecutor#request).[`turn`](./ToolExecutor#turn)

***

<a id="placementrouteoptions"></a>

### PlacementRouteOptions

#### Extended by

- [`RemoteRouteNonIdempotentOptions`](#remoteroutenonidempotentoptions)

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

#### Properties

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

<a id="tools-1"></a>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

***

<a id="remoteplacementrequest"></a>

### RemotePlacementRequest

An idempotent remote placement request carrying its endpoint deduplication key.

#### Extends

- [`PlacementRequest`](#placementrequest)

#### Properties

<a id="agentname-1"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`agentName`](#agentname)

<a id="call-1"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`PlacementRequest`](#placementrequest).[`call`](#call)

<a id="operationkey"></a>

##### operationKey

> `readonly` **operationKey**: `string`

<a id="placement-1"></a>

##### placement

> `readonly` **placement**: [`Placement`](#placement-2)

###### Inherited from

[`PlacementRequest`](#placementrequest).[`placement`](#placement)

<a id="sessionid-1"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`sessionId`](#sessionid)

<a id="tasks-1"></a>

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

###### Inherited from

[`PlacementRequest`](#placementrequest).[`tasks`](#tasks)

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `Any`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`tool`](#tool)

<a id="toolcallbatch-1"></a>

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

###### Inherited from

[`PlacementRequest`](#placementrequest).[`toolCallBatch`](#toolcallbatch)

<a id="toolcallindex-1"></a>

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`toolCallIndex`](#toolcallindex)

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`turn`](#turn)

***

<a id="remoterouteidempotentoptions"></a>

### RemoteRouteIdempotentOptions

Idempotent remote route whose endpoint deduplicates the stable operation key.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E`

#### Properties

<a id="execute-1"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`RemotePlacementRequest`](#remoteplacementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

<a id="idempotent"></a>

##### idempotent

> `readonly` **idempotent**: `true`

<a id="maxretries"></a>

##### maxRetries

> `readonly` **maxRetries**: `number`

<a id="operationkey-1"></a>

##### operationKey

> `readonly` **operationKey**: (`request`) => `string`

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`string`

<a id="schedule"></a>

##### schedule

> `readonly` **schedule**: `Schedule`\<`unknown`, `E`\>

<a id="toolkit-1"></a>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

<a id="tools-3"></a>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

***

<a id="remoteroutenonidempotentoptions"></a>

### RemoteRouteNonIdempotentOptions

#### Extends

- [`PlacementRouteOptions`](#placementrouteoptions)\<`Tools`, `E`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

#### Properties

<a id="execute-2"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`execute`](#execute)

<a id="idempotent-1"></a>

##### idempotent?

> `readonly` `optional` **idempotent?**: `false`

<a id="schedule-1"></a>

##### schedule?

> `readonly` `optional` **schedule?**: `Schedule`\<`unknown`, `unknown`, `never`, `never`\>

<a id="toolkit-2"></a>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`toolkit`](#toolkit)

<a id="tools-5"></a>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`tools`](#tools-1)

***

<a id="route"></a>

### Route

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

<a id="cancel"></a>

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

<a id="execute-3"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

<a id="matches"></a>

##### matches

> `readonly` **matches**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`boolean`

<a id="replaypolicy"></a>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

<a id="tools-6"></a>

##### tools

> `readonly` **tools**: readonly `string`[]

***

<a id="routeoptions"></a>

### RouteOptions

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

<a id="cancel-1"></a>

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

<a id="execute-4"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

<a id="matches-1"></a>

##### matches?

> `readonly` `optional` **matches?**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`boolean`

<a id="replaypolicy-1"></a>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

<a id="tools-7"></a>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

## Type Aliases

<a id="placement-2"></a>

### Placement

> **Placement** = `"client"` \| `"remote"` \| `"mcp"` \| `"sandbox"`

***

<a id="placementresponse"></a>

### PlacementResponse

> **PlacementResponse** = \{ `_tag`: `"Success"`; `result`: `unknown`; \} \| \{ `_tag`: `"DomainFailure"`; `failure`: `unknown`; \} \| \{ `_tag`: `"Suspend"`; `token`: `string`; \}

***

<a id="remoterouteoptions"></a>

### RemoteRouteOptions

> **RemoteRouteOptions**\<`Tools`, `E`\> = [`RemoteRouteNonIdempotentOptions`](#remoteroutenonidempotentoptions)\<`Tools`, `E`\> \| [`RemoteRouteIdempotentOptions`](#remoterouteidempotentoptions)\<`Tools`, `E`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

***

<a id="routeinput"></a>

### RouteInput

> **RouteInput**\<`R`\> = [`Route`](#route)\<`R`\> \| `Effect.Effect`\<[`Route`](#route)\<`R`\>, `never`, `R`\>

#### Type Parameters

##### R

`R` = `never`

## Variables

<a id="placementoutcome"></a>

### placementOutcome

> `const` **placementOutcome**: `object`

#### Type Declaration

<a id="fromresponse"></a>

##### fromResponse

> **fromResponse**: *typeof* `placementOutcomeFromResponse`
