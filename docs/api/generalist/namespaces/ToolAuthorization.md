[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolAuthorization

# ToolAuthorization

## Classes

<a id="authorizationerror"></a>

### AuthorizationError

Failure while producing a final authorization decision.

#### Extends

- `AuthorizationError_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AuthorizationError**(...`args`): [`AuthorizationError`](#authorizationerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AuthorizationError`](#authorizationerror)

###### Inherited from

`AuthorizationError_base.constructor`

#### Properties

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AuthorizationError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AuthorizationError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`AuthorizationError_base.message`

***

<a id="permissiondenied"></a>

### PermissionDenied

A final authorization denial.

#### Extends

- `PermissionDenied_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new PermissionDenied**(...`args`): [`PermissionDenied`](#permissiondenied)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PermissionDenied`](#permissiondenied)

###### Inherited from

`PermissionDenied_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PermissionDenied_base.hint`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`PermissionDenied_base.message`

***

<a id="toolauthorizer"></a>

### ToolAuthorizer

Optional exact tool authorizer service for run-layer composition.

#### Extends

- `ToolAuthorizer_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new ToolAuthorizer**(`_`): [`ToolAuthorizer`](#toolauthorizer)

###### Parameters

###### \_

`never`

###### Returns

[`ToolAuthorizer`](#toolauthorizer)

###### Inherited from

`ToolAuthorizer_base.constructor`

## Interfaces

<a id="accessrequest"></a>

### AccessRequest

The common identity and context of one authorization attempt.

#### Extended by

- [`Request`](#request)
- [`Pending`](../../approvals#pending)

#### Properties

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

<a id="runid"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

<a id="sessionid"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="authorizer"></a>

### Authorizer

Final tool authorization boundary.

#### Type Parameters

##### R

`R` = `never`

#### Properties

<a id="authorize"></a>

##### authorize

> `readonly` **authorize**: \<`E`\>(`request`) => `Effect`\<[`ToolAuthorization`](#toolauthorization), [`AuthorizationError`](#authorizationerror) \| `E`, `R`\>

###### Type Parameters

###### E

`E`

###### Parameters

###### request

[`Request`](#request)\<`E`\>

###### Returns

`Effect`\<[`ToolAuthorization`](#toolauthorization), [`AuthorizationError`](#authorizationerror) \| `E`, `R`\>

***

<a id="deny"></a>

### Deny

The tool must not execute.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Deny"`

<a id="error"></a>

##### error

> `readonly` **error**: [`PermissionDenied`](#permissiondenied)

***

<a id="execute"></a>

### Execute

The tool may execute.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Execute"`

***

<a id="options"></a>

### Options

Required services used by the linear authorization pass.

#### Properties

<a id="approvals"></a>

##### approvals

> `readonly` **approvals**: [`Service`](../../approvals#service)

<a id="permissions"></a>

##### permissions

> `readonly` **permissions**: [`Service`](../../permissions#service)

<a id="rulestore"></a>

##### ruleStore

> `readonly` **ruleStore**: `object`

###### remember

> `readonly` **remember**: (`rule`) => `Effect`\<`void`, [`RuleStoreError`](../../permissions#rulestoreerror)\>

###### Parameters

###### rule

[`Rule`](../../permissions#rule)

###### Returns

`Effect`\<`void`, [`RuleStoreError`](../../permissions#rulestoreerror)\>

###### rules

> `readonly` **rules**: `Effect`\<readonly [`Rule`](../../permissions#rule)[], [`RuleStoreError`](../../permissions#rulestoreerror)\>

***

<a id="request"></a>

### Request

Input to the final tool authorization boundary.

#### Extends

- [`AccessRequest`](#accessrequest)

#### Type Parameters

##### E

`E` = `never`

#### Properties

<a id="activatedskills"></a>

##### activatedSkills

> `readonly` **activatedSkills**: readonly `string`[]

<a id="active"></a>

##### active

> `readonly` **active**: `boolean`

<a id="activetools"></a>

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

<a id="agentname-1"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`agentName`](#agentname)

<a id="call-1"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`AccessRequest`](#accessrequest).[`call`](#call)

<a id="forceapproval"></a>

##### forceApproval?

> `readonly` `optional` **forceApproval?**: `boolean`

<a id="messages"></a>

##### messages

> `readonly` **messages**: readonly `Message`[]

<a id="onapprovalrequired"></a>

##### onApprovalRequired

> `readonly` **onApprovalRequired**: (`request`) => `Effect`\<`string` \| `void`, `E`\>

###### Parameters

###### request

###### approvalId

`string`

###### capability

`string`

###### input

`unknown`

###### operation

`string`

###### Returns

`Effect`\<`string` \| `void`, `E`\>

<a id="runid-1"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`runId`](#runid)

<a id="sessionid-1"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`sessionId`](#sessionid)

<a id="tool"></a>

##### tool

> `readonly` **tool**: `Any` \| `undefined`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AccessRequest`](#accessrequest).[`turn`](#turn)

***

<a id="suspend"></a>

### Suspend

The run must suspend before the tool can execute.

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Suspend"`

<a id="token"></a>

##### token

> `readonly` **token**: `string`

## Type Aliases

<a id="toolauthorization"></a>

### ToolAuthorization

> **ToolAuthorization** = [`Execute`](#execute) \| [`Deny`](#deny) \| [`Suspend`](#suspend)

The one final decision for a tool execution attempt.

## Variables

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`authorizer`) => `Layer.Layer`\<[`ToolAuthorizer`](#toolauthorizer)\>

Provide an exact authorizer for tests or run-layer composition.

#### Parameters

##### authorizer

[`Authorizer`](#authorizer)

#### Returns

`Layer.Layer`\<[`ToolAuthorizer`](#toolauthorizer)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => [`Authorizer`](#authorizer)

Build the authorizer from its three required policy seams.

#### Parameters

##### options

[`Options`](#options)

#### Returns

[`Authorizer`](#authorizer)
