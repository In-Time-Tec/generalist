[**generalist**](../../index.md)

***

[generalist](../../index.md) / [generalist](../index.md) / ToolPlacement

# ToolPlacement

## Interfaces

<a id="placementrequest"></a>

### PlacementRequest

#### Extends

- [`Request`](./ToolExecutor.md#request)

#### Extended by

- [`RemotePlacementRequest`](#remoteplacementrequest)

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`agentName`](./ToolExecutor.md#agentname)

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`call`](./ToolExecutor.md#call)

<a id="placement"></a>

##### placement

> `readonly` **placement**: [`Placement`](#placement-2)

<a id="sessionid"></a>

##### sessionId

> `readonly` **sessionId**: `string`

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`sessionId`](./ToolExecutor.md#sessionid-1)

<a id="tasks"></a>

##### tasks?

> `readonly` `optional` **tasks?**: readonly `object`[]

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`tasks`](./ToolExecutor.md#tasks)

<a id="tool"></a>

##### tool

> `readonly` **tool**: `Any`

<a id="toolcallbatch"></a>

##### toolCallBatch

> `readonly` **toolCallBatch**: `object`

###### calls

> `readonly` **calls**: readonly `ToolCallPart`\<`string`, `unknown`\>[]

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`toolCallBatch`](./ToolExecutor.md#toolcallbatch)

<a id="toolcallindex"></a>

##### toolCallIndex

> `readonly` **toolCallIndex**: `number`

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`toolCallIndex`](./ToolExecutor.md#toolcallindex)

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`Request`](./ToolExecutor.md#request).[`turn`](./ToolExecutor.md#turn)

***

<a id="placementrouteoptions"></a>

### PlacementRouteOptions

#### Extended by

- [`RemoteRouteNonIdempotentOptions`](#remoteroutenonidempotentoptions)

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### E

`E` = [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure)

#### Properties

<a id="execute"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

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

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`RemotePlacementRequest`](#remoteplacementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

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

`E` = [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure)

#### Properties

<a id="execute-2"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

###### Parameters

###### request

[`PlacementRequest`](#placementrequest)

###### Returns

`Effect`\<[`PlacementResponse`](#placementresponse), `E`, [`ToolContext`](./ToolContext.md#toolcontext) \| `PlacementSchemaServices`\<`Tools`\>\>

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

`R` = [`ToolContext`](./ToolContext.md#toolcontext)

#### Properties

<a id="cancel"></a>

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor.md#cancellationoutcome), [`CancellationFailure`](./ToolExecutor.md#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor.md#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor.md#cancellationoutcome), [`CancellationFailure`](./ToolExecutor.md#cancellationfailure), `R`\>

<a id="execute-3"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor.md#outcome), [`EvaluationFailure`](../../hooks.md#evaluationfailure) \| [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor.md#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor.md#outcome), [`EvaluationFailure`](../../hooks.md#evaluationfailure) \| [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor.md#remoteretrymisconfigured), `R`\>

<a id="matches"></a>

##### matches

> `readonly` **matches**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

`boolean`

<a id="replaypolicy"></a>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor.md#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor.md#replaypolicy-1)

<a id="tools-6"></a>

##### tools

> `readonly` **tools**: readonly `string`[]

***

<a id="routeoptions"></a>

### RouteOptions

#### Type Parameters

##### R

`R` = [`ToolContext`](./ToolContext.md#toolcontext)

#### Properties

<a id="cancel-1"></a>

##### cancel?

> `readonly` `optional` **cancel?**: (`request`) => `Effect`\<[`CancellationOutcome`](./ToolExecutor.md#cancellationoutcome), [`CancellationFailure`](./ToolExecutor.md#cancellationfailure), `R`\>

###### Parameters

###### request

[`CancellationRequest`](./ToolExecutor.md#cancellationrequest)

###### Returns

`Effect`\<[`CancellationOutcome`](./ToolExecutor.md#cancellationoutcome), [`CancellationFailure`](./ToolExecutor.md#cancellationfailure), `R`\>

<a id="execute-4"></a>

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<[`Outcome`](./ToolExecutor.md#outcome), [`EvaluationFailure`](../../hooks.md#evaluationfailure) \| [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor.md#remoteretrymisconfigured), `R`\>

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

`Effect`\<[`Outcome`](./ToolExecutor.md#outcome), [`EvaluationFailure`](../../hooks.md#evaluationfailure) \| [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure) \| [`RemoteRetryMisconfigured`](./ToolExecutor.md#remoteretrymisconfigured), `R`\>

<a id="matches-1"></a>

##### matches?

> `readonly` `optional` **matches?**: (`request`) => `boolean`

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

`boolean`

<a id="replaypolicy-1"></a>

##### replayPolicy?

> `readonly` `optional` **replayPolicy?**: (`request`) => [`ReplayPolicy`](./ToolExecutor.md#replaypolicy-1)

###### Parameters

###### request

[`Request`](./ToolExecutor.md#request)

###### Returns

[`ReplayPolicy`](./ToolExecutor.md#replaypolicy-1)

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

`E` = [`FrameworkFailure`](./ToolExecutor.md#frameworkfailure)

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
