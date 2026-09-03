[**generalist**](./index)

***

[generalist](./index) / approvals

# approvals

## Classes

### Approvals

Enforcement point for policy asks and `Ai.Tool.needsApproval`.

#### Extends

- `Approvals_base`

#### Constructors

##### Constructor

> **new Approvals**(`_`): [`Approvals`](#approvals)

###### Parameters

###### \_

`never`

###### Returns

[`Approvals`](#approvals)

###### Inherited from

`Approvals_base.constructor`

***

### ApprovalTokenInvalid

A Runtime approval token was malformed or did not carry a Run identity.

#### Extends

- `ApprovalTokenInvalid_base`

#### Constructors

##### Constructor

> **new ApprovalTokenInvalid**(...`args`): [`ApprovalTokenInvalid`](#approvaltokeninvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ApprovalTokenInvalid`](#approvaltokeninvalid)

###### Inherited from

`ApprovalTokenInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.message`

##### token

> `readonly` **token**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.token`

## Interfaces

### Approved

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Approved"`

##### remember?

> `readonly` `optional` **remember?**: [`Rule`](./permissions#rule)

***

### Denied

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Denied"`

##### reason?

> `readonly` `optional` **reason?**: `string`

***

### DurableOptions

#### Type Parameters

##### R

`R`

#### Properties

##### notify

> `readonly` **notify**: (`request`) => `Effect`\<`void`, `never`, `R`\>

###### Parameters

###### request

[`DurableRequest`](#durablerequest)

###### Returns

`Effect`\<`void`, `never`, `R`\>

***

### DurableRequest

One durable approval notification.

#### Properties

##### args

> `readonly` **args**: `unknown`

##### level

> `readonly` **level**: [`Level`](./permissions#level-1)

##### reason

> `readonly` **reason**: `string`

##### runId

> `readonly` **runId**: `string`

##### token

> `readonly` **token**: `string`

##### tool

> `readonly` **tool**: `string`

***

### Pending

An unresolved authorization request.

#### Extends

- [`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Pending"`

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`agentName`](./generalist/namespaces/ToolAuthorization#agentname)

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`call`](./generalist/namespaces/ToolAuthorization#call)

##### level

> `readonly` **level**: [`Level`](./permissions#level-1)

##### reason

> `readonly` **reason**: `string`

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`runId`](./generalist/namespaces/ToolAuthorization#runid)

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`sessionId`](./generalist/namespaces/ToolAuthorization#sessionid)

##### token

> `readonly` **token**: `string`

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`turn`](./generalist/namespaces/ToolAuthorization#turn)

***

### ResolveOptions

#### Properties

##### operator

> `readonly` **operator**: `string`

Operator identity journaled with the decision; also requires the token to be an open obligation.

***

### Service

#### Properties

##### resolve

> `readonly` **resolve**: (`pending`) => `Effect`\<[`Resolution`](#resolution)\>

###### Parameters

###### pending

[`Pending`](#pending)

###### Returns

`Effect`\<[`Resolution`](#resolution)\>

***

### TieredOptions

#### Type Parameters

##### R

`R`

##### E

`E`

#### Properties

##### ask

> `readonly` **ask**: `Layer`\<[`Approvals`](#approvals), `E`, `R`\>

##### askAbove

> `readonly` **askAbove**: [`Level`](./permissions#level-1)

## Type Aliases

### Resolution

> **Resolution** = [`Approved`](#approved) \| [`Denied`](#denied) \| [`Pending`](#pending)

***

### ResolveError

> **ResolveError** = [`ApprovalTokenInvalid`](#approvaltokeninvalid) \| [`RespondApprovalError`](./runtime/namespaces/Runtime#respondapprovalerror) \| [`RuleStoreError`](./permissions#rulestoreerror) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors#illegaloperatoraction)

## Variables

### Approved

> **Approved**: (`options?`) => [`Approved`](#approved)

Construct an approval, optionally remembering one permission rule.

#### Parameters

##### options?

`Omit`\<[`Approved`](#approved), `"_tag"`\>

#### Returns

[`Approved`](#approved)

***

### Denied

> **Denied**: (`options?`) => [`Denied`](#denied)

Construct a denial with an optional operator-facing reason.

#### Parameters

##### options?

`Omit`\<[`Denied`](#denied), `"_tag"`\>

#### Returns

[`Denied`](#denied)

***

### layerAutoApprove

> `const` **layerAutoApprove**: `Layer.Layer`\<[`Approvals`](#approvals)\>

Default: every request resolves Approved.

***

### layerConsole

> `const` **layerConsole**: () => `Layer.Layer`\<[`Approvals`](#approvals), `never`, `Terminal.Terminal`\>

Ask for each approval through Effect's Terminal service.

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals), `never`, `Terminal.Terminal`\>

***

### layerDenyAll

> `const` **layerDenyAll**: `Layer.Layer`\<[`Approvals`](#approvals)\>

Every request resolves Denied.

***

### layerDurable

> `const` **layerDurable**: \<`R`\>(`options`) => `Layer.Layer`\<[`Approvals`](#approvals), `never`, [`Runtime`](./runtime/namespaces/Runtime#runtime) \| `R`\>

Park approval requests in the Runtime and notify one external operator boundary.

#### Type Parameters

##### R

`R`

#### Parameters

##### options

[`DurableOptions`](#durableoptions)\<`R`\>

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals), `never`, [`Runtime`](./runtime/namespaces/Runtime#runtime) \| `R`\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Approvals`](#approvals)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals)\>

***

### layerTiered

> `const` **layerTiered**: \<`R`, `E`\>(`options`) => `Layer.Layer`\<[`Approvals`](#approvals), `E`, `R`\>

Delegate approvals at or above one Permissions level and approve lower levels.

#### Type Parameters

##### R

`R`

##### E

`E`

#### Parameters

##### options

[`TieredOptions`](#tieredoptions)\<`R`, `E`\>

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals), `E`, `R`\>

***

### resolve

> `const` **resolve**: \{(`token`, `decision`, `options?`): `ResolveEffect`; (`decision`, `options?`): (`token`) => `ResolveEffect`; \}

Resolve one exact durable approval token through the active Runtime.

#### Call Signature

> (`token`, `decision`, `options?`): `ResolveEffect`

##### Parameters

###### token

`string`

###### decision

[`Approved`](#approved) \| [`Denied`](#denied)

###### options?

[`ResolveOptions`](#resolveoptions)

##### Returns

`ResolveEffect`

#### Call Signature

> (`decision`, `options?`): (`token`) => `ResolveEffect`

##### Parameters

###### decision

[`Approved`](#approved) \| [`Denied`](#denied)

###### options?

[`ResolveOptions`](#resolveoptions)

##### Returns

(`token`) => `ResolveEffect`
