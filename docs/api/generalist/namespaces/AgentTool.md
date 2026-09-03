[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentTool

# AgentTool

## Classes

### RegistrationError

#### Extends

- `RegistrationError_base`

#### Constructors

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

##### agent

> `readonly` **agent**: `string`

###### Inherited from

`RegistrationError_base.agent`

##### cause

> `readonly` **cause**: `unknown`

###### Inherited from

`RegistrationError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RegistrationError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`RegistrationError_base.message`

## Interfaces

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

##### invoke

> `readonly` **invoke**: (`params`) => `Effect`\<`Success`\[`"Type"`\], `string` \| [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror), `R`\>

###### Parameters

###### params

`unknown`

###### Returns

`Effect`\<`Success`\[`"Type"`\], `string` \| [`HookFailed`](../../hooks#hookfailed) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`DriverError`](./DurableDriver#drivererror), `R`\>

##### name

> `readonly` **name**: `string`

##### parametersSchema

> `readonly` **parametersSchema**: `Top`

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

##### successSchema

> `readonly` **successSchema**: `Top`

##### tool

> `readonly` **tool**: `AgentToolTool`\<`Parameters`, `Success`\>

##### tools

> `readonly` **tools**: `object`

###### Index Signature

\[`name`: `string`\]: `AgentToolTool`\<`Parameters`, `Success`\>

***

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

##### description?

> `readonly` `optional` **description?**: `string`

##### fromResult?

> `readonly` `optional` **fromResult?**: (`output`) => `Success`\[`"Type"`\]

###### Parameters

###### output

`string`

###### Returns

`Success`\[`"Type"`\]

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `ModelR`\>

Model layer for the child run. Omit to inherit the model provided to the parent run.

##### name?

> `readonly` `optional` **name?**: `Name`

##### parameters?

> `readonly` `optional` **parameters?**: `Parameters`

##### success?

> `readonly` `optional` **success?**: `Success`

##### toPrompt?

> `readonly` `optional` **toPrompt?**: (`params`) => `string`

###### Parameters

###### params

`Parameters`\[`"Type"`\]

###### Returns

`string`

***

### FanOutOptions

#### Type Parameters

##### Name

`Name` *extends* `string`

##### Entries

`Entries` *extends* `Profiles`

#### Properties

##### agents

> `readonly` **agents**: `Entries`

##### description

> `readonly` **description**: `string`

##### maxChildren

> `readonly` **maxChildren**: `number`

##### name

> `readonly` **name**: `Name`

***

### FanOutParameters

Model-facing parameters of a fan-out tool.

#### Type Parameters

##### Entries

`Entries` *extends* `Profiles`

#### Properties

##### children

> `readonly` **children**: readonly [`FanOutMember`](#fanoutmember)\<`Entries`\>[]

##### concurrency?

> `readonly` `optional` **concurrency?**: `number`

##### onFailure?

> `readonly` `optional` **onFailure?**: `"collect"` \| `"failFast"`

***

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

##### generalist/core/agent-tool/FanOut

> `readonly` **generalist/core/agent-tool/FanOut**: `true`

## Type Aliases

### FanOutMember

> **FanOutMember**\<`Entries`\> = `{ readonly [Name in Selection<Entries>]: { agent: Name; input: Input<AgentAt<Entries, Name>> } }`\[`Selection`\<`Entries`\>\]

One model-authored child request. Array order is the result order.

#### Type Parameters

##### Entries

`Entries` *extends* `Profiles`

## Variables

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

### fanOut

> `const` **fanOut**: *typeof* `makeFanOut`

Declare a model-callable fan-out over an exact set of child Agents.

***

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
