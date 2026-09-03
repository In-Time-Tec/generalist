[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / CodeExecutor

# CodeExecutor

## Classes

### CodeExecutor

Host-supplied isolated source executor.

#### Extends

- `CodeExecutor_base`

#### Constructors

##### Constructor

> **new CodeExecutor**(`_`): [`CodeExecutor`](#codeexecutor)

###### Parameters

###### \_

`never`

###### Returns

[`CodeExecutor`](#codeexecutor)

###### Inherited from

`CodeExecutor_base.constructor`

***

### SandboxCancelled

#### Extends

- `SandboxCancelled_base`

#### Constructors

##### Constructor

> **new SandboxCancelled**(...`args`): [`SandboxCancelled`](#sandboxcancelled)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxCancelled`](#sandboxcancelled)

###### Inherited from

`SandboxCancelled_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxCancelled_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxCancelled_base.message`

***

### SandboxDeadlineExceeded

#### Extends

- `SandboxDeadlineExceeded_base`

#### Constructors

##### Constructor

> **new SandboxDeadlineExceeded**(...`args`): [`SandboxDeadlineExceeded`](#sandboxdeadlineexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxDeadlineExceeded`](#sandboxdeadlineexceeded)

###### Inherited from

`SandboxDeadlineExceeded_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxDeadlineExceeded_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxDeadlineExceeded_base.message`

***

### SandboxExecutionFailure

#### Extends

- `SandboxExecutionFailure_base`

#### Constructors

##### Constructor

> **new SandboxExecutionFailure**(...`args`): [`SandboxExecutionFailure`](#sandboxexecutionfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxExecutionFailure`](#sandboxexecutionfailure)

###### Inherited from

`SandboxExecutionFailure_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxExecutionFailure_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxExecutionFailure_base.message`

***

### SandboxGuaranteeUnavailable

#### Extends

- `SandboxGuaranteeUnavailable_base`

#### Constructors

##### Constructor

> **new SandboxGuaranteeUnavailable**(...`args`): [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)

###### Inherited from

`SandboxGuaranteeUnavailable_base.constructor`

#### Properties

##### guarantee

> `readonly` **guarantee**: `"subrequests"` \| `"physicalIsolation"` \| `"persistence"` \| `"network"` \| `"deadlineMillis"` \| `"cpuMillis"` \| `"outputBytes"` \| `"filesystem"` \| `"processes"`

###### Inherited from

`SandboxGuaranteeUnavailable_base.guarantee`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxGuaranteeUnavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxGuaranteeUnavailable_base.message`

***

### SandboxInputInvalid

#### Extends

- `SandboxInputInvalid_base`

#### Constructors

##### Constructor

> **new SandboxInputInvalid**(...`args`): [`SandboxInputInvalid`](#sandboxinputinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxInputInvalid`](#sandboxinputinvalid)

###### Inherited from

`SandboxInputInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxInputInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxInputInvalid_base.message`

***

### SandboxOutputInvalid

#### Extends

- `SandboxOutputInvalid_base`

#### Constructors

##### Constructor

> **new SandboxOutputInvalid**(...`args`): [`SandboxOutputInvalid`](#sandboxoutputinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxOutputInvalid`](#sandboxoutputinvalid)

###### Inherited from

`SandboxOutputInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxOutputInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxOutputInvalid_base.message`

***

### SandboxProtocolViolation

#### Extends

- `SandboxProtocolViolation_base`

#### Constructors

##### Constructor

> **new SandboxProtocolViolation**(...`args`): [`SandboxProtocolViolation`](#sandboxprotocolviolation)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxProtocolViolation`](#sandboxprotocolviolation)

###### Inherited from

`SandboxProtocolViolation_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxProtocolViolation_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxProtocolViolation_base.message`

***

### SandboxResourceExceeded

#### Extends

- `SandboxResourceExceeded_base`

#### Constructors

##### Constructor

> **new SandboxResourceExceeded**(...`args`): [`SandboxResourceExceeded`](#sandboxresourceexceeded)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxResourceExceeded`](#sandboxresourceexceeded)

###### Inherited from

`SandboxResourceExceeded_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxResourceExceeded_base.hint`

##### limit

> `readonly` **limit**: `number`

###### Inherited from

`SandboxResourceExceeded_base.limit`

##### resource

> `readonly` **resource**: `"output"` \| `"cpu"` \| `"subrequests"`

###### Inherited from

`SandboxResourceExceeded_base.resource`

***

### SandboxSourceInvalid

#### Extends

- `SandboxSourceInvalid_base`

#### Constructors

##### Constructor

> **new SandboxSourceInvalid**(...`args`): [`SandboxSourceInvalid`](#sandboxsourceinvalid)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxSourceInvalid`](#sandboxsourceinvalid)

###### Inherited from

`SandboxSourceInvalid_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxSourceInvalid_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxSourceInvalid_base.message`

***

### SandboxUnavailable

#### Extends

- `SandboxUnavailable_base`

#### Constructors

##### Constructor

> **new SandboxUnavailable**(...`args`): [`SandboxUnavailable`](#sandboxunavailable)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SandboxUnavailable`](#sandboxunavailable)

###### Inherited from

`SandboxUnavailable_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SandboxUnavailable_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SandboxUnavailable_base.message`

## Interfaces

### Request

Complete immutable reconstruction request for one sandbox invocation.

#### Properties

##### capabilities

> `readonly` **capabilities**: readonly `object`[]

##### deadlineMillis

> `readonly` **deadlineMillis**: `number`

##### entrypoint

> `readonly` **entrypoint**: `string`

##### input

> `readonly` **input**: `unknown`

##### inputCodec

> `readonly` **inputCodec**: `string`

##### limits

> `readonly` **limits**: `object`

###### cpuMillis

> `readonly` **cpuMillis**: `number`

###### outputBytes

> `readonly` **outputBytes**: `number`

###### subrequests

> `readonly` **subrequests**: `number`

##### modules

> `readonly` **modules**: readonly `object`[]

##### outputCodec

> `readonly` **outputCodec**: `string`

##### protocolVersion

> `readonly` **protocolVersion**: `"1"`

##### requestId

> `readonly` **requestId**: `string`

##### signal

> `readonly` **signal**: `AbortSignal`

##### sourceDigest

> `readonly` **sourceDigest**: `string`

***

### Service

#### Properties

##### execute

> `readonly` **execute**: (`request`) => `Effect`\<\{ `inputCodec`: `string`; `output`: `unknown`; `outputCodec`: `string`; `protocolVersion`: `"1"`; `requestId`: `string`; `sourceDigest`: `string`; \}, [`SandboxUnavailable`](#sandboxunavailable) \| [`SandboxSourceInvalid`](#sandboxsourceinvalid) \| [`SandboxInputInvalid`](#sandboxinputinvalid) \| [`SandboxOutputInvalid`](#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](#sandboxdeadlineexceeded) \| [`SandboxCancelled`](#sandboxcancelled) \| [`SandboxResourceExceeded`](#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled), `Scope` \| [`ProgramCapabilities`](./ProgramCapabilities#programcapabilities)\>

###### Parameters

###### request

[`Request`](#request)

###### Returns

`Effect`\<\{ `inputCodec`: `string`; `output`: `unknown`; `outputCodec`: `string`; `protocolVersion`: `"1"`; `requestId`: `string`; `sourceDigest`: `string`; \}, [`SandboxUnavailable`](#sandboxunavailable) \| [`SandboxSourceInvalid`](#sandboxsourceinvalid) \| [`SandboxInputInvalid`](#sandboxinputinvalid) \| [`SandboxOutputInvalid`](#sandboxoutputinvalid) \| [`SandboxExecutionFailure`](#sandboxexecutionfailure) \| [`SandboxProtocolViolation`](#sandboxprotocolviolation) \| [`SandboxDeadlineExceeded`](#sandboxdeadlineexceeded) \| [`SandboxCancelled`](#sandboxcancelled) \| [`SandboxResourceExceeded`](#sandboxresourceexceeded) \| [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable) \| [`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing) \| [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied) \| [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure) \| [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure) \| [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure) \| [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure) \| [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure) \| [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted) \| [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence) \| [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown) \| [`ProgramSuspended`](./ProgramCapabilities#programsuspended) \| [`ProgramCancelled`](./ProgramCapabilities#programcancelled), `Scope` \| [`ProgramCapabilities`](./ProgramCapabilities#programcapabilities)\>

##### identity

> `readonly` **identity**: `object`

###### implementation

> `readonly` **implementation**: `object`

###### implementation.name

> `readonly` **name**: `string`

###### implementation.version

> `readonly` **version**: `string`

###### knownLimitations

> `readonly` **knownLimitations**: readonly `string`[]

###### limits

> `readonly` **limits**: `object`

###### limits.cpuMillis

> `readonly` **cpuMillis**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `maximum`: `number` \| `null`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### limits.deadlineMillis

> `readonly` **deadlineMillis**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `maximum`: `number` \| `null`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### limits.filesystem

> `readonly` **filesystem**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### limits.outputBytes

> `readonly` **outputBytes**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `maximum`: `number` \| `null`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### limits.processes

> `readonly` **processes**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### limits.subrequests

> `readonly` **subrequests**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `maximum`: `number` \| `null`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### network

> `readonly` **network**: `object`

###### network.enforcement

> `readonly` **enforcement**: \{ `by`: `"provider"` \| `"runtime"` \| `"adapter"`; `mechanism`: `string`; `status`: `"enforced"`; \} \| \{ `reason`: `string`; `status`: `"unenforced"`; \}

###### network.posture

> `readonly` **posture**: `"none"` \| `"host"` \| `"default-deny"` \| `"unrestricted"`

###### persistence

> `readonly` **persistence**: `"none"` \| `"fresh-per-execution"` \| `"trusted-fixture"`

###### physicalIsolation

> `readonly` **physicalIsolation**: `"none"` \| `"worker-isolate"` \| `"microvm"` \| `"sidecar-process-v8-isolate"` \| `"trusted-test"`

###### provider

> `readonly` **provider**: `string`

###### runtime

> `readonly` **runtime**: `object`

###### runtime.name

> `readonly` **name**: `string`

###### runtime.version

> `readonly` **version**: `string`

###### template

> `readonly` **template**: `object`

###### template.name

> `readonly` **name**: `string`

###### template.version

> `readonly` **version**: `string`

## Type Aliases

### CapabilityGrant

> **CapabilityGrant** = *typeof* `CapabilityGrant.Type`

Explicit capability authority admitted for one execution.

***

### ExecutionFailure

> **ExecutionFailure** = *typeof* `ExecutionFailure.Type`

Typed failures that may cross the sandbox capability protocol.

***

### Identity

> **Identity** = *typeof* `Identity.Type`

Persistable provider facts and exact guarantees enforced for every invocation.

***

### Module

> **Module** = *typeof* `Module.Type`

Exact normalized JavaScript module supplied to an isolated executor.

***

### Result

> **Result** = *typeof* `Result.Type`

Identity-bound encoded output returned by an isolated executor.

***

### TestExecute

> **TestExecute** = (`request`) => `Effect.Effect`\<`unknown`, [`ExecutionFailure`](#executionfailure), [`ProgramCapabilities`](./ProgramCapabilities#programcapabilities) \| `Scope.Scope`\>

Trusted fixture executor for tests only.

#### Parameters

##### request

[`Request`](#request)

#### Returns

`Effect.Effect`\<`unknown`, [`ExecutionFailure`](#executionfailure), [`ProgramCapabilities`](./ProgramCapabilities#programcapabilities) \| `Scope.Scope`\>

## Variables

### admit

> `const` **admit**: \{(`request`, `nowMillis`): (`identity`) => `Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>; (`identity`, `request`, `nowMillis`): `Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>; \}

Fail closed before source evaluation when an executor cannot enforce the normalized request.

#### Call Signature

> (`request`, `nowMillis`): (`identity`) => `Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>

##### Parameters

###### request

[`Request`](#request)

###### nowMillis

`number`

##### Returns

(`identity`) => `Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>

#### Call Signature

> (`identity`, `request`, `nowMillis`): `Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>

##### Parameters

###### identity

###### implementation

`Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>

###### knownLimitations

`Schema.$Array`\<`Schema.String`\>

###### limits

`Schema.Struct`\<\{ `cpuMillis`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `deadlineMillis`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `filesystem`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `outputBytes`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `processes`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `subrequests`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; \}\>

###### network

`Schema.Struct`\<\{ `enforcement`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `posture`: `Schema.Literals`\<readonly \[`"default-deny"`, `"unrestricted"`, `"host"`, `"none"`\]\>; \}\>

###### persistence

`Schema.Literals`\<readonly \[`"fresh-per-execution"`, `"trusted-fixture"`, `"none"`\]\>

###### physicalIsolation

`Schema.Literals`\<readonly \[`"worker-isolate"`, `"microvm"`, `"sidecar-process-v8-isolate"`, `"trusted-test"`, `"none"`\]\>

###### provider

`Schema.String`

###### runtime

`Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>

###### template

`Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>

###### request

[`Request`](#request)

###### nowMillis

`number`

##### Returns

`Effect`\<`void`, [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable)\>

***

### CapabilityGrant

> `const` **CapabilityGrant**: `Schema.Struct`\<\{ `names`: `Schema.$Array`\<`Schema.String`\>; `operation`: `Schema.Literals`\<readonly \[`"discoverTools"`, `"describeTool"`, `"callTool"`, `"callStep"`, `"runAgent"`, `"mapAgents"`, `"fanOutAgents"`, `"log"`\]\>; \}\>

Explicit capability authority admitted for one execution.

***

### declareIdentity

> `const` **declareIdentity**: (`input`) => [`Identity`](#identity-1)

Validate and deeply freeze persistable executor identity facts.

#### Parameters

##### input

[`Identity`](#identity-1)

#### Returns

[`Identity`](#identity-1)

***

### ExecutionFailure

> `const` **ExecutionFailure**: `Schema.Union`\<readonly \[*typeof* [`SandboxUnavailable`](#sandboxunavailable), *typeof* [`SandboxSourceInvalid`](#sandboxsourceinvalid), *typeof* [`SandboxInputInvalid`](#sandboxinputinvalid), *typeof* [`SandboxOutputInvalid`](#sandboxoutputinvalid), *typeof* [`SandboxExecutionFailure`](#sandboxexecutionfailure), *typeof* [`SandboxProtocolViolation`](#sandboxprotocolviolation), *typeof* [`SandboxDeadlineExceeded`](#sandboxdeadlineexceeded), *typeof* [`SandboxCancelled`](#sandboxcancelled), *typeof* [`SandboxResourceExceeded`](#sandboxresourceexceeded), *typeof* [`SandboxGuaranteeUnavailable`](#sandboxguaranteeunavailable), `Schema.Union`\<readonly \[[`ProgramCapabilityMissing`](./ProgramCapabilities#programcapabilitymissing), [`ProgramCapabilityDenied`](./ProgramCapabilities#programcapabilitydenied), [`ProgramAuthorizationFailure`](./ProgramCapabilities#programauthorizationfailure), [`ProgramSchemaFailure`](./ProgramCapabilities#programschemafailure), [`ProgramToolFailure`](./ProgramCapabilities#programtoolfailure), [`ProgramStepFailure`](./ProgramCapabilities#programstepfailure), [`ProgramAgentFailure`](./ProgramCapabilities#programagentfailure), [`ProgramBudgetExhausted`](./ProgramCapabilities#programbudgetexhausted), [`ProgramReplayDivergence`](./ProgramCapabilities#programreplaydivergence), [`ProgramOperationUnknown`](./ProgramCapabilities#programoperationunknown), [`ProgramSuspended`](./ProgramCapabilities#programsuspended), [`ProgramCancelled`](./ProgramCapabilities#programcancelled)\]\>\]\>

Typed failures that may cross the sandbox capability protocol.

***

### Identity

> `const` **Identity**: `Schema.Struct`\<\{ `implementation`: `Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>; `knownLimitations`: `Schema.$Array`\<`Schema.String`\>; `limits`: `Schema.Struct`\<\{ `cpuMillis`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `deadlineMillis`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `filesystem`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `outputBytes`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `processes`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `subrequests`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `maximum`: `Schema.NullOr`\<`Schema.Int`\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; \}\>; `network`: `Schema.Struct`\<\{ `enforcement`: `Schema.Union`\<readonly \[`Schema.Struct`\<\{ `by`: `Schema.Literals`\<readonly ...\>; `mechanism`: `Schema.String`; `status`: `Schema.Literal`\<`"enforced"`\>; \}\>, `Schema.Struct`\<\{ `reason`: `Schema.String`; `status`: `Schema.Literal`\<`"unenforced"`\>; \}\>\]\>; `posture`: `Schema.Literals`\<readonly \[`"default-deny"`, `"unrestricted"`, `"host"`, `"none"`\]\>; \}\>; `persistence`: `Schema.Literals`\<readonly \[`"fresh-per-execution"`, `"trusted-fixture"`, `"none"`\]\>; `physicalIsolation`: `Schema.Literals`\<readonly \[`"worker-isolate"`, `"microvm"`, `"sidecar-process-v8-isolate"`, `"trusted-test"`, `"none"`\]\>; `provider`: `Schema.String`; `runtime`: `Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>; `template`: `Schema.Struct`\<\{ `name`: `Schema.String`; `version`: `Schema.String`; \}\>; \}\>

Persistable provider facts and exact guarantees enforced for every invocation.

***

### layerTest

> `const` **layerTest**: (`execute`) => `Layer.Layer`\<[`CodeExecutor`](#codeexecutor)\>

Trusted fixture Layer for tests only. It provides no source isolation.

#### Parameters

##### execute

[`TestExecute`](#testexecute)

#### Returns

`Layer.Layer`\<[`CodeExecutor`](#codeexecutor)\>

***

### makeRequest

> `const` **makeRequest**: (`input`) => [`Request`](#request)

Synthesize the canonical single-module request used by current Program manifests.

#### Parameters

##### input

###### agentRuns

`number`

###### agents

`ReadonlyArray`\<`string`\>

###### encodedInput

`unknown`

###### inputCodec

`string`

###### nowMillis

`number`

###### outputBytes

`number`

###### outputCodec

`string`

###### requestId

`string`

###### signal

`AbortSignal`

###### source

`string`

###### steps

`ReadonlyArray`\<`string`\>

###### toolCalls

`number`

###### tools

`ReadonlyArray`\<`string`\>

###### wallTimeMillis

`number`

#### Returns

[`Request`](#request)

***

### makeTest

> `const` **makeTest**: (`execute`) => [`Service`](#service)

Trusted fixture executor for tests only.

#### Parameters

##### execute

[`TestExecute`](#testexecute)

#### Returns

[`Service`](#service)

***

### Module

> `const` **Module**: `Schema.Struct`\<\{ `name`: `Schema.String`; `source`: `Schema.String`; \}\>

Exact normalized JavaScript module supplied to an isolated executor.

***

### protocolVersion

> `const` **protocolVersion**: `"1"`

Canonical protocol version implemented by CodeExecutor adapters.

***

### Result

> `const` **Result**: `Schema.Struct`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}\>

Identity-bound encoded output returned by an isolated executor.

***

### sourceDigest

> `const` **sourceDigest**: (`input`) => `string`

Compute the sole digest representation for normalized source.

#### Parameters

##### input

###### entrypoint

`string`

###### inputCodec

`string`

###### modules

`ReadonlyArray`\<[`Module`](#module)\>

###### outputCodec

`string`

###### protocolVersion?

*typeof* [`protocolVersion`](#protocolversion-1)

#### Returns

`string`

***

### testIdentity

> `const` **testIdentity**: [`Identity`](#identity-1)

Identity carried by trusted fixture executors.

***

### validateResult

> `const` **validateResult**: \{(`value`): (`request`) => `Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>; (`request`, `value`): `Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>; \}

Strictly decode a result and bind every protocol and codec identity field to its request.

#### Call Signature

> (`value`): (`request`) => `Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>

##### Parameters

###### value

`Json`

##### Returns

(`request`) => `Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>

#### Call Signature

> (`request`, `value`): `Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>

##### Parameters

###### request

[`Request`](#request)

###### value

`Json`

##### Returns

`Effect`\<\{ `inputCodec`: `Schema.String`; `output`: `Schema.Unknown`; `outputCodec`: `Schema.String`; `protocolVersion`: `Schema.Literal`\<`"1"`\>; `requestId`: `Schema.String`; `sourceDigest`: `Schema.String`; \}, [`SandboxProtocolViolation`](#sandboxprotocolviolation)\>
