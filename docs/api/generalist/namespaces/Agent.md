[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / Agent

# Agent

## Classes

### AwaitEventInvalid

The requested event timeout is not finite and positive.

#### Extends

- `AwaitEventInvalid_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`AwaitEventInvalid_base.hint`

##### reason

> `readonly` **reason**: `"invalid-timeout"`

###### Inherited from

`AwaitEventInvalid_base.reason`

***

### Inspector

#### Extends

- `Inspector_base`

#### Constructors

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

##### layerMemory

###### Get Signature

> **get** `static` **layerMemory**(): `Layer`\<[`Inspector`](#inspector)\>

###### Returns

`Layer`\<[`Inspector`](#inspector)\>

#### Methods

##### layerTest()

> `static` **layerTest**(`implementation`): `Layer`\<[`Inspector`](#inspector)\>

###### Parameters

###### implementation

[`InspectorService`](#inspectorservice)

###### Returns

`Layer`\<[`Inspector`](#inspector)\>

***

### InspectorRunNotFound

The requested process-local Run is not known to this Inspector.

#### Extends

- `RunNotFound_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RunNotFound_base.hint`

##### runId

> `readonly` **runId**: `string`

###### Inherited from

`RunNotFound_base.runId`

## Interfaces

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

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

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

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `object`

###### requirements

> `readonly` **requirements**: `Invariant`\<`R`\>

###### tools

> `readonly` **tools**: `Invariant`\<`Tools`\>

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

##### input

> `readonly` **input**: `InputSchema`

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

##### name

> `readonly` **name**: `string`

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

##### output

> `readonly` **output**: `OutputSchema`

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`Tools`\>

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

### Any

One Agent observed where its tool and requirement types are hidden.

#### Extended by

- [`Closed`](#closed)

#### Properties

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`unknown`\>

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

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `unknown`

##### input

> `readonly` **input**: `Top`

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

##### name

> `readonly` **name**: `string`

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

##### output

> `readonly` **output**: `Top`

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`unknown`\>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

##### toolkit

> `readonly` **toolkit**: `Any`

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

### AwaitEventOptions

#### Properties

##### timeout

> `readonly` **timeout**: `Input`

***

### Closed

An Agent closed over its exact environment.

#### Extends

- [`Any`](#any)

#### Properties

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`unknown`\>

###### Inherited from

[`Any`](#any).[`authorization`](#authorization-1)

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

##### gates

> `readonly` **gates**: readonly [`Any`](./Gate#any)[]

###### Inherited from

[`Any`](#any).[`gates`](#gates-1)

##### generalist/core/Agent

> `readonly` **generalist/core/Agent**: `unknown`

###### Inherited from

[`Any`](#any).[`generalist/core/Agent`](#generalistcoreagent-1)

##### input

> `readonly` **input**: `Top`

###### Inherited from

[`Any`](#any).[`input`](#input-1)

##### instructions?

> `readonly` `optional` **instructions?**: `string`

###### Inherited from

[`Any`](#any).[`instructions`](#instructions-1)

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

###### Inherited from

[`Any`](#any).[`memory`](#memory-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

###### Inherited from

[`Any`](#any).[`metadata`](#metadata-1)

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

###### Inherited from

[`Any`](#any).[`model`](#model-1)

##### name

> `readonly` **name**: `string`

###### Inherited from

[`Any`](#any).[`name`](#name-1)

##### onGateFailure

> `readonly` **onGateFailure**: [`FailureMode`](./Gate#failuremode)

###### Inherited from

[`Any`](#any).[`onGateFailure`](#ongatefailure-1)

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

##### output

> `readonly` **output**: `Top`

###### Inherited from

[`Any`](#any).[`output`](#output-1)

##### policy

> `readonly` **policy**: [`Policy`](./Policy-1#policy)\<`unknown`\>

###### Inherited from

[`Any`](#any).[`policy`](#policy-1)

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

###### Inherited from

[`Any`](#any).[`sandbox`](#sandbox-1)

##### toolDeclarations?

> `readonly` `optional` **toolDeclarations?**: readonly [`ToolDeclaration`](#tooldeclaration)[]

###### Inherited from

[`Any`](#any).[`toolDeclarations`](#tooldeclarations-1)

##### toolkit

> `readonly` **toolkit**: `Any`

###### Inherited from

[`Any`](#any).[`toolkit`](#toolkit-1)

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

###### Inherited from

[`Any`](#any).[`toolScheduling`](#toolscheduling-1)

***

### HandoffAgent

An agent definition: a plain value, not a service.

#### Type Parameters

##### R

`R`

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### name

> `readonly` **name**: `string`

##### requirements

> `readonly` **requirements**: (`value`) => `R`

###### Parameters

###### value

`R`

###### Returns

`R`

***

### InspectionSnapshot

Point-in-time process-local state for one Agent Run.

#### Properties

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

##### elapsed

> `readonly` **elapsed**: `number`

##### lastEvent?

> `readonly` `optional` **lastEvent?**: [`Event`](./AgentEvent#event)

##### runId

> `readonly` **runId**: `string`

##### turn

> `readonly` **turn**: `number`

##### usage

> `readonly` **usage**: [`InspectionUsage`](#inspectionusage)

***

### InspectionUsage

Process-local token totals reported by completed model turns.

#### Properties

##### inputTokens

> `readonly` **inputTokens**: `number`

##### outputTokens

> `readonly` **outputTokens**: `number`

***

### InspectorService

Process-local Agent Run inspection seam.

#### Properties

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

##### snapshot

> `readonly` **snapshot**: (`runId`) => `Effect`\<[`InspectionSnapshot`](#inspectionsnapshot), [`InspectorRunNotFound`](#inspectorrunnotfound)\>

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<[`InspectionSnapshot`](#inspectionsnapshot), [`InspectorRunNotFound`](#inspectorrunnotfound)\>

##### start

> `readonly` **start**: (`runId`) => `Effect`\<`void`\>

**`Internal`**

###### Parameters

###### runId

`string`

###### Returns

`Effect`\<`void`\>

***

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

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

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

##### gates?

> `readonly` `optional` **gates?**: readonly [`Gate`](./Gate#gate-1)\<`OutputSchema`\[`"Type"`\], `unknown`\>[]

##### input?

> `readonly` `optional` **input?**: `InputSchema`

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

##### name

> `readonly` **name**: `string`

##### onGateFailure?

> `readonly` `optional` **onGateFailure?**: [`FailureMode`](./Gate#failuremode)

##### output?

> `readonly` `optional` **output?**: `OutputSchema`

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

##### toolkit?

> `readonly` `optional` **toolkit?**: `Toolkit`\<`Tools`\>

##### tools?

> `readonly` `optional` **tools?**: `undefined`

##### toolScheduling?

> `readonly` `optional` **toolScheduling?**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

***

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

##### authorization?

> `readonly` `optional` **authorization?**: [`Authorizer`](./ToolAuthorization#authorizer)\<`AuthorizationServices`\>

###### Inherited from

`Omit.authorization`

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

##### gates?

> `readonly` `optional` **gates?**: readonly [`Gate`](./Gate#gate-1)\<`OutputSchema`\[`"Type"`\], `unknown`\>[]

###### Inherited from

`Omit.gates`

##### input?

> `readonly` `optional` **input?**: `InputSchema`

###### Inherited from

`Omit.input`

##### instructions?

> `readonly` `optional` **instructions?**: `string`

###### Inherited from

`Omit.instructions`

##### memory?

> `readonly` `optional` **memory?**: [`Key`](./Memory#key-1)

###### Inherited from

`Omit.memory`

##### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `Json`\>\>

###### Inherited from

`Omit.metadata`

##### model?

> `readonly` `optional` **model?**: [`ModelSelection`](./ModelRegistry#modelselection)

###### Inherited from

`Omit.model`

##### name

> `readonly` **name**: `string`

###### Inherited from

`Omit.name`

##### onGateFailure?

> `readonly` `optional` **onGateFailure?**: [`FailureMode`](./Gate#failuremode)

###### Inherited from

`Omit.onGateFailure`

##### output?

> `readonly` `optional` **output?**: `OutputSchema`

###### Inherited from

`Omit.output`

##### policy?

> `readonly` `optional` **policy?**: [`Policy`](./Policy-1#policy)\<`PolicyServices`\>

###### Inherited from

`Omit.policy`

##### sandbox?

> `readonly` `optional` **sandbox?**: [`SandboxService`](../../sandbox#sandboxservice)

###### Inherited from

`Omit.sandbox`

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

###### Inherited from

`Omit.supplemental`

##### toolkit?

> `readonly` `optional` **toolkit?**: `undefined`

##### tools

> `readonly` **tools**: `StaticTools`

##### toolScheduling?

> `readonly` `optional` **toolScheduling?**: [`ToolSchedulingPolicy`](#toolschedulingpolicy)

###### Inherited from

`Omit.toolScheduling`

***

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

### Resume

#### Properties

##### resolutions?

> `readonly` `optional` **resolutions?**: readonly `ToolBatchResolution`[]

##### suspension

> `readonly` **suspension**: [`AgentSuspended`](./AgentEvent#agentsuspended)

***

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

##### events

> `readonly` **events**: `Stream`\<`EventValue`, `EventError`, `EventServices`\>

##### followUp

> `readonly` **followUp**: (`input`) => `Effect`\<`ControlReceipt`, `ControlError`\>

###### Parameters

###### input

[`Input`](./Steering#input)

###### Returns

`Effect`\<`ControlReceipt`, `ControlError`\>

##### runId

> `readonly` **runId**: `string`

##### steer

> `readonly` **steer**: (`input`) => `Effect`\<`ControlReceipt`, `ControlError`\>

###### Parameters

###### input

[`Input`](./Steering#input)

###### Returns

`Effect`\<`ControlReceipt`, `ControlError`\>

***

### RunOptions

Internal prompt-level options for an Agent run.

#### Properties

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

##### compaction?

> `readonly` `optional` **compaction?**: `object`

Context-window hint for optional compaction.

###### contextWindow?

> `readonly` `optional` **contextWindow?**: `number`

###### reserveTokens?

> `readonly` `optional` **reserveTokens?**: `number`

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

##### executableManifest?

> `readonly` `optional` **executableManifest?**: [`ExecutableManifest`](./ExecutableManifest#executablemanifest)

Complete pinned closure used to resolve same-run handoffs exactly.

##### executableRef?

> `readonly` `optional` **executableRef?**: `object`

Pinned identity admitted by a durable host.

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### history?

> `readonly` `optional` **history?**: `RawInput`

Prior transcript. When set it is used VERBATIM as the initial chat
history (no system message is prepended); otherwise the chat starts
with a system message derived from the agent (see below).

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

##### logicalOperationId?

> `readonly` `optional` **logicalOperationId?**: `string`

Stable host identity for the logical model operations in this run.

##### memory?

> `readonly` `optional` **memory?**: `object`

Consult the Memory service for this run.

###### key

> `readonly` **key**: [`Key`](./Memory#key-1)

##### modelCallOrdinalStart?

> `readonly` `optional` **modelCallOrdinalStart?**: `number`

First model-call ordinal for a host resuming from a durable checkpoint.

##### prompt

> `readonly` **prompt**: `RawInput`

Schema-encoded Agent input for the first turn. Ignored when `resume` is set.

##### resume?

> `readonly` `optional` **resume?**: [`Resume`](#resume)

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

Opaque host-assigned identity for this run/session.

##### steering?

> `readonly` `optional` **steering?**: [`Options`](./Steering#options)

Finite process-local input policy for this Run.

##### suspensionPropagation?

> `readonly` `optional` **suspensionPropagation?**: `"propagate"` \| `"collapse-to-domain-failure"`

##### system?

> `readonly` `optional` **system?**: `string`

Overrides the derived system message when `history` is not set.

##### toolOutputMaxBytes?

> `readonly` `optional` **toolOutputMaxBytes?**: `number`

##### toolProgress?

> `readonly` `optional` **toolProgress?**: [`ProgressOverflowPolicy`](#progressoverflowpolicy)

Per-tool bounded buffering policy for progress events. Defaults to backpressure at capacity 64.

##### turnStart?

> `readonly` `optional` **turnStart?**: `number`

First turn number for a host continuing an existing transcript.

***

### StartOptions

Typed durable start identity. Budget admission is reserved for the RunBudget contract.

#### Properties

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

##### idempotencyKey?

> `readonly` `optional` **idempotencyKey?**: `string`

##### sessionId?

> `readonly` `optional` **sessionId?**: `string`

***

### ToolCallBatchResume

Host facts required to recover or resolve one persisted tool-call batch.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Resume"`

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

##### executableRef

> `readonly` **executableRef**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

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

##### messages

> `readonly` **messages**: readonly `Message`[]

##### resume?

> `readonly` `optional` **resume?**: [`Resume`](#resume)

***

### ToolCallBatchStart

Host facts required before a new externally completed tool-call batch is admitted.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Start"`

##### activeTools

> `readonly` **activeTools**: readonly `string`[]

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

##### calls

> `readonly` **calls**: readonly \[`ToolCallPartEncoded`, `ToolCallPartEncoded`\]

##### executableRef?

> `readonly` `optional` **executableRef?**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

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

##### logicalOperationId

> `readonly` **logicalOperationId**: `string`

##### messages

> `readonly` **messages**: readonly `Message`[]

##### sessionId

> `readonly` **sessionId**: `string`

##### turn

> `readonly` **turn**: `number`

***

### ToolDeclaration

One origin-preserving static or Handoff tool declaration.

#### Properties

##### origin

> `readonly` **origin**: \{ `agent`: `string`; \} \| \{ `mode`: `"same-run"` \| `"delegate"`; `specialist`: `string`; \}

##### tool

> `readonly` **tool**: `Any`

***

### ToolSchedulingPolicy

Safe scheduling policy for framework-executed calls emitted by one model turn. Tools not explicitly
listed as parallel-safe execute as authored-order exclusive barriers.

#### Properties

##### maxConcurrency

> `readonly` **maxConcurrency**: `number`

##### parallelSafe

> `readonly` **parallelSafe**: readonly `string`[]

***

### WithModelDefault

Agent options known to contain a model selection.

#### Properties

##### model

> `readonly` **model**: [`ModelSelection`](./ModelRegistry#modelselection)

## Type Aliases

### AwaitEvent

> **AwaitEvent** = *typeof* `AwaitEvent.Type`

Durable metadata carried by a tool suspension created by `Agent.awaitEvent`.

***

### AwaitEventResult

> **AwaitEventResult** = *typeof* `AwaitEventResult.Type`

Result injected as the terminal result of the awaiting tool call.

***

### ClosedServices

> **ClosedServices**\<`Tools`, `R`, `InputCodec`, `OutputCodec`\> = `R` \| `HandlersFor`\<`Tools`\> \| `Exclude`\<`Tool.HandlerServices`\<`Tools`\[keyof `Tools`\]\>, [`ToolContext`](./ToolContext#toolcontext)\> \| `InputCodec`\[`"EncodingServices"`\] \| `OutputCodec`\[`"DecodingServices"`\] \| `OutputCodec`\[`"EncodingServices"`\]

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

### EncodedInput

> **EncodedInput**\<`A`\> = `A` *extends* `object` ? `InputCodec`\[`"Encoded"`\] : `never`

Extract an Agent's encoded input type.

#### Type Parameters

##### A

`A`

***

### EncodedOutput

> **EncodedOutput**\<`A`\> = `A` *extends* `object` ? `OutputCodec`\[`"Encoded"`\] : `never`

Extract an Agent's encoded output type.

#### Type Parameters

##### A

`A`

***

### Inheritance

> **Inheritance** = *typeof* `Inheritance.Type`

Authority and context inherited by one child Run.

***

### InheritanceOptions

> **InheritanceOptions** = `Partial`\<[`Inheritance`](#inheritance)\>

Caller-authored child inheritance options. Omitted fields use safe defaults.

***

### Input

> **Input**\<`A`\> = `A` *extends* `object` ? `InputCodec`\[`"Type"`\] : `never`

Extract an Agent's decoded input type.

#### Type Parameters

##### A

`A`

***

### InvocationOptions

> **InvocationOptions** = `Omit`\<[`RunOptions`](#runoptions), `"prompt"`\>

Per-invocation options after the Agent input has moved to the second argument.

***

### Output

> **Output**\<`A`\> = `A` *extends* `object` ? `OutputCodec`\[`"Type"`\] : `never`

Extract an Agent's decoded output type.

#### Type Parameters

##### A

`A`

***

### ProgressOverflowPolicy

> **ProgressOverflowPolicy** = \{ `_tag`: `"Backpressure"`; `capacity`: `number`; \} \| \{ `_tag`: `"Dropping"`; `capacity`: `number`; \} \| \{ `_tag`: `"Sliding"`; `capacity`: `number`; \} \| \{ `_tag`: `"Fail"`; `capacity`: `number`; \}

Bounded buffering behavior for tool progress events.

***

### Requirements

> **Requirements**\<`A`\> = `A` *extends* [`Agent`](#agent)\<infer \_Tools, infer R\> ? `R` : `never`

Extract an agent's runtime requirements.

#### Type Parameters

##### A

`A`

***

### ResumeResolution

> **ResumeResolution** = *typeof* `ResumeResolution.Type`

Decoded re-entry resolution for an authoritative suspension checkpoint.

***

### RunError

> **RunError** = *typeof* `RunError.Type`

The error channel and durable codec of `Agent.run` and `Agent.stream`.

***

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

### SendError

> **SendError** = [`InboxFull`](./Steering#inboxfull) \| [`RunClosed`](./Steering#runclosed) \| [`RollbackRequiresRuntime`](./Steering#rollbackrequiresruntime) \| [`RunBusy`](./Steering#runbusy)

***

### StartEvent

> **StartEvent**\<`Output`\> = `Exclude`\<[`RunEvent`](../../runtime/namespaces/RunEvent#runevent), [`RunCompleted`](../../runtime/namespaces/RunEvent#runcompleted)\> \| `Omit`\<[`RunCompleted`](../../runtime/namespaces/RunEvent#runcompleted), `"result"`\> & `object`

Durable Runtime event with Agent completion decoded through its output Schema.

#### Type Parameters

##### Output

`Output`

***

### ToolCallBatch

> **ToolCallBatch** = readonly \[`Response.ToolCallPartEncoded`, `...ReadonlyArray<Response.ToolCallPartEncoded>`\]

One non-empty externally completed, authored-order framework tool-call batch.

***

### ToolCallBatchOptions

> **ToolCallBatchOptions** = [`ToolCallBatchStart`](#toolcallbatchstart) \| [`ToolCallBatchResume`](#toolcallbatchresume)

One fresh or persisted externally completed framework tool-call batch.

***

### ToolCallBatchRequirements

> **ToolCallBatchRequirements**\<`Tools`, `AuthorizationServices`\> = `AuthorizationServices` \| `StaticToolServices`\<`Tools`\>

Services used by externally completed framework calls; no LanguageModel call is performed.

#### Type Parameters

##### Tools

`Tools` *extends* `Record`\<`string`, `Tool.Any`\>

##### AuthorizationServices

`AuthorizationServices`

***

### WakeEvent

> **WakeEvent** = *typeof* `WakeEvent.Type`

A typed environmental fact that can resume an awaiting Agent tool call.

***

### WakeEventFilter

> **WakeEventFilter** = *typeof* `WakeEventFilter.Type`

Serializable selector persisted with an `Agent.awaitEvent` obligation.

## Variables

### AgentTypeId

> `const` **AgentTypeId**: `"generalist/core/Agent"` = `"generalist/core/Agent"`

***

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

### AwaitEvent

> `const` **AwaitEvent**: `Schema.Struct`\<\{ `deadline`: `Schema.String`; `filter`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `scheduleId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `kind`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[..., ..., ...\]\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>; \}\>

Durable metadata carried by a tool suspension created by `Agent.awaitEvent`.

***

### AwaitEventResult

> `const` **AwaitEventResult**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Event"`, \{ `event`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<..., ...\>; `payload`: `Schema.Codec`\<..., ..., ..., ...\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<...\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<...\>; `dedupeKey`: `Schema.String`; \}\>\]\>; \}\>, `Schema.TaggedStruct`\<`"TimedOut"`, \{ `deadline`: `Schema.String`; \}\>\]\>

Result injected as the terminal result of the awaiting tool call.

***

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

### defaultInheritance

> `const` **defaultInheritance**: [`Inheritance`](#inheritance)

Safe child inheritance defaults.

***

### defaultObjectPrompt

> `const` **defaultObjectPrompt**: `"Return the final structured output for the task above."` = `"Return the final structured output for the task above."`

Default prompt for the terminal structured-output turn.

***

### fanOut

> `const` **fanOut**: `FanOut`

Run typed child Agents concurrently in-process without requiring a Runtime.

***

### inheritance

> `const` **inheritance**: (`options?`) => [`Inheritance`](#inheritance)

Normalize one child inheritance record before execution or journaling.

#### Parameters

##### options?

[`InheritanceOptions`](#inheritanceoptions)

#### Returns

[`Inheritance`](#inheritance)

***

### Inheritance

> `const` **Inheritance**: `Schema.Struct`\<\{ `budget`: `Schema.optionalKey`\<`Schema.Struct`\<\{ `children`: `Schema.optionalKey`\<`Schema.Finite`\>; `duration`: `Schema.optionalKey`\<`Schema.Finite`\>; `tokens`: `Schema.optionalKey`\<`Schema.Finite`\>; `toolCalls`: `Schema.optionalKey`\<`Schema.Finite`\>; `usd`: `Schema.optionalKey`\<`Schema.Finite`\>; \}\>\>; `history`: `Schema.Literals`\<readonly \[`"none"`, `"summary"`, `"full"`\]\>; `instructions`: `Schema.Literals`\<readonly \[`"inherit"`, `"own"`\]\>; `memory`: `Schema.Literals`\<readonly \[`"inherit"`, `"fresh"`\]\>; `permissions`: `Schema.Literals`\<readonly \[`"inherit"`, `"fresh"`\]\>; `sandbox`: `Schema.Literals`\<readonly \[`"share"`, `"fork"`, `"fresh"`\]\>; `tasks`: `Schema.Literals`\<readonly \[`"read"`, `"none"`\]\>; `tools`: `Schema.Literals`\<readonly \[`"attenuate"`, `"same"`\]\>; \}\>

Authority and context inherited by one child Run.

***

### ResumeResolution

> `const` **ResumeResolution**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ToolResult"`, \{ `encodedResult`: `Schema.Unknown`; `result`: `Schema.Unknown`; \}\>, `Schema.TaggedStruct`\<`"Signal"`, \{ `name`: `Schema.String`; `payload`: `Schema.optionalKey`\<`Schema.Unknown`\>; \}\>\]\>

Re-entry resolution for an authoritative suspension checkpoint.

***

### run

> `const` **run**: `RunFunction`

Run an Agent to its schema-decoded output.

***

### RunError

> `const` **RunError**: `Schema.Union`\<readonly \[*typeof* [`SinkFailed`](./ModelTelemetry#sinkfailed), *typeof* [`InvocationLifecycleFailed`](./ModelTelemetry#invocationlifecyclefailed), *typeof* [`HookFailed`](../../hooks#hookfailed), *typeof* [`GateFailed`](./Gate#gatefailed), *typeof* [`AgentError`](./AgentEvent#agenterror), *typeof* [`ChildExceedsParent`](./AgentEvent#childexceedsparent), *typeof* [`InvalidOutput`](./AgentEvent#invalidoutput), *typeof* [`AgentSuspended`](./AgentEvent#agentsuspended), *typeof* [`ResumeMismatch`](./AgentEvent#resumemismatch), *typeof* [`PolicyError`](./Policy-1#policyerror), *typeof* [`PolicyStopped`](./AgentEvent#policystopped), *typeof* [`TurnLimitExceeded`](./AgentEvent#turnlimitexceeded), *typeof* [`RunEndedWithoutOutput`](./AgentEvent#runendedwithoutoutput), *typeof* [`MiddlewareViolation`](./AgentEvent#middlewareviolation), *typeof* [`Misconfigured`](./ModelResilience#misconfigured), *typeof* [`InvalidToolCallParameters`](./ModelToolCallValidation#invalidtoolcallparameters), *typeof* [`ToolJsonSchemaCompilerMissing`](./ModelToolCallValidation#tooljsonschemacompilermissing), *typeof* [`DuplicateToolCallId`](./AgentEvent#duplicatetoolcallid), *typeof* [`ProgressOverflow`](./AgentEvent#progressoverflow), *typeof* [`ToolNameCollision`](./AgentEvent#toolnamecollision), *typeof* `AiError.AiError`, *typeof* [`LanguageModelNotRegistered`](./ModelRegistry#languagemodelnotregistered), *typeof* [`PermissionDenied`](./ToolAuthorization#permissiondenied), *typeof* [`FrameworkFailure`](./ToolExecutor#frameworkfailure), *typeof* [`DriverError`](./DurableDriver#drivererror), *typeof* [`DriverStateInvalid`](./DurableDriver#driverstateinvalid), *typeof* [`DriverUnknownReplay`](./DurableDriver#driverunknownreplay), *typeof* [`Suspended`](./NestedOperation#suspended), *typeof* [`Exhausted`](./RunBudget#exhausted), *typeof* `TargetMissing`, *typeof* `HandoffLimitExceeded`, *typeof* `HandoffRequirementsMissing`, *typeof* [`ProjectionInvalid`](./Handoff#projectioninvalid), *typeof* [`Rejected`](./Handoff#rejected), *typeof* [`PolicyInvalid`](./Steering#policyinvalid)\]\>

The error channel and durable codec of `Agent.run` and `Agent.stream`.

***

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

### start

> `const` **start**: `StartFunction`

Start an Agent previously registered with the durable Runtime.

***

### stream

> `const` **stream**: `StreamFunction`

Stream an Agent run as Events ending in `Completed { output }`.

***

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

### WakeEvent

> `const` **WakeEvent**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `dedupeKey`: `Schema.String`; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `scheduledAt`: `Schema.String`; `scheduleId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `dedupeKey`: `Schema.String`; `headers`: `Schema.$Record`\<`Schema.String`, `Schema.String`\>; `payload`: `Schema.Codec`\<`Schema.Json`, `Schema.Json`, `never`, `never`\>; `source`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.String`; `dedupeKey`: `Schema.String`; `terminalEventId`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `dedupeKey`: `Schema.String`; `kind`: `Schema.Literals`\<readonly \[`"create"`, `"update"`, `"remove"`\]\>; `path`: `Schema.String`; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.String`; `decision`: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Approved"`, \{ \}\>, `Schema.TaggedStruct`\<`"Denied"`, \{ `reason`: `Schema.optionalKey`\<...\>; \}\>\]\>; `dedupeKey`: `Schema.String`; \}\>\]\>

A typed environmental fact that can resume an awaiting Agent tool call.

***

### WakeEventFilter

> `const` **WakeEventFilter**: `Schema.Union`\<readonly \[`Schema.TaggedStruct`\<`"Timer"`, \{ `scheduleId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"Webhook"`, \{ `source`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ChildCompleted"`, \{ `childRunId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"FileChanged"`, \{ `kind`: `Schema.optionalKey`\<`Schema.Literals`\<readonly \[`"create"`, `"update"`, `"remove"`\]\>\>; `path`: `Schema.optionalKey`\<`Schema.String`\>; \}\>, `Schema.TaggedStruct`\<`"ApprovalResolved"`, \{ `approvalId`: `Schema.optionalKey`\<`Schema.String`\>; \}\>\]\>

Serializable selector persisted with an `Agent.awaitEvent` obligation.

***

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
