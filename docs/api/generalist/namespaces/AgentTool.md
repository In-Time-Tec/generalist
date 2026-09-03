[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentTool

# AgentTool

## Classes

<a id="registrationerror"></a>

### RegistrationError

#### Extends

- `RegistrationError_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new RegistrationError**(...`args`): [`RegistrationError`](#registrationerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RegistrationError`](#registrationerror)

###### Inherited from

`RegistrationError_base.constructor`

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: `string`

###### Inherited from

`RegistrationError_base.agent`

<a id="cause"></a>

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`RegistrationError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RegistrationError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`RegistrationError_base.message`

## Interfaces

<a id="agenttooltoolkit"></a>

### AgentToolToolkit

#### Type Parameters

##### _Name

`_Name` *extends* `string`

##### Parameters

`Parameters` *extends* `Schema.Top`

##### Success

`Success` *extends* `Schema.Top`

##### R

`R`

#### Properties

<a id="invoke"></a>

##### invoke

> `readonly` **invoke**: (`params`) => `Effect`\<`Success`\[`"Type"`\], `string` \| [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror), `R`\>

###### Parameters

###### params

`unknown`

###### Returns

`Effect`\<`Success`\[`"Type"`\], `string` \| [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror), `R`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="parametersschema"></a>

##### parametersSchema

> `readonly` **parametersSchema**: `Top`

<a id="requirements"></a>

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

<a id="successschema"></a>

##### successSchema

> `readonly` **successSchema**: `Top`

<a id="tool"></a>

##### tool

> `readonly` **tool**: `AgentToolTool`\<`Parameters`, `Success`\>

<a id="tools"></a>

##### tools

> `readonly` **tools**: `object`

###### Index Signature

\[`name`: `string`\]: `AgentToolTool`\<`Parameters`, `Success`\>

***

<a id="astooloptions"></a>

### AsToolOptions

#### Type Parameters

##### Name

`Name` *extends* `string` = `string`

##### Parameters

`Parameters` *extends* `Schema.Top` = `DefaultParameters`

##### Success

`Success` *extends* `Schema.Top` = `DefaultSuccess`

##### ModelR

`ModelR` = `never`

#### Properties

<a id="description"></a>

##### description?

> `readonly` `optional` **description?**: `string`

<a id="fromresult"></a>

##### fromResult?

> `readonly` `optional` **fromResult?**: (`output`) => `Success`\[`"Type"`\]

###### Parameters

###### output

`string`

###### Returns

`Success`\[`"Type"`\]

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `ModelR`\>

Model layer for the child run. Omit to inherit the model provided to the parent run.

<a id="name-2"></a>

##### name?

> `readonly` `optional` **name?**: `Name`

<a id="parameters-2"></a>

##### parameters?

> `readonly` `optional` **parameters?**: `Parameters`

<a id="success-2"></a>

##### success?

> `readonly` `optional` **success?**: `Success`

<a id="toprompt"></a>

##### toPrompt?

> `readonly` `optional` **toPrompt?**: (`params`) => `string`

###### Parameters

###### params

`Parameters`\[`"Type"`\]

###### Returns

`string`

***

<a id="fanoutoptions"></a>

### FanOutOptions

#### Type Parameters

##### Name

`Name` *extends* `string`

##### Entries

`Entries` *extends* `Profiles`

#### Properties

<a id="agents"></a>

##### agents

> `readonly` **agents**: `Entries`

<a id="description-1"></a>

##### description

> `readonly` **description**: `string`

<a id="maxchildren"></a>

##### maxChildren

> `readonly` **maxChildren**: `number`

<a id="name-4"></a>

##### name

> `readonly` **name**: `Name`

***

<a id="fanoutparameters"></a>

### FanOutParameters

Model-facing parameters of a fan-out tool.

#### Type Parameters

##### Entries

`Entries` *extends* `Profiles`

#### Properties

<a id="children"></a>

##### children

> `readonly` **children**: readonly [`FanOutMember`](#fanoutmember)\<`Entries`\>[]

<a id="concurrency"></a>

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

<a id="onfailure"></a>

##### onFailure?

> `readonly` `optional` **onFailure?**: `"collect"` \| `"failFast"`

***

<a id="fanouttool"></a>

### FanOutTool

A Runtime-owned fan-out declaration; callers do not provide a separate handler.

#### Extends

- `Tool`\<`Name`, \{ `failure`: *typeof* [`RunError`](./Agent#runerror-1); `failureMode`: `"error"`; `parameters`: `ParametersSchema`\<`Entries`\>; `success`: `SuccessSchema`\<`Entries`\>; \}, `Requirements`\<`Entries`\>\>

#### Type Parameters

##### Name

`Name` *extends* `string`

##### Entries

`Entries` *extends* `Profiles`

#### Properties

<a id="generalistcoreagent-toolfanout"></a>

##### generalist/core/agent-tool/FanOut

> `readonly` **generalist/core/agent-tool/FanOut**: `true`

## Type Aliases

<a id="fanoutmember"></a>

### FanOutMember

> **FanOutMember**\<`Entries`\> = `{ readonly [Name in Selection<Entries>]: { agent: Name; input: Input<AgentAt<Entries, Name>> } }`\[`Selection`\<`Entries`\>\]

One model-authored child request. Array order is the result order.

#### Type Parameters

##### Entries

`Entries` *extends* `Profiles`

## Variables

<a id="astool"></a>

### asTool

> `const` **asTool**: \{\<`Name`, `Parameters`, `Success`, `ModelR`\>(`options?`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `Name`, `Parameters`, `Success`, `ModelR`\>(`agent`, `options?`): [`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>; \}

#### Call Signature

> \<`Name`, `Parameters`, `Success`, `ModelR`\>(`options?`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>

##### Type Parameters

###### Name

`Name` *extends* `string` = `string`

###### Parameters

`Parameters` *extends* `Top` = `Struct`\<\{ `prompt`: `Schema.String`; \}\>

###### Success

`Success` *extends* `Top` = `String`

###### ModelR

`ModelR` = `never`

##### Parameters

###### options?

[`AsToolOptions`](#astooloptions)\<`Name`, `Parameters`, `Success`, `ModelR`\>

##### Returns

\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `Name`, `Parameters`, `Success`, `ModelR`\>(`agent`, `options?`): [`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### Name

`Name` *extends* `string` = `string`

###### Parameters

`Parameters` *extends* `Top` = `Struct`\<\{ `prompt`: `Schema.String`; \}\>

###### Success

`Success` *extends* `Top` = `String`

###### ModelR

`ModelR` = `never`

##### Parameters

###### agent

`TextAgent`\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\> \| [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>

###### options?

[`AsToolOptions`](#astooloptions)\<`Name`, `Parameters`, `Success`, `ModelR`\>

##### Returns

[`AgentToolToolkit`](#agenttooltoolkit)\<`Name`, `Parameters`, `Success`, `ModelR` \| [`RunRequirements`](./Agent#runrequirements)\<`Tools`, `R`, `AgentToolRunOptions`\> \| `Parameters`\[`"DecodingServices"`\]\>

***

<a id="fanout"></a>

### fanOut

> `const` **fanOut**: *typeof* `makeFanOut`

Declare a model-callable fan-out over an exact set of child Agents.

***

<a id="register"></a>

### register

> `const` **register**: \{\<`R`, `E`\>(`layer`): \<`Tools`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `E`\>(`agent`, `layer`): [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>; \}

#### Call Signature

> \<`R`, `E`\>(`layer`): \<`Tools`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>

##### Type Parameters

###### R

`R`

###### E

`E`

##### Parameters

###### layer

`Layer`\<`R`, `E`, `never`\>

##### Returns

\<`Tools`, `PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `E`\>(`agent`, `layer`): [`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### E

`E`

##### Parameters

###### agent

`TextAgent`\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>

###### layer

`Layer`\<`R`, `E`, `never`\>

##### Returns

[`Registration`](./Handoff#registration-1)\<`Tools`, `R`\>
