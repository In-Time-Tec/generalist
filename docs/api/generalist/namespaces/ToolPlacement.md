[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolPlacement

# ToolPlacement

## Interfaces

### PlacementRequest

#### Extends

- [`Request`](./ToolExecutor#request)

#### Extended by

- [`RemotePlacementRequest`](#remoteplacementrequest)

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`Request`](./ToolExecutor#request).[`agentName`](./ToolExecutor#agentname)

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`Request`](./ToolExecutor#request).[`call`](./ToolExecutor#call)

##### placement

> `readonly` **placement**: [`Placement`](#placement-2)

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

[`Request`](./ToolExecutor#request).[`sessionId`](./ToolExecutor#sessionid-1)

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

###### Inherited from

[`Request`](./ToolExecutor#request).[`tasks`](./ToolExecutor#tasks)

##### tool

> `readonly` **tool**: `Any`

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

###### Inherited from

[`Request`](./ToolExecutor#request).[`toolCallBatch`](./ToolExecutor#toolcallbatch)

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

###### Inherited from

[`Request`](./ToolExecutor#request).[`toolCallIndex`](./ToolExecutor#toolcallindex)

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`Request`](./ToolExecutor#request).[`turn`](./ToolExecutor#turn)

***

### PlacementRouteOptions

#### Extended by

- [`RemoteRouteNonIdempotentOptions`](#remoteroutenonidempotentoptions)

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

#### Properties

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

***

### RemotePlacementRequest

An idempotent remote placement request carrying its endpoint deduplication key.

#### Extends

- [`PlacementRequest`](#placementrequest)

#### Properties

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`agentName`](#agentname)

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`PlacementRequest`](#placementrequest).[`call`](#call)

##### operationKey

> `readonly` **operationKey**: `string`

##### placement

> `readonly` **placement**: [`Placement`](#placement-2)

###### Inherited from

[`PlacementRequest`](#placementrequest).[`placement`](#placement)

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`sessionId`](#sessionid)

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

###### Inherited from

[`PlacementRequest`](#placementrequest).[`tasks`](#tasks)

##### tool

> `readonly` **tool**: `Any`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`tool`](#tool)

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

###### Inherited from

[`PlacementRequest`](#placementrequest).[`toolCallBatch`](#toolcallbatch)

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`toolCallIndex`](#toolcallindex)

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`PlacementRequest`](#placementrequest).[`turn`](#turn)

***

### RemoteRouteIdempotentOptions

Idempotent remote route whose endpoint deduplicates the stable operation key.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E`

#### Properties

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`RemotePlacementRequest`](#remoteplacementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

##### idempotent

> `readonly` **idempotent**: `true`

##### maxRetries

> `readonly` **maxRetries**: `number`

##### operationKey

> `readonly` **operationKey**: (`request`) => `string`

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`string`

##### schedule

> `readonly` **schedule**: `Schedule`\<`unknown`, `E`\>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

***

### RemoteRouteNonIdempotentOptions

#### Extends

- [`PlacementRouteOptions`](#placementrouteoptions)\<`Tools`, `E`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

#### Properties

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`execute`](#execute)

##### idempotent?

> `readonly` `optional` **idempotent?**: `false`

##### schedule?

> `readonly` `optional` **schedule?**: `Schedule`\<`unknown`, `unknown`, `never`, `never`\>

##### toolkit

> `readonly` **toolkit**: `PlacementToolkit`\<`Tools`\>

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`toolkit`](#toolkit)

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

###### Inherited from

[`PlacementRouteOptions`](#placementrouteoptions).[`tools`](#tools-1)

***

### Route

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

##### matches

> `readonly` **matches**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`boolean`

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

##### tools

> `readonly` **tools**: readonly `string`[]

***

### RouteOptions

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext#toolcontext)

#### Properties

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor#cancellationoutcome), [`CancellationFailure`](./ToolExecutor#cancellationfailure), `R`\>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor#outcome), [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor#remoteretrymisconfigured), `R`\>

##### matches?

> `readonly` `optional` **matches?**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

`boolean`

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor#replaypolicy-1)

##### tools?

> `readonly` `optional` **tools?**: readonly `string`[]

## Type Aliases

### Placement

> **Placement** = `"client"` \| `"remote"` \| `"mcp"` \| `"sandbox"`

***

### PlacementResponse

> **PlacementResponse** = \{ `_tag`: `"Success"`; `result`: `unknown`; \} \| \{ `_tag`: `"DomainFailure"`; `failure`: `unknown`; \} \| \{ `_tag`: `"Suspend"`; `token`: `string`; \}

***

### RemoteRouteOptions

> **RemoteRouteOptions**\<`Tools`, `E`\> = [`RemoteRouteNonIdempotentOptions`](#remoteroutenonidempotentoptions)\<`Tools`, `E`\> \| [`RemoteRouteIdempotentOptions`](#remoterouteidempotentoptions)\<`Tools`, `E`\>

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor#frameworkfailure)

***

### RouteInput

> **RouteInput**\<`R`\> = [`Route`](#route)\<`R`\> \| `Effect.Effect`\<[`Route`](#route)\<`R`\>, `never`, `R`\>

#### Type Parameters

##### R

`R` = `never`

## Variables

### placementOutcome

> `const` **placementOutcome**: `object`

#### Type Declaration

##### fromResponse

> **fromResponse**: *typeof* `placementOutcomeFromResponse`
