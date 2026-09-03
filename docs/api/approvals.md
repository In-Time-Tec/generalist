[**generalist**](./index)

***

[generalist](./index) / approvals

# approvals

## Classes

<a id="approvals"></a>

### Approvals

Enforcement point for policy asks and `Ai.Tool.needsApproval`.

#### Extends

- `Approvals_base`

#### Constructors

<a id="constructor"></a>

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

<a id="approvaltokeninvalid"></a>

### ApprovalTokenInvalid

A Runtime approval token was malformed or did not carry a Run identity.

#### Extends

- `ApprovalTokenInvalid_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.message`

<a id="token"></a>

##### token

> `readonly` **token**: `string`

###### Inherited from

`ApprovalTokenInvalid_base.token`

## Interfaces

<a id="approved"></a>

### Approved

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Approved"`

<a id="remember"></a>

##### remember?

> `readonly` `optional` **remember?**: [`Rule`](./permissions#rule)

***

<a id="denied"></a>

### Denied

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Denied"`

<a id="reason"></a>

##### reason?

> `readonly` `optional` **reason?**: `string`

***

<a id="durableoptions"></a>

### DurableOptions

#### Type Parameters

##### R

`R`

#### Properties

<a id="notify"></a>

##### notify

> `readonly` **notify**: (`request`) => `Effect`\<`void`, `never`, `R`\>

###### Parameters

###### request

[`DurableRequest`](#durablerequest)

###### Returns

`Effect`\<`void`, `never`, `R`\>

***

<a id="durablerequest"></a>

### DurableRequest

One durable approval notification.

#### Properties

<a id="args"></a>

##### args

> `readonly` **args**: `unknown`

<a id="level"></a>

##### level

> `readonly` **level**: [`Level`](./permissions#level-1)

<a id="reason-1"></a>

##### reason

> `readonly` **reason**: `string`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

<a id="token-1"></a>

##### token

> `readonly` **token**: `string`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `string`

***

<a id="pending"></a>

### Pending

An unresolved authorization request.

#### Extends

- [`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest)

#### Properties

<a id="_tag-2"></a>

##### \_tag

> `readonly` **\_tag**: `"Pending"`

<a id="agentname"></a>

##### agentName

> `readonly` **agentName**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`agentName`](./generalist/namespaces/ToolAuthorization#agentname)

<a id="call"></a>

##### call

> `readonly` **call**: `ToolCallPart`\<`string`, `unknown`\>

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`call`](./generalist/namespaces/ToolAuthorization#call)

<a id="level-1"></a>

##### level

> `readonly` **level**: [`Level`](./permissions#level-1)

<a id="reason-2"></a>

##### reason

> `readonly` **reason**: `string`

<a id="runid-1"></a>

##### runId?

> `readonly` `optional` **runId?**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`runId`](./generalist/namespaces/ToolAuthorization#runid)

<a id="sessionid"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`sessionId`](./generalist/namespaces/ToolAuthorization#sessionid)

<a id="token-2"></a>

##### token

> `readonly` **token**: `string`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

###### Inherited from

[`AccessRequest`](./generalist/namespaces/ToolAuthorization#accessrequest).[`turn`](./generalist/namespaces/ToolAuthorization#turn)

***

<a id="resolveoptions"></a>

### ResolveOptions

#### Properties

<a id="operator"></a>

##### operator

> `readonly` **operator**: `string`

Operator identity journaled with the decision; also requires the token to be an open obligation.

***

<a id="service"></a>

### Service

#### Properties

<a id="resolve"></a>

##### resolve

> `readonly` **resolve**: (`pending`) => `Effect`\<[`Resolution`](#resolution)\>

###### Parameters

###### pending

[`Pending`](#pending)

###### Returns

`Effect`\<[`Resolution`](#resolution)\>

***

<a id="tieredoptions"></a>

### TieredOptions

#### Type Parameters

##### R

`R`

##### E

`E`

#### Properties

<a id="ask"></a>

##### ask

> `readonly` **ask**: `Layer`\<[`Approvals`](#approvals), `E`, `R`\>

<a id="askabove"></a>

##### askAbove

> `readonly` **askAbove**: [`Level`](./permissions#level-1)

## Type Aliases

<a id="resolution"></a>

### Resolution

> **Resolution** = [`Approved`](#approved) \| [`Denied`](#denied) \| [`Pending`](#pending)

***

<a id="resolveerror"></a>

### ResolveError

> **ResolveError** = [`ApprovalTokenInvalid`](#approvaltokeninvalid) \| [`RespondApprovalError`](./runtime/namespaces/Runtime#respondapprovalerror) \| [`RuleStoreError`](./permissions#rulestoreerror) \| [`IllegalOperatorAction`](./runtime/namespaces/Errors#illegaloperatoraction)

## Variables

<a id="approved-1"></a>

### Approved

> **Approved**: (`options?`) => [`Approved`](#approved)

Construct an approval, optionally remembering one permission rule.

#### Parameters

##### options?

`Omit`\<[`Approved`](#approved), `"_tag"`\>

#### Returns

[`Approved`](#approved)

***

<a id="denied-1"></a>

### Denied

> **Denied**: (`options?`) => [`Denied`](#denied)

Construct a denial with an optional operator-facing reason.

#### Parameters

##### options?

`Omit`\<[`Denied`](#denied), `"_tag"`\>

#### Returns

[`Denied`](#denied)

***

<a id="layerautoapprove"></a>

### layerAutoApprove

> `const` **layerAutoApprove**: `Layer.Layer`\<[`Approvals`](#approvals)\>

Default: every request resolves Approved.

***

<a id="layerconsole"></a>

### layerConsole

> `const` **layerConsole**: () => `Layer.Layer`\<[`Approvals`](#approvals), `never`, `Terminal.Terminal`\>

Ask for each approval through Effect's Terminal service.

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals), `never`, `Terminal.Terminal`\>

***

<a id="layerdenyall"></a>

### layerDenyAll

> `const` **layerDenyAll**: `Layer.Layer`\<[`Approvals`](#approvals)\>

Every request resolves Denied.

***

<a id="layerdurable"></a>

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

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`Approvals`](#approvals)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`Approvals`](#approvals)\>

***

<a id="layertiered"></a>

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

<a id="resolve-1"></a>

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
