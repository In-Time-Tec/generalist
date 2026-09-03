[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / ToolAuthorization

# ToolAuthorization

## Classes

### AuthorizationError

Failure while producing a final authorization decision.

#### Extends

- `AuthorizationError_base`

#### Constructors

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

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`AuthorizationError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AuthorizationError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`AuthorizationError_base.message`

***

### PermissionDenied

A final authorization denial.

#### Extends

- `PermissionDenied_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PermissionDenied_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`PermissionDenied_base.message`

***

### ToolAuthorizer

Optional exact tool authorizer service for run-layer composition.

#### Extends

- `ToolAuthorizer_base`

#### Constructors

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

### AccessRequest

The common identity and context of one authorization attempt.

#### Extended by

- [`Request`](#request)
- [`Pending`](../../approvals#pending)

#### Properties

##### agentName

> `readonly` **agentName**: `string`

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

##### runId?

> `readonly` `optional` **runId?**: `string`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

##### turn

> `readonly` **turn**: `number`

***

### Authorizer

Final tool authorization boundary.

#### Type Parameters

##### R

`R` = `never`

#### Properties

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

### Deny

The tool must not execute.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Deny"`

##### error

> `readonly` **error**: [`PermissionDenied`](#permissiondenied)

***

### Execute

The tool may execute.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Execute"`

***

### Options

Required services used by the linear authorization pass.

#### Properties

##### approvals

> `readonly` **approvals**: [`Service`](../../approvals#service)

##### permissions

> `readonly` **permissions**: [`Service`](../../permissions#service)

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

### Request

Input to the final tool authorization boundary.

#### Extends

- [`AccessRequest`](#accessrequest)

#### Type Parameters

##### E

`E` = `never`

#### Properties

##### activatedSkills

> `readonly` **activatedSkills**: readonly `string`[]

##### active

> `readonly` **active**: `boolean`

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`agentName`](#agentname)

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`AccessRequest`](#accessrequest).[`call`](#call)

##### forceApproval?

> `readonly` `optional` **forceApproval?**: `boolean`

##### messages

> `readonly` **messages**: readonly `Message`[]

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

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`runId`](#runid)

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

[`AccessRequest`](#accessrequest).[`sessionId`](#sessionid)

##### tool

> `readonly` **tool**: `Any` \| `undefined`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AccessRequest`](#accessrequest).[`turn`](#turn)

***

### Suspend

The run must suspend before the tool can execute.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Suspend"`

##### token

> `readonly` **token**: `string`

## Type Aliases

### ToolAuthorization

> **ToolAuthorization** = [`Execute`](#execute) \| [`Deny`](#deny) \| [`Suspend`](#suspend)

The one final decision for a tool execution attempt.

## Variables

### layerTest

> `const` **layerTest**: (`authorizer`) => `Layer.Layer`\<[`ToolAuthorizer`](#toolauthorizer)\>

Provide an exact authorizer for tests or run-layer composition.

#### Parameters

##### authorizer

[`Authorizer`](#authorizer)

#### Returns

`Layer.Layer`\<[`ToolAuthorizer`](#toolauthorizer)\>

***

### make

> `const` **make**: (`options`) => [`Authorizer`](#authorizer)

Build the authorizer from its three required policy seams.

#### Parameters

##### options

[`Options`](#options)

#### Returns

[`Authorizer`](#authorizer)
