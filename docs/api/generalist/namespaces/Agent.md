[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Agent

# Agent

## Classes

<a id="awaiteventinvalid"></a>

### AwaitEventInvalid

The requested event timeout is not finite and positive.

#### Extends

- `AwaitEventInvalid_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new AwaitEventInvalid**(...`args`): [`AwaitEventInvalid`](#awaiteventinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AwaitEventInvalid`](#awaiteventinvalid)

###### Inherited from

`AwaitEventInvalid_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AwaitEventInvalid_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `"invalid-timeout"`

###### Inherited from

`AwaitEventInvalid_base.reason`

***

<a id="inspector"></a>

### Inspector

#### Extends

- `Inspector_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Inspector**(`_`): [`Inspector`](#inspector)

###### Parameters

###### \_

`never`

###### Returns

[`Inspector`](#inspector)

###### Inherited from

`Inspector_base.constructor`

#### Accessors

<a id="layermemory"></a>

##### layerMemory

###### Get Signature

> **get** `static` **layerMemory**(): `Layer`\<[`Inspector`](#inspector)\>

###### Returns

`Layer`\<[`Inspector`](#inspector)\>

#### Methods

<a id="layertest"></a>

##### layerTest()

> `static` **layerTest**(`implementation`): `Layer`\<[`Inspector`](#inspector)\>

###### Parameters

###### implementation

[`InspectorService`](#inspectorservice)

###### Returns

`Layer`\<[`Inspector`](#inspector)\>

***

<a id="inspectorrunnotfound"></a>

### InspectorRunNotFound

The requested process-local Run is not known to this Inspector.

#### Extends

- `RunNotFound_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new InspectorRunNotFound**(...`args`): [`InspectorRunNotFound`](#inspectorrunnotfound)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`InspectorRunNotFound`](#inspectorrunnotfound)

###### Inherited from

`RunNotFound_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunNotFound_base.hint`

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunNotFound_base.runId`

## Interfaces

<a id="agent"></a>

### Agent

An Agent definition carrying its tools, requirements, input, and output contract.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`never`, `never`\>

##### R

`R` = `LanguageModel.LanguageModel`

##### PolicyServices

`PolicyServices` = `R`

##### AuthorizationServices

`AuthorizationServices` = `R`

##### InputSchema

`InputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

##### OutputSchema

`OutputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

#### Properties

<a id="authorization"></a>

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

<a id="budget"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="capabilities"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: readonly `object`[]

**`Internal`**

Capability descriptors attached only by child inheritance.

<a id="gates"></a>

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

<a id="generalistcoreagent"></a>

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `object`

###### requirements

> `readonly` **requirements**: `Invariant`\<`R`\>

###### tools

> `readonly` **tools**: `Invariant`\<`Tools`\>

<a id="handoff"></a>

##### handoff

> `readonly` **handoff**: \<`A`\>(`f`) => `A`

###### Type Parameters

###### A

`A`

###### Parameters

###### f

(`agent`) => `A`

###### Returns

`A`

<a id="input"></a>

##### input

> `readonly` **input**: `InputSchema`

<a id="instructions"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="memory"></a>

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="ongatefailure"></a>

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

<a id="output"></a>

##### output

> `readonly` **output**: `OutputSchema`

<a id="policy"></a>

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

<a id="sandbox"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

<a id="supplemental"></a>

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

<a id="tooldeclarations"></a>

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`Tools`\>

<a id="toolscheduling"></a>

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

<a id="any"></a>

### Any

One Agent observed where its tool and requirement types are hidden.

#### Extended by

- [`Closed`](#closed)

#### Properties

<a id="authorization-1"></a>

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`unknown`\>

<a id="budget-1"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="capabilities-1"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: readonly `object`[]

**`Internal`**

Capability descriptors attached only by child inheritance.

<a id="gates-1"></a>

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

<a id="generalistcoreagent-1"></a>

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `unknown`

<a id="input-1"></a>

##### input

> `readonly` **input**: `Top`

<a id="instructions-1"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="memory-1"></a>

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

<a id="metadata-1"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="model-1"></a>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="ongatefailure-1"></a>

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

<a id="output-1"></a>

##### output

> `readonly` **output**: `Top`

<a id="policy-1"></a>

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`unknown`\>

<a id="sandbox-1"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

<a id="tooldeclarations-1"></a>

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

<a id="toolkit-1"></a>

##### toolkit

> `readonly` **toolkit**: `Any`

<a id="toolscheduling-1"></a>

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

<a id="awaiteventoptions"></a>

### AwaitEventOptions

#### Properties

<a id="timeout"></a>

##### timeout

> `readonly` **timeout**: `Input`

***

<a id="closed"></a>

### Closed

An Agent closed over its exact environment.

#### Extends

- [`Any`](#any)

#### Properties

<a id="authorization-2"></a>

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`unknown`\>

###### Inherited from

[`Any`](#any).[`authorization`](#authorization-1)

<a id="budget-2"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

###### Inherited from

[`Any`](#any).[`budget`](#budget-1)

<a id="capabilities-2"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: readonly `object`[]

**`Internal`**

Capability descriptors attached only by child inheritance.

###### Inherited from

[`Any`](#any).[`capabilities`](#capabilities-1)

<a id="gates-2"></a>

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

###### Inherited from

[`Any`](#any).[`gates`](#gates-1)

<a id="generalistcoreagent-2"></a>

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `unknown`

###### Inherited from

[`Any`](#any).[`generalist/core/Agent`](#generalistcoreagent-1)

<a id="input-2"></a>

##### input

> `readonly` **input**: `Top`

###### Inherited from

[`Any`](#any).[`input`](#input-1)

<a id="instructions-2"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

###### Inherited from

[`Any`](#any).[`instructions`](#instructions-1)

<a id="memory-2"></a>

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

###### Inherited from

[`Any`](#any).[`memory`](#memory-1)

<a id="metadata-2"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

###### Inherited from

[`Any`](#any).[`metadata`](#metadata-1)

<a id="model-2"></a>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

###### Inherited from

[`Any`](#any).[`model`](#model-1)

<a id="name-2"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

[`Any`](#any).[`name`](#name-1)

<a id="ongatefailure-2"></a>

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

###### Inherited from

[`Any`](#any).[`onGateFailure`](#ongatefailure-1)

<a id="open"></a>

##### open

> `readonly` **open**: \<`A`\>(`f`) => `A`

###### Type Parameters

###### A

`A`

###### Parameters

###### f

[`Opened`](#opened)\<`A`\>

###### Returns

`A`

<a id="output-2"></a>

##### output

> `readonly` **output**: `Top`

###### Inherited from

[`Any`](#any).[`output`](#output-1)

<a id="policy-2"></a>

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`unknown`\>

###### Inherited from

[`Any`](#any).[`policy`](#policy-1)

<a id="sandbox-2"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

###### Inherited from

[`Any`](#any).[`sandbox`](#sandbox-1)

<a id="tooldeclarations-2"></a>

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

###### Inherited from

[`Any`](#any).[`toolDeclarations`](#tooldeclarations-1)

<a id="toolkit-2"></a>

##### toolkit

> `readonly` **toolkit**: `Any`

###### Inherited from

[`Any`](#any).[`toolkit`](#toolkit-1)

<a id="toolscheduling-2"></a>

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

###### Inherited from

[`Any`](#any).[`toolScheduling`](#toolscheduling-1)

***

<a id="handoffagent"></a>

### HandoffAgent

An agent definition: a plain value, not a service.

#### Type Parameters

##### R

`R`

#### Properties

<a id="description"></a>

##### description?

> `readonly` `optional` **description?**: `string`

<a id="name-3"></a>

##### name

> `readonly` **name**: `string`

<a id="requirements"></a>

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

***

<a id="inheritanceoptions"></a>

### InheritanceOptions

Caller-authored child inheritance options. Omitted fields use safe defaults.

#### Extends

- `Partial`\<`Omit`\<[`Inheritance`](#inheritance), `"tools"`\>\>

#### Properties

<a id="budget-3"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

###### Inherited from

`Partial.budget`

<a id="history"></a>

##### history?

> `readonly` `optional` **history?**: `"none"` \| `"summary"` \| `"full"`

###### Inherited from

`Partial.history`

<a id="instructions-3"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `"inherit"` \| `"own"`

###### Inherited from

`Partial.instructions`

<a id="memory-3"></a>

##### memory?

> `readonly` `optional` **memory?**: `"fresh"` \| `"inherit"`

###### Inherited from

`Partial.memory`

<a id="permissions"></a>

##### permissions?

> `readonly` `optional` **permissions?**: `"fresh"` \| `"inherit"`

###### Inherited from

`Partial.permissions`

<a id="sandbox-3"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: `"fresh"` \| `"fork"` \| `"share"`

###### Inherited from

`Partial.sandbox`

<a id="tasks"></a>

##### tasks?

> `readonly` `optional` **tasks?**: `"none"` \| `"read"`

###### Inherited from

`Partial.tasks`

<a id="tools-1"></a>

##### tools?

> `readonly` `optional` **tools?**: `"attenuate"` \| `"same"` \| readonly [`Handle`](../../unstable.capability#handle)\<`Any`\>[]

***

<a id="inspectionsnapshot"></a>

### InspectionSnapshot

Point-in-time process-local state for one Agent Run.

#### Properties

<a id="activetools"></a>

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

<a id="elapsed"></a>

##### elapsed

> `readonly` **elapsed**: `number`

<a id="lastevent"></a>

##### lastEvent?

> `readonly` `optional` **lastEvent?**: [`Event`](./AgentEvent#event)

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

<a id="turn"></a>

##### turn

> `readonly` **turn**: `number`

<a id="usage"></a>

##### usage

> `readonly` **usage**: [`InspectionUsage`](#inspectionusage)

***

<a id="inspectionusage"></a>

### InspectionUsage

Process-local token totals reported by completed model turns.

#### Properties

<a id="inputtokens"></a>

##### inputTokens

> `readonly` **inputTokens**: `number`

<a id="outputtokens"></a>

##### outputTokens

> `readonly` **outputTokens**: `number`

***

<a id="inspectorservice"></a>

### InspectorService

Process-local Agent Run inspection seam.

#### Properties

<a id="publish"></a>

##### publish

> `readonly` **publish**: (`runId`, `event`) => `Effect`\<`void`\>

**`Internal`**

###### Parameters

###### runId

`string`

###### event

[`Event`](./AgentEvent#event)

###### Returns

`Effect`\<`void`\>

<a id="snapshot"></a>

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`InspectionSnapshot`](#inspectionsnapshot), [`InspectorRunNotFound`](#inspectorrunnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`InspectionSnapshot`](#inspectionsnapshot), [`InspectorRunNotFound`](#inspectorrunnotfound)\>

<a id="start"></a>

##### start

> `readonly` **start**: (`runId`) => `Effect`\<`void`\>

**`Internal`**

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

***

<a id="makeoptions"></a>

### MakeOptions

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\> = `Record`\<`never`, `never`\>

##### PolicyServices

`PolicyServices` = `never`

##### AuthorizationServices

`AuthorizationServices` = `never`

##### InputSchema

`InputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

##### OutputSchema

`OutputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

#### Properties

<a id="authorization-3"></a>

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

<a id="budget-4"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="gates-3"></a>

##### gates?

> `readonly` `optional` **gates?**: readonly [`Gate`](./Gate#gate-1)\<`OutputSchema`\[`"Type"`\], `unknown`\>[]

<a id="input-3"></a>

##### input?

> `readonly` `optional` **input?**: `InputSchema`

<a id="instructions-4"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="memory-4"></a>

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

<a id="metadata-3"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

<a id="model-3"></a>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

<a id="name-4"></a>

##### name

> `readonly` **name**: `string`

<a id="ongatefailure-3"></a>

##### onGateFailure?

> `readonly` `optional` **onGateFailure?**: [`FailureMode`](./Gate#failuremode)

<a id="output-3"></a>

##### output?

> `readonly` `optional` **output?**: `OutputSchema`

<a id="policy-3"></a>

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

<a id="sandbox-4"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

<a id="supplemental-1"></a>

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

<a id="toolkit-3"></a>

##### toolkit?

> `readonly` `optional` **toolkit?**: `Toolkit`\<`Tools`\>

<a id="tools-3"></a>

##### tools?

> `readonly` `optional` **tools?**: `undefined`

<a id="toolscheduling-3"></a>

##### toolScheduling?

> `readonly` `optional` **toolScheduling?**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

<a id="maketoolsoptions"></a>

### MakeToolsOptions

Agent options with ordered static declarations instead of a pre-built toolkit.

#### Extends

- `Omit`\<[`MakeOptions`](#makeoptions)\<`Record`\<`never`, `never`\>, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>, `"toolkit"` \| `"tools"`\>

#### Type Parameters

##### StaticTools

`StaticTools` *extends* `ReadonlyArray`\<`Tool.Any`\>

##### PolicyServices

`PolicyServices` = `never`

##### AuthorizationServices

`AuthorizationServices` = `never`

##### InputSchema

`InputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

##### OutputSchema

`OutputSchema` *extends* `Schema.Top` = *typeof* `Schema.String`

#### Properties

<a id="authorization-4"></a>

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

###### Inherited from

`Omit.authorization`

<a id="budget-5"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

###### Inherited from

`Omit.budget`

<a id="gates-4"></a>

##### gates?

> `readonly` `optional` **gates?**: readonly [`Gate`](./Gate#gate-1)\<`OutputSchema`\[`"Type"`\], `unknown`\>[]

###### Inherited from

`Omit.gates`

<a id="input-4"></a>

##### input?

> `readonly` `optional` **input?**: `InputSchema`

###### Inherited from

`Omit.input`

<a id="instructions-5"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

###### Inherited from

`Omit.instructions`

<a id="memory-5"></a>

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

###### Inherited from

`Omit.memory`

<a id="metadata-4"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

###### Inherited from

`Omit.metadata`

<a id="model-4"></a>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

###### Inherited from

`Omit.model`

<a id="name-5"></a>

##### name

> `readonly` **name**: `string`

###### Inherited from

`Omit.name`

<a id="ongatefailure-4"></a>

##### onGateFailure?

> `readonly` `optional` **onGateFailure?**: [`FailureMode`](./Gate#failuremode)

###### Inherited from

`Omit.onGateFailure`

<a id="output-4"></a>

##### output?

> `readonly` `optional` **output?**: `OutputSchema`

###### Inherited from

`Omit.output`

<a id="policy-4"></a>

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

###### Inherited from

`Omit.policy`

<a id="sandbox-5"></a>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

###### Inherited from

`Omit.sandbox`

<a id="supplemental-2"></a>

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

###### Inherited from

`Omit.supplemental`

<a id="toolkit-4"></a>

##### toolkit?

> `readonly` `optional` **toolkit?**: `undefined`

<a id="tools-4"></a>

##### tools

> `readonly` **tools**: `StaticTools`

<a id="toolscheduling-4"></a>

##### toolScheduling?

> `readonly` `optional` **toolScheduling?**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

###### Inherited from

`Omit.toolScheduling`

***

<a id="opened"></a>

### Opened()

Consumer of a hidden Agent identity and its environment.

#### Type Parameters

##### A

`A`

> **Opened**\<`Tools`, `R`, `InputSchema`, `OutputSchema`\>(`agent`, `environment`): `A`

Consumer of a hidden Agent identity and its environment.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

##### R

`R`

##### InputSchema

`InputSchema` *extends* `Top`

##### OutputSchema

`OutputSchema` *extends* `Top`

#### Parameters

##### agent

[`Agent`](#agent)\<`Tools`, `R`, `R`, `R`, `InputSchema`, `OutputSchema`\>

##### environment

`Layer`\<[`ClosedServices`](#closedservices)\<`Tools`, `R`, `InputSchema`, `OutputSchema`\>\>

#### Returns

`A`

***

<a id="resume"></a>

### Resume

#### Properties

<a id="resolutions"></a>

##### resolutions?

> `readonly` `optional` **resolutions?**: readonly `ToolBatchResolution`[]

<a id="suspension"></a>

##### suspension

> `readonly` **suspension**: [`AgentSuspended`](./AgentEvent#agentsuspended)

***

<a id="runhandle"></a>

### RunHandle

Producer capability and event stream owned by one scoped Agent Run.

#### Type Parameters

##### EventValue

`EventValue` = [`Event`](./AgentEvent#event)

##### EventError

`EventError` = [`RunError`](#runerror)

##### EventServices

`EventServices` = `never`

##### ControlReceipt

`ControlReceipt` = [`Receipt`](./Steering#receipt)

##### ControlError

`ControlError` = [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)

#### Properties

<a id="runcontroltypeid"></a>

##### \[RunControlTypeId\]

> `readonly` **\[RunControlTypeId\]**: `object`

###### busy

> `readonly` **busy**: `Effect`\<`boolean`\>

###### interruptTools

> `readonly` **interruptTools**: `Effect`\<`void`\>

###### reject

> `readonly` **reject**: (`input`) => `Effect`\<`ControlReceipt`, [`RunBusy`](./Steering#runbusy) \| `ControlError`\>

###### Parameters

###### input

[`Input`](./Steering#input)

###### Returns

`Effect`\<`ControlReceipt`, [`RunBusy`](./Steering#runbusy) \| `ControlError`\>

<a id="events"></a>

##### events

> `readonly` **events**: `Stream`\<`EventValue`, `EventError`, `EventServices`\>

<a id="followup"></a>

##### followUp

> `readonly` **followUp**: (`input`) => `Effect`\<`ControlReceipt`, `ControlError`\>

###### Parameters

###### input

[`Input`](./Steering#input)

###### Returns

`Effect`\<`ControlReceipt`, `ControlError`\>

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

<a id="steer"></a>

##### steer

> `readonly` **steer**: (`input`) => `Effect`\<`ControlReceipt`, `ControlError`\>

###### Parameters

###### input

[`Input`](./Steering#input)

###### Returns

`Effect`\<`ControlReceipt`, `ControlError`\>

***

<a id="runoptions"></a>

### RunOptions

Internal prompt-level options for an Agent run.

#### Properties

<a id="budget-6"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

Per-run budget narrowing; dimensions omitted inherit the agent default.

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="compaction"></a>

##### compaction?

> `readonly` `optional` **compaction?**: `object`

Context-window hint for optional compaction.

###### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

###### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

<a id="drivercheckpoint"></a>

##### driverCheckpoint?

> `readonly` `optional` **driverCheckpoint?**: `object`

Runtime-owned checkpoint used to reconstruct the same durable driver.

###### budget

> `readonly` **budget**: `object`

###### budget.allocation

> `readonly` **allocation**: `object`

###### budget.allocation.children?

> `readonly` `optional` **children?**: `number`

###### budget.allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### budget.remaining

> `readonly` **remaining**: `object`

###### budget.remaining.children?

> `readonly` `optional` **children?**: `number`

###### budget.remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.remaining.usd?

> `readonly` `optional` **usd?**: `number`

###### driverVersion

> `readonly` **driverVersion**: `string`

###### executable?

> `readonly` `optional` **executable?**: `object`

###### executable.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

> `readonly` **state**: `unknown`

###### turn

> `readonly` **turn**: `number`

<a id="executablemanifest"></a>

##### executableManifest?

> `readonly` `optional` **executableManifest?**: [`ExecutableManifest`](./ExecutableManifest#executablemanifest)

Complete pinned closure used to resolve same-run handoffs exactly.

<a id="executableref"></a>

##### executableRef?

> `readonly` `optional` **executableRef?**: `object`

Pinned identity admitted by a durable host.

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="history-1"></a>

##### history?

> `readonly` `optional` **history?**: `RawInput`

Prior transcript. When set it is used VERBATIM as the initial chat
history (no system message is prepended); otherwise the chat starts
with a system message derived from the agent (see below).

<a id="inheritedbudget"></a>

##### inheritedBudget?

> `readonly` `optional` **inheritedBudget?**: `object`

Pre-reserved child grant from a parent run; not for direct caller use.

###### allocation

> `readonly` **allocation**: `object`

###### allocation.children?

> `readonly` `optional` **children?**: `number`

###### allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### remaining

> `readonly` **remaining**: `object`

###### remaining.children?

> `readonly` `optional` **children?**: `number`

###### remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### remaining.usd?

> `readonly` `optional` **usd?**: `number`

<a id="initialsteering"></a>

##### initialSteering?

> `readonly` `optional` **initialSteering?**: `object`

**`Internal`**

Runtime-owned inbox drain entering this hosted execution.

###### count

> `readonly` **count**: `number`

###### queue

> `readonly` **queue**: `"steering"` \| `"followUp"`

###### turn

> `readonly` **turn**: `number`

<a id="invocation"></a>

##### invocation?

> `readonly` `optional` **invocation?**: `object`

Authoritative invocation facts supplied by a durable host.

###### admittedAt?

> `readonly` `optional` **admittedAt?**: `string`

###### attempt

> `readonly` **attempt**: `number`

###### inheritedSandboxSnapshot?

> `readonly` `optional` **inheritedSandboxSnapshot?**: `Ref`\<`string` \| `undefined`\>

###### rootRunId

> `readonly` **rootRunId**: `string`

###### runId

> `readonly` **runId**: `string`

<a id="logicaloperationid"></a>

##### logicalOperationId?

> `readonly` `optional` **logicalOperationId?**: `string`

Stable host identity for the logical model operations in this run.

<a id="memory-6"></a>

##### memory?

> `readonly` `optional` **memory?**: `object`

Consult the Memory service for this run.

###### key

> `readonly` **key**: [`Key`](./Memory#key-1)

<a id="modelcallordinalstart"></a>

##### modelCallOrdinalStart?

> `readonly` `optional` **modelCallOrdinalStart?**: `number`

First model-call ordinal for a host resuming from a durable checkpoint.

<a id="prompt"></a>

##### prompt

> `readonly` **prompt**: `RawInput`

Schema-encoded Agent input for the first turn. Ignored when `resume` is set.

<a id="resume-1"></a>

##### resume?

> `readonly` `optional` **resume?**: [`Resume`](#resume)

<a id="sessionid"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

Opaque host-assigned identity for this run/session.

<a id="steering"></a>

##### steering?

> `readonly` `optional` **steering?**: [`Options`](./Steering#options)

Finite process-local input policy for this Run.

<a id="suspensionpropagation"></a>

##### suspensionPropagation?

> `readonly` `optional` **suspensionPropagation?**: `"propagate"` \| `"collapse-to-domain-failure"`

<a id="system"></a>

##### system?

> `readonly` `optional` **system?**: `string`

Overrides the derived system message when `history` is not set.

<a id="tooloutputmaxbytes"></a>

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

<a id="toolprogress"></a>

##### toolProgress?

> `readonly` `optional` **toolProgress?**: [`ProgressOverflowPolicy`](#progressoverflowpolicy)

Per-tool bounded buffering policy for progress events. Defaults to backpressure at capacity 64.

<a id="turnstart"></a>

##### turnStart?

> `readonly` `optional` **turnStart?**: `number`

First turn number for a host continuing an existing transcript.

***

<a id="startoptions"></a>

### StartOptions

Typed durable start identity. Budget admission is reserved for the RunBudget contract.

#### Properties

<a id="budget-7"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### allocation

> `readonly` **allocation**: `object`

###### allocation.children?

> `readonly` `optional` **children?**: `number`

###### allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### remaining

> `readonly` **remaining**: `object`

###### remaining.children?

> `readonly` `optional` **children?**: `number`

###### remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### remaining.usd?

> `readonly` `optional` **usd?**: `number`

<a id="idempotencykey"></a>

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

<a id="sessionid-1"></a>

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

<a id="toolcallbatchresume"></a>

### ToolCallBatchResume

Host facts required to recover or resolve one persisted tool-call batch.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Resume"`

<a id="drivercheckpoint-1"></a>

##### driverCheckpoint

> `readonly` **driverCheckpoint**: `object`

###### budget

> `readonly` **budget**: `object`

###### budget.allocation

> `readonly` **allocation**: `object`

###### budget.allocation.children?

> `readonly` `optional` **children?**: `number`

###### budget.allocation.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.allocation.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.allocation.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.allocation.usd?

> `readonly` `optional` **usd?**: `number`

###### budget.remaining

> `readonly` **remaining**: `object`

###### budget.remaining.children?

> `readonly` `optional` **children?**: `number`

###### budget.remaining.duration?

> `readonly` `optional` **duration?**: `number`

###### budget.remaining.tokens?

> `readonly` `optional` **tokens?**: `number`

###### budget.remaining.toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### budget.remaining.usd?

> `readonly` `optional` **usd?**: `number`

###### driverVersion

> `readonly` **driverVersion**: `string`

###### executable?

> `readonly` `optional` **executable?**: `object`

###### executable.active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable.executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### state

> `readonly` **state**: `unknown`

###### turn

> `readonly` **turn**: `number`

<a id="executableref-1"></a>

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="invocation-1"></a>

##### invocation?

> `readonly` `optional` **invocation?**: `object`

###### admittedAt?

> `readonly` `optional` **admittedAt?**: `string`

###### attempt

> `readonly` **attempt**: `number`

###### inheritedSandboxSnapshot?

> `readonly` `optional` **inheritedSandboxSnapshot?**: `Ref`\<`string` \| `undefined`\>

###### rootRunId

> `readonly` **rootRunId**: `string`

###### runId

> `readonly` **runId**: `string`

<a id="messages"></a>

##### messages

> `readonly` **messages**: readonly `Message`[]

<a id="resume-2"></a>

##### resume?

> `readonly` `optional` **resume?**: [`Resume`](#resume)

***

<a id="toolcallbatchstart"></a>

### ToolCallBatchStart

Host facts required before a new externally completed tool-call batch is admitted.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Start"`

<a id="activetools-1"></a>

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

<a id="budget-8"></a>

##### budget?

> `readonly` `optional` **budget?**: `object`

###### children?

> `readonly` `optional` **children?**: `number`

###### duration?

> `readonly` `optional` **duration?**: `number`

###### tokens?

> `readonly` `optional` **tokens?**: `number`

###### toolCalls?

> `readonly` `optional` **toolCalls?**: `number`

###### usd?

> `readonly` `optional` **usd?**: `number`

<a id="calls"></a>

##### calls

> `readonly` **calls**: readonly \[`ToolCallPartEncoded`, `ToolCallPartEncoded`\]

<a id="executableref-2"></a>

##### executableRef?

> `readonly` `optional` **executableRef?**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="invocation-2"></a>

##### invocation?

> `readonly` `optional` **invocation?**: `object`

###### admittedAt?

> `readonly` `optional` **admittedAt?**: `string`

###### attempt

> `readonly` **attempt**: `number`

###### inheritedSandboxSnapshot?

> `readonly` `optional` **inheritedSandboxSnapshot?**: `Ref`\<`string` \| `undefined`\>

###### rootRunId

> `readonly` **rootRunId**: `string`

###### runId

> `readonly` **runId**: `string`

<a id="logicaloperationid-1"></a>

##### logicalOperationId

> `readonly` **logicalOperationId**: `string`

<a id="messages-1"></a>

##### messages

> `readonly` **messages**: readonly `Message`[]

<a id="sessionid-2"></a>

##### sessionId

> `readonly` **sessionId**: `string`

<a id="turn-1"></a>

##### turn

> `readonly` **turn**: `number`

***

<a id="tooldeclaration"></a>

### ToolDeclaration

One origin-preserving static or Handoff tool declaration.

#### Properties

<a id="origin"></a>

##### origin

> `readonly` **origin**: \{ `agent`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}

<a id="tool"></a>

##### tool

> `readonly` **tool**: `Any`

***

<a id="toolschedulingpolicy"></a>

### ToolSchedulingPolicy

Safe scheduling policy for framework-executed calls emitted by one model turn. Tools not explicitly
listed as parallel-safe execute as authored-order exclusive barriers.

#### Properties

<a id="maxconcurrency"></a>

##### maxConcurrency

> `readonly` **maxConcurrency**: `number`

<a id="parallelsafe"></a>

##### parallelSafe

> `readonly` **parallelSafe**: readonly `string`[]

***

<a id="withmodeldefault"></a>

### WithModelDefault

Agent options known to contain a model selection.

#### Properties

<a id="model-5"></a>

##### model

> `readonly` **model**: [`ModelSelection`](./ModelRegistry#modelselection)

## Type Aliases

<a id="awaitevent"></a>

### AwaitEvent

> **AwaitEvent** = *typeof* `AwaitEvent.Type`

Durable metadata carried by a tool suspension created by `Agent.awaitEvent`.

***

<a id="awaiteventresult"></a>

### AwaitEventResult

> **AwaitEventResult** = *typeof* `AwaitEventResult.Type`

Result injected as the terminal result of the awaiting tool call.

***

<a id="closedservices"></a>

### ClosedServices

> **ClosedServices**\<`Tools`, `R`, `InputCodec`, `OutputCodec`\> = `R` \| `ClosedToolServices`\<`Tools`\> \| `InputCodec`\[`"EncodingServices"`\] \| `OutputCodec`\[`"DecodingServices"`\] \| `OutputCodec`\[`"EncodingServices"`\]

Services closed over with an Agent.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### R

`R`

##### InputCodec

`InputCodec` *extends* `Schema.Top` = *typeof* `Schema.String`

##### OutputCodec

`OutputCodec` *extends* `Schema.Top` = *typeof* `Schema.String`

***

<a id="encodedinput"></a>

### EncodedInput

> **EncodedInput**\<`A`\> = `A` *extends* `object` ? `InputCodec`\[`"Encoded"`\] : `never`

Extract an Agent's encoded input type.

#### Type Parameters

##### A

`A`

***

<a id="encodedoutput"></a>

### EncodedOutput

> **EncodedOutput**\<`A`\> = `A` *extends* `object` ? `OutputCodec`\[`"Encoded"`\] : `never`

Extract an Agent's encoded output type.

#### Type Parameters

##### A

`A`

***

<a id="inheritance"></a>

### Inheritance

> **Inheritance** = *typeof* `Inheritance.Type`

Authority and context inherited by one child Run.

***

<a id="input-5"></a>

### Input

> **Input**\<`A`\> = `A` *extends* `object` ? `InputCodec`\[`"Type"`\] : `never`

Extract an Agent's decoded input type.

#### Type Parameters

##### A

`A`

***

<a id="invocationoptions"></a>

### InvocationOptions

> **InvocationOptions** = `Omit`\<[`RunOptions`](#runoptions), `"prompt"`\>

Per-invocation options after the Agent input has moved to the second argument.

***

<a id="output-5"></a>

### Output

> **Output**\<`A`\> = `A` *extends* `object` ? `OutputCodec`\[`"Type"`\] : `never`

Extract an Agent's decoded output type.

#### Type Parameters

##### A

`A`

***

<a id="progressoverflowpolicy"></a>

### ProgressOverflowPolicy

> **ProgressOverflowPolicy** = \{ `_tag`: `"Backpressure"`; `capacity`: `number`; \} \| \{ `_tag`: `"Dropping"`; `capacity`: `number`; \} \| \{ `_tag`: `"Sliding"`; `capacity`: `number`; \} \| \{ `_tag`: `"Fail"`; `capacity`: `number`; \}

Bounded buffering behavior for tool progress events.

***

<a id="requirements-1"></a>

### Requirements

> **Requirements**\<`A`\> = `A` *extends* [`Agent`](#agent)\<infer \_Tools, infer R\> ? `R` : `never`

Extract an agent's runtime requirements.

#### Type Parameters

##### A

`A`

***

<a id="resumeresolution"></a>

### ResumeResolution

> **ResumeResolution** = *typeof* `ResumeResolution.Type`

Decoded re-entry resolution for an authoritative suspension checkpoint.

***

<a id="runerror"></a>

### RunError

> **RunError** = *typeof* `RunError.Type`

The error channel and durable codec of `Agent.run` and `Agent.stream`.

***

<a id="runrequirements"></a>

### RunRequirements

> **RunRequirements**\<`Tools`, `R`, `O`, `InputCodec`, `OutputCodec`, `PolicyServices`, `AuthorizationServices`\> = `R` \| `PolicyServices` \| `AuthorizationServices` \| `StaticToolServices`\<`Tools`\> \| `OperationRequirements`\<`O`\> \| `InputCodec`\[`"EncodingServices"`\] \| `OutputCodec`\[`"DecodingServices"`\] \| `OutputCodec`\[`"EncodingServices"`\]

Services required by one run option set.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### R

`R`

##### O

`O`

##### InputCodec

`InputCodec` *extends* `Schema.Top` = *typeof* `Schema.String`

##### OutputCodec

`OutputCodec` *extends* `Schema.Top` = *typeof* `Schema.String`

##### PolicyServices

`PolicyServices` = `R`

##### AuthorizationServices

`AuthorizationServices` = `R`

***

<a id="senderror"></a>

### SendError

> **SendError** = [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed) \| [`RollbackRequiresRuntime`](./Steering#rollbackrequiresruntime) \| [`RunBusy`](./Steering#runbusy)

***

<a id="startevent"></a>

### StartEvent

> **StartEvent**\<`Output`\> = `Exclude`\<[`RunEvent`](../../runtime/namespaces/RunEvent#runevent), [`RunCompleted`](../../runtime/namespaces/RunEvent#runcompleted)\> \| `Omit`\<[`RunCompleted`](../../runtime/namespaces/RunEvent#runcompleted), `"result"`\> & `object`

Durable Runtime event with Agent completion decoded through its output Schema.

#### Type Parameters

##### Output

`Output`

***

<a id="toolcallbatch"></a>

### ToolCallBatch

> **ToolCallBatch** = readonly \[`Response.ToolCallPartEncoded`, `...ReadonlyArray<Response.ToolCallPartEncoded>`\]

One non-empty externally completed, authored-order framework tool-call batch.

***

<a id="toolcallbatchoptions"></a>

### ToolCallBatchOptions

> **ToolCallBatchOptions** = [`ToolCallBatchStart`](#toolcallbatchstart) \| [`ToolCallBatchResume`](#toolcallbatchresume)

One fresh or persisted externally completed framework tool-call batch.

***

<a id="toolcallbatchrequirements"></a>

### ToolCallBatchRequirements

> **ToolCallBatchRequirements**\<`Tools`, `AuthorizationServices`\> = `AuthorizationServices` \| `StaticToolServices`\<`Tools`\>

Services used by externally completed framework calls; no LanguageModel call is performed.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### AuthorizationServices

`AuthorizationServices`

***

<a id="wakeevent"></a>

### WakeEvent

> **WakeEvent** = *typeof* `WakeEvent.Type`

A typed environmental fact that can resume an awaiting Agent tool call.

***

<a id="wakeeventfilter"></a>

### WakeEventFilter

> **WakeEventFilter** = *typeof* `WakeEventFilter.Type`

Serializable selector persisted with an `Agent.awaitEvent` obligation.

## Variables

<a id="agenttypeid"></a>

### AgentTypeId

> `const` **AgentTypeId**: `"generalist/core/Agent"` = `"generalist/core/Agent"`

***

<a id="allocaterun"></a>

### allocateRun

> `const` **allocateRun**: \{\<`O`\>(`options`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => `Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`, `O`\>(`agent`, `options`): `Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>; \}

**`Internal`**

Allocate one scoped Run and its producer handle before consuming its event stream.

#### Call Signature

> \<`O`\>(`options`): \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => `Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>

##### Type Parameters

###### O

`O` *extends* [`RunOptions`](#runoptions)

##### Parameters

###### options

`O`

##### Returns

\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => `Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`, `O`\>(`agent`, `options`): `Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputSchema

`InputSchema` *extends* `Top`

###### OutputSchema

`OutputSchema` *extends* `Top`

###### O

`O` *extends* [`RunOptions`](#runoptions)

##### Parameters

###### agent

[`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

###### options

`O`

##### Returns

`Effect`\<[`RunHandle`](#runhandle)\<[`Event`](./AgentEvent#event)\<`OutputSchema`\[`"Type"`\]\>, `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`RunRequirements`](#runrequirements)\<`Tools`, `R`, `O`, `String`, `OutputSchema`, `PolicyServices`, `AuthorizationServices`\>, \{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed)\>, [`PolicyInvalid`](./Steering#policyinvalid), `Scope`\>

***

<a id="awaitevent-1"></a>

### awaitEvent

> `const` **awaitEvent**: \{(`options`): (`filter`) => `Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<..., ...\>; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>; (`filter`, `options`): `Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<`Schema.String`, `Schema.String`\>; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly ...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>; \}

Suspend the current durable tool call until a matching environmental event or timeout.

This is a terminal tool-handler Effect: durable resume injects `AwaitEventResult` as that tool
call's result rather than re-running JavaScript after this Effect.

#### Call Signature

> (`options`): (`filter`) => `Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<..., ...\>; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>

##### Parameters

###### options

[`AwaitEventOptions`](#awaiteventoptions)

##### Returns

(`filter`) => `Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<..., ...\>; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>

#### Call Signature

> (`filter`, `options`): `Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<`Schema.String`, `Schema.String`\>; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly ...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>

##### Parameters

###### filter

\{ `scheduleId?`: `Schema.optionalKey`\<`Schema.String`\>; \} \| \{ `source?`: `Schema.optionalKey`\<`Schema.String`\>; \} \| \{ `childRunId?`: `Schema.optionalKey`\<`Schema.String`\>; \} \| \{ `kind?`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"create"`, `"update"`, `"remove"`\]\>\>; `path?`: `Schema.optionalKey`\<`Schema.String`\>; \} \| \{ `approvalId?`: `Schema.optionalKey`\<`Schema.String`\>; \}

###### options

[`AwaitEventOptions`](#awaiteventoptions)

##### Returns

`Effect`\<\{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<`Schema.String`, `Schema.String`\>; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<readonly ...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly ...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \} \| \{ `deadline`: `Schema.String`; \}, [`AwaitEventInvalid`](#awaiteventinvalid), [`ToolContext`](./ToolContext#toolcontext)\>

***

<a id="awaitevent-2"></a>

### AwaitEvent

> `const` **AwaitEvent**: `Schema.Struct`\<\{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `scheduleId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `kind`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ...\]\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>; \}\>

Durable metadata carried by a tool suspension created by `Agent.awaitEvent`.

***

<a id="awaiteventresult-1"></a>

### AwaitEventResult

> `const` **AwaitEventResult**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Event"`, \{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<..., ...\>; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \}\>, `Schema.TaggedStruct`\<`"TimedOut"`, \{ `deadline`: `Schema.String`; \}\>\]\>

Result injected as the terminal result of the awaiting tool call.

***

<a id="child"></a>

### child

> `const` **child**: \{\<`A`\>(`input`, `options?`): (`agent`) => `Child`\<`A`\>; \<`A`\>(`agent`, `input`, `options?`): `Child`\<`A`\>; \}

Construct one lazy typed child invocation.

#### Call Signature

> \<`A`\>(`input`, `options?`): (`agent`) => `Child`\<`A`\>

##### Type Parameters

###### A

`A` *extends* [`Any`](#any)

##### Parameters

###### input

[`Input`](#input-5)\<`A`\>

###### options?

###### inherit?

[`InheritanceOptions`](#inheritanceoptions)

##### Returns

(`agent`) => `Child`\<`A`\>

#### Call Signature

> \<`A`\>(`agent`, `input`, `options?`): `Child`\<`A`\>

##### Type Parameters

###### A

`A` *extends* [`Any`](#any)

##### Parameters

###### agent

`A`

###### input

[`Input`](#input-5)\<`A`\>

###### options?

###### inherit?

[`InheritanceOptions`](#inheritanceoptions)

##### Returns

`Child`\<`A`\>

***

<a id="close"></a>

### close

> `const` **close**: \{\<`Tools`, `R`\>(`environment`): \<`PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Closed`](#closed); \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `environment`): [`Closed`](#closed); \}

Close one Agent over the exact environment it requires.

#### Call Signature

> \<`Tools`, `R`\>(`environment`): \<`PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Closed`](#closed)

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

##### Parameters

###### environment

`Layer`\<`NoInfer`\<[`ClosedServices`](#closedservices)\<`Tools`, `R`, `String`, `String`\>\>\>

##### Returns

\<`PolicyServices`, `AuthorizationServices`\>(`agent`) => [`Closed`](#closed)

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `environment`): [`Closed`](#closed)

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputSchema

`InputSchema` *extends* `Top`

###### OutputSchema

`OutputSchema` *extends* `Top`

##### Parameters

###### agent

[`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

###### environment

`Layer`\<`NoInfer`\<[`ClosedServices`](#closedservices)\<`Tools`, `R`, `InputSchema`, `OutputSchema`\>\>\>

##### Returns

[`Closed`](#closed)

***

<a id="defaultinheritance"></a>

### defaultInheritance

> `const` **defaultInheritance**: [`Inheritance`](#inheritance)

Safe child inheritance defaults.

***

<a id="defaultobjectprompt"></a>

### defaultObjectPrompt

> `const` **defaultObjectPrompt**: `"Return the final structured output for the task above."` = `"Return the final structured output for the task above."`

Default prompt for the terminal structured-output turn.

***

<a id="fanout"></a>

### fanOut

> `const` **fanOut**: `FanOut`

Run typed child Agents concurrently in-process without requiring a Runtime.

***

<a id="inheritance-1"></a>

### inheritance

> `const` **inheritance**: (`options?`) => [`Inheritance`](#inheritance)

Normalize one child inheritance record before execution or journaling.

#### Parameters

##### options?

[`InheritanceOptions`](#inheritanceoptions) \| [`Inheritance`](#inheritance)

#### Returns

[`Inheritance`](#inheritance)

***

<a id="inheritance-2"></a>

### Inheritance

> `const` **Inheritance**: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `history`: `Schema.Literals`\<readonly \[`"none"`, `"summary"`, `"full"`\]\>; `instructions`: `Schema.Literals`\<readonly \[`"inherit"`, `"own"`\]\>; `memory`: `Schema.Literals`\<readonly \[`"inherit"`, `"fresh"`\]\>; `permissions`: `Schema.Literals`\<readonly \[`"inherit"`, `"fresh"`\]\>; `sandbox`: `Schema.Literals`\<readonly \[`"share"`, `"fork"`, `"fresh"`\]\>; `tasks`: `Schema.Literals`\<readonly \[`"read"`, `"none"`\]\>; `tools`: `Schema.Union`\<readonly \[`Schema.Literals`\<readonly \[`"attenuate"`, `"same"`\]\>, `Schema.$Array`\<`Schema.Struct`\<\{ `expiresAt`: `Schema.Finite`; `id`: `Schema.brand`\<`Schema.String`, `"generalist/capability/CapabilityId"`\>; `lineage`: `Schema.$Array`\<`Schema.Union`\<readonly ...\>\>; `scope`: `Schema.$Record`\<`Schema.String`, `Schema.$Array`\<`Schema.String`\>\>; `tool`: `Schema.String`; \}\>\>\]\>; \}\>

Authority and context inherited by one child Run.

***

<a id="resumeresolution-1"></a>

### ResumeResolution

> `const` **ResumeResolution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\]\>

Re-entry resolution for an authoritative suspension checkpoint.

***

<a id="run"></a>

### run

> `const` **run**: `RunFunction`

Run an Agent to its schema-decoded output.

***

<a id="runerror-1"></a>

### RunError

> `const` **RunError**: `Schema.Union`\<readonly \[*typeof* [`SinkFailed`](./ModelTelemetry#sinkfailed), *typeof* [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed), *typeof* [`HookFailed`](../../hooks#hookfailed), *typeof* [`GateFailed`](./Gate#gatefailed), *typeof* [`AgentError`](./AgentEvent#agenterror), *typeof* [`ChildExceedsParent`](./AgentEvent#childexceedsparent), *typeof* [`InvalidOutput`](./AgentEvent#invalidoutput), *typeof* [`AgentSuspended`](./AgentEvent#agentsuspended), *typeof* [`ResumeMismatch`](./AgentEvent#resumemismatch), *typeof* [`PolicyError`](./Policy-1#policyerror), *typeof* [`PolicyStopped`](./AgentEvent#policystopped), *typeof* [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded), *typeof* [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput), *typeof* [`MiddlewareViolation`](./AgentEvent#middlewareviolation), *typeof* [`Misconfigured`](./ModelResilience#misconfigured), *typeof* [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters), *typeof* [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing), *typeof* [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid), *typeof* [`ProgressOverflow`](./AgentEvent#progressoverflow), *typeof* [`ToolNameCollision`](./AgentEvent#toolnamecollision), *typeof* `AiError.AiError`, *typeof* [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered), *typeof* [`PermissionDenied`](./ToolAuthorization#permissiondenied), *typeof* [`FrameworkFailure`](./ToolExecutor#frameworkfailure), *typeof* [`DriverError`](./DurableDriver#drivererror), *typeof* [`DriverStateInvalid`](./DurableDriver#driverstateinvalid), *typeof* [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay), *typeof* [`Suspended`](./NestedOperation#suspended), *typeof* [`Exhausted`](./RunBudget#exhausted), *typeof* `TargetMissing`, *typeof* `HandoffLimitExceeded`, *typeof* `HandoffRequirementsMissing`, *typeof* [`ProjectionInvalid`](./Handoff#projectioninvalid), *typeof* [`Rejected`](./Handoff#rejected), *typeof* [`PolicyInvalid`](./Steering#policyinvalid)\]\>

The error channel and durable codec of `Agent.run` and `Agent.stream`.

***

<a id="send"></a>

### send

> `const` **send**: \{(`message`, `policy`): \<`EventValue`, `EventError`, `EventServices`\>(`handle`) => `Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>; \<`EventValue`, `EventError`, `EventServices`\>(`handle`, `message`, `policy`): `Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>; \}

Admit one message to a process-local Run under an explicit policy.

#### Call Signature

> (`message`, `policy`): \<`EventValue`, `EventError`, `EventServices`\>(`handle`) => `Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>

##### Parameters

###### message

`string` \| `Prompt`

###### policy

`"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

##### Returns

\<`EventValue`, `EventError`, `EventServices`\>(`handle`) => `Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>

#### Call Signature

> \<`EventValue`, `EventError`, `EventServices`\>(`handle`, `message`, `policy`): `Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>

##### Type Parameters

###### EventValue

`EventValue`

###### EventError

`EventError`

###### EventServices

`EventServices`

##### Parameters

###### handle

[`RunHandle`](#runhandle)\<`EventValue`, `EventError`, `EventServices`\>

###### message

`string` \| `Prompt`

###### policy

`"enqueue"` \| `"interrupt"` \| `"reject"` \| `"rollback"` \| `"steer"`

##### Returns

`Effect`\<\{ `bytes`: `Schema.Int`; `queue`: `Schema.Literals`\<readonly \[`"steering"`, `"followUp"`\]\>; `runId`: `Schema.String`; `sequence`: `Schema.Int`; \}, [`SendError`](#senderror)\>

***

<a id="start-1"></a>

### start

> `const` **start**: `StartFunction`

Start an Agent previously registered with the durable Runtime.

***

<a id="stream"></a>

### stream

> `const` **stream**: `StreamFunction`

Stream an Agent run as Events ending in `Completed { output }`.

***

<a id="streamtoolcalls"></a>

### streamToolCalls

> `const` **streamToolCalls**: \{(`options`): \<`Tools`, `R`, `P`, `A`\>(`agent`) => `Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>; \<`Tools`, `R`, `P`, `A`\>(`agent`, `options`): `Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>; \}

Execute one externally completed tool-call batch without invoking a LanguageModel.

#### Call Signature

> (`options`): \<`Tools`, `R`, `P`, `A`\>(`agent`) => `Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>

##### Parameters

###### options

[`ToolCallBatchOptions`](#toolcallbatchoptions)

##### Returns

\<`Tools`, `R`, `P`, `A`\>(`agent`) => `Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>

#### Call Signature

> \<`Tools`, `R`, `P`, `A`\>(`agent`, `options`): `Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### P

`P`

###### A

`A`

##### Parameters

###### agent

[`Agent`](#agent)\<`Tools`, `R`, `P`, `A`\>

###### options

[`ToolCallBatchOptions`](#toolcallbatchoptions)

##### Returns

`Stream`\<[`Event`](./AgentEvent#event), `AiError` \| [`HookFailed`](../../hooks#hookfailed) \| [`Exhausted`](./RunBudget#exhausted) \| [`AgentError`](./AgentEvent#agenterror) \| [`GateFailed`](./Gate#gatefailed) \| [`PermissionDenied`](./ToolAuthorization#permissiondenied) \| [`ResumeMismatch`](./AgentEvent#resumemismatch) \| [`DriverStateInvalid`](./DurableDriver#driverstateinvalid) \| [`AgentSuspended`](./AgentEvent#agentsuspended) \| [`Suspended`](./NestedOperation#suspended) \| [`ChildExceedsParent`](./AgentEvent#childexceedsparent) \| [`InvalidOutput`](./AgentEvent#invalidoutput) \| [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded) \| [`PolicyStopped`](./AgentEvent#policystopped) \| [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput) \| [`MiddlewareViolation`](./AgentEvent#middlewareviolation) \| [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid) \| [`ProgressOverflow`](./AgentEvent#progressoverflow) \| [`ToolNameCollision`](./AgentEvent#toolnamecollision) \| [`DriverError`](./DurableDriver#drivererror) \| [`SinkFailed`](./ModelTelemetry#sinkfailed) \| [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed) \| [`PolicyError`](./Policy-1#policyerror) \| [`Misconfigured`](./ModelResilience#misconfigured) \| [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters) \| [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing) \| [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered) \| [`FrameworkFailure`](./ToolExecutor#frameworkfailure) \| [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay) \| `TargetMissing` \| `HandoffLimitExceeded` \| `HandoffRequirementsMissing` \| [`ProjectionInvalid`](./Handoff#projectioninvalid) \| [`Rejected`](./Handoff#rejected) \| [`PolicyInvalid`](./Steering#policyinvalid), [`ToolCallBatchRequirements`](#toolcallbatchrequirements)\<`Tools`, `A`\>\>

***

<a id="wakeevent-1"></a>

### WakeEvent

> `const` **WakeEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<`Schema.String`, `Schema.String`\>; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"create"`, `"update"`, `"remove"`\]\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>\]\>; `dedupeKey`: `Schema.String`; \}\>\]\>

A typed environmental fact that can resume an awaiting Agent tool call.

***

<a id="wakeeventfilter-1"></a>

### WakeEventFilter

> `const` **WakeEventFilter**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `scheduleId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `kind`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"create"`, `"update"`, `"remove"`\]\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>

Serializable selector persisted with an `Agent.awaitEvent` obligation.

***

<a id="withtools"></a>

### withTools

> `const` **withTools**: \{\<`Tools`, `R`\>(`declared`): \<`PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `declared`): [`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>; \}

Add host-owned tools while preserving an Agent's requirements.

#### Call Signature

> \<`Tools`, `R`\>(`declared`): \<`PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

##### Parameters

###### declared

readonly `Any`[]

##### Returns

\<`PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`) => [`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>(`agent`, `declared`): [`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

###### InputSchema

`InputSchema` *extends* `Top`

###### OutputSchema

`OutputSchema` *extends* `Top`

##### Parameters

###### agent

[`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

###### declared

readonly `Any`[]

##### Returns

[`Agent`](#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `InputSchema`, `OutputSchema`\>

## Functions

<a id="make"></a>

### make()

#### Call Signature

> **make**\<`StaticTools`, `O`\>(`options`): [`Agent`](#agent)\<`ToolsByName`\<`StaticTools`\>, `OptionRequirements`\<`ToolsByName`\<`StaticTools`\>, `O`\>, `PolicyRequirement`\<`O`\>, `AuthorizationRequirement`\<`O`\>, `InputCodecOf`\<`O`\>, `OutputCodecOf`\<`O`\>\>

Defaults: empty toolkit, `defaultPolicy`.

##### Type Parameters

###### StaticTools

`StaticTools` *extends* readonly `Any`[]

###### O

`O` *extends* `MakeToolsOptionsConstraint`\<`StaticTools`\> = [`MakeToolsOptions`](#maketoolsoptions)\<`StaticTools`, `never`, `never`, `String`, `String`\>

##### Parameters

###### options

`Omit`\<[`MakeToolsOptions`](#maketoolsoptions)\<`StaticTools`, `unknown`, `unknown`, `Top`, `Top`\>, `"gates"`\> & `object` & `O` & `GateOutputConstraint`\<`O`\>

##### Returns

[`Agent`](#agent)\<`ToolsByName`\<`StaticTools`\>, `OptionRequirements`\<`ToolsByName`\<`StaticTools`\>, `O`\>, `PolicyRequirement`\<`O`\>, `AuthorizationRequirement`\<`O`\>, `InputCodecOf`\<`O`\>, `OutputCodecOf`\<`O`\>\>

#### Call Signature

> **make**\<`Tools`, `O`\>(`options`): [`Agent`](#agent)\<`Tools`, `OptionRequirements`\<`Tools`, `O`\>, `PolicyRequirement`\<`O`\>, `AuthorizationRequirement`\<`O`\>, `InputCodecOf`\<`O`\>, `OutputCodecOf`\<`O`\>\>

Defaults: empty toolkit, `defaultPolicy`.

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\> = `Record`\<`never`, `never`\>

###### O

`O` *extends* `MakeOptionsConstraint`\<`Tools`\> = [`MakeOptions`](#makeoptions)\<`Tools`, `never`, `never`, `String`, `String`\>

##### Parameters

###### options

`Omit`\<[`MakeOptions`](#makeoptions)\<`Tools`, `unknown`, `unknown`, `Top`, `Top`\>, `"gates"`\> & `object` & `O` & `GateOutputConstraint`\<`O`\>

##### Returns

[`Agent`](#agent)\<`Tools`, `OptionRequirements`\<`Tools`, `O`\>, `PolicyRequirement`\<`O`\>, `AuthorizationRequirement`\<`O`\>, `InputCodecOf`\<`O`\>, `OutputCodecOf`\<`O`\>\>
