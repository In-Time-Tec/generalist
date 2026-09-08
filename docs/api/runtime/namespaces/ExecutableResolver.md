[**generalist**](../../index.md)

***

[generalist](../../index.md) / [runtime](../index.md) / ExecutableResolver

# ExecutableResolver

## Classes

<a id="executableresolver"></a>

### ExecutableResolver

#### Extends

- `ExecutableResolver_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ExecutableResolver**(`_`): [`ExecutableResolver`](#executableresolver)

###### Parameters

###### \_

`never`

###### Returns

[`ExecutableResolver`](#executableresolver)

###### Inherited from

`ExecutableResolver_base.constructor`

## Interfaces

<a id="agentcapabilityrequest"></a>

### AgentCapabilityRequest

Exact persisted authority for one reconstructed Program Agent handler.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

<a id="agent"></a>

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

<a id="agentmanifest"></a>

##### agentManifest

> `readonly` **agentManifest**: [`AgentManifest`](../../generalist/namespaces/AgentManifest.md#agentmanifest)

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

<a id="program"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest.md#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

<a id="registration"></a>

##### registration

> `readonly` **registration**: `object`

###### codec

> `readonly` **codec**: `string`

###### payload

> `readonly` **payload**: `unknown`

###### pin

> `readonly` **pin**: `string`

###### version

> `readonly` **version**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`registration`](#registration-1)

<a id="runid"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="agentresolution"></a>

### AgentResolution

Live executable resources owned by the caller's scope.

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Agent"`

<a id="agent-1"></a>

##### agent

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent.md#closed)

<a id="attestation"></a>

##### attestation

> `readonly` **attestation**: [`Attestation`](#attestation-1)

<a id="runoptions"></a>

##### runOptions?

> `readonly` `optional` **runOptions?**: [`StaticRunOptions`](#staticrunoptions)

***

<a id="attestation-1"></a>

### Attestation

Resolver-owned proof of the reconstructed executable identity.

#### Properties

<a id="manifest-1"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

<a id="ref-1"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

***

<a id="capabilityrequest"></a>

### CapabilityRequest

Exact persisted authority for one reconstructed Program capability pin.

#### Extended by

- [`CodecRequest`](#codecrequest)
- [`NamedCapabilityRequest`](#namedcapabilityrequest)
- [`AgentCapabilityRequest`](#agentcapabilityrequest)

#### Properties

<a id="manifest-2"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="program-1"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest.md#pinnedprogram)

<a id="ref-2"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="registration-1"></a>

##### registration

> `readonly` **registration**: `object`

###### codec

> `readonly` **codec**: `string`

###### payload

> `readonly` **payload**: `unknown`

###### pin

> `readonly` **pin**: `string`

###### version

> `readonly` **version**: `string`

<a id="runid-1"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="codecrequest"></a>

### CodecRequest

Exact persisted authority for one reconstructed Program boundary codec.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

<a id="boundary"></a>

##### boundary

> `readonly` **boundary**: `"input"` \| `"output"`

<a id="manifest-3"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

<a id="pin-2"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

<a id="program-2"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest.md#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref-3"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

<a id="registration-2"></a>

##### registration

> `readonly` **registration**: `object`

###### codec

> `readonly` **codec**: `string`

###### payload

> `readonly` **payload**: `unknown`

###### pin

> `readonly` **pin**: `string`

###### version

> `readonly` **version**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`registration`](#registration-1)

<a id="runid-2"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

***

<a id="input"></a>

### Input

Exact persisted identity supplied to executable reconstruction.

#### Extended by

- [`ToolReconstructionRequest`](#toolreconstructionrequest)

#### Properties

<a id="manifest-4"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

<a id="ref-4"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="registrations"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

<a id="runid-3"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="namedcapabilityrequest"></a>

### NamedCapabilityRequest

Exact persisted authority for one reconstructed Program tool or step handler.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

<a id="manifest-5"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="pin-3"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

<a id="program-3"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest.md#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref-5"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

<a id="registration-3"></a>

##### registration

> `readonly` **registration**: `object`

###### codec

> `readonly` **codec**: `string`

###### payload

> `readonly` **payload**: `unknown`

###### pin

> `readonly` **pin**: `string`

###### version

> `readonly` **version**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`registration`](#registration-1)

<a id="runid-4"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

***

<a id="programreconstruction"></a>

### ProgramReconstruction

Application-owned reconstruction of one admitted Agent Program from its exact persisted
registrations. Every member owns its codec, version, and credential dereference, and may acquire scoped
resources finalized with the resolver scope.

#### Properties

<a id="agent-2"></a>

##### agent

> `readonly` **agent**: (`request`) => `Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers.md#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`AgentCapabilityRequest`](#agentcapabilityrequest)

###### Returns

`Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers.md#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="codec"></a>

##### codec

> `readonly` **codec**: (`request`) => `Effect`\<`Codec`\<`unknown`, `unknown`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`CodecRequest`](#codecrequest)

###### Returns

`Effect`\<`Codec`\<`unknown`, `unknown`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="executor"></a>

##### executor

> `readonly` **executor**: (`request`) => `Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor.md#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`CapabilityRequest`](#capabilityrequest)

###### Returns

`Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor.md#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="services"></a>

##### services?

> `readonly` `optional` **services?**: (`request`) => `Effect`\<`Layer`\<`never`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`ServicesRequest`](#servicesrequest)

###### Returns

`Effect`\<`Layer`\<`never`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="step"></a>

##### step

> `readonly` **step**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers.md#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers.md#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="tool"></a>

##### tool

> `readonly` **tool**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers.md#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers.md#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

***

<a id="programresolution"></a>

### ProgramResolution

Live Agent Program resources owned by the caller's scope.

#### Properties

<a id="_tag-1"></a>

##### \_tag

> `readonly` **\_tag**: `"Program"`

<a id="attestation-2"></a>

##### attestation

> `readonly` **attestation**: [`Attestation`](#attestation-1)

<a id="executor-1"></a>

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor.md#service)

<a id="handlers"></a>

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers.md#handlers)

<a id="program-4"></a>

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram.md#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

<a id="services-1"></a>

##### services?

> `readonly` `optional` **services?**: `Layer`\<`never`, `never`, `never`\>

***

<a id="service"></a>

### Service

#### Properties

<a id="resolve"></a>

##### resolve

> `readonly` **resolve**: (`input`) => `Effect`\<[`Resolution`](#resolution), [`ResolveError`](#resolveerror), `Scope`\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<[`Resolution`](#resolution), [`ResolveError`](#resolveerror), `Scope`\>

***

<a id="servicesrequest"></a>

### ServicesRequest

Exact persisted authority for the Run-scoped services of one reconstructed Program.

#### Properties

<a id="manifest-6"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

<a id="program-5"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest.md#pinnedprogram)

<a id="ref-6"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

<a id="registrations-1"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

<a id="runid-5"></a>

##### runId

> `readonly` **runId**: `string`

***

<a id="staticagentexecutable"></a>

### StaticAgentExecutable

One exact static Agent executable bound to its persisted Agent pin.

#### Properties

<a id="_tag-2"></a>

##### \_tag?

> `readonly` `optional` **\_tag?**: `"Agent"`

<a id="agent-3"></a>

##### agent

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent.md#closed)

<a id="executable"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest.md#pinnedexecutable)

<a id="runoptions-1"></a>

##### runOptions?

> `readonly` `optional` **runOptions?**: [`StaticRunOptions`](#staticrunoptions)

***

<a id="staticprogramexecutable"></a>

### StaticProgramExecutable

One exact static Program executable bound to its persisted Program pin.

#### Properties

<a id="_tag-3"></a>

##### \_tag

> `readonly` **\_tag**: `"Program"`

<a id="executable-1"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest.md#pinnedexecutable)

<a id="executor-2"></a>

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor.md#service)

<a id="handlers-1"></a>

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers.md#handlers)

<a id="program-6"></a>

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram.md#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

<a id="services-2"></a>

##### services?

> `readonly` `optional` **services?**: `Layer`\<`never`, `never`, `never`\>

***

<a id="staticrunoptions"></a>

### StaticRunOptions

Resolver-owned static options attested by the persisted Agent manifest.

#### Properties

<a id="compaction"></a>

##### compaction?

> `readonly` `optional` **compaction?**: `object`

###### contextWindow

> `readonly` **contextWindow**: `number`

###### reserveTokens

> `readonly` **reserveTokens**: `number`

***

<a id="statictoolexecutable"></a>

### StaticToolExecutable

One exact static executable used by tests and process-local hosts.

#### Extends

- `Omit`\<[`ToolResolution`](#toolresolution), `"attestation"`\>

#### Properties

<a id="_tag-4"></a>

##### \_tag

> `readonly` **\_tag**: `"Tool"`

###### Inherited from

[`ToolResolution`](#toolresolution).[`_tag`](#_tag-5)

<a id="authorizer"></a>

##### authorizer

> `readonly` **authorizer**: (`approvals`) => [`Authorizer`](../../generalist/namespaces/ToolAuthorization.md#authorizer)

###### Parameters

###### approvals

[`Service`](../../approvals.md#service)

###### Returns

[`Authorizer`](../../generalist/namespaces/ToolAuthorization.md#authorizer)

###### Inherited from

[`ToolResolution`](#toolresolution).[`authorizer`](#authorizer-1)

<a id="executable-2"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest.md#pinnedexecutable)

<a id="executor-3"></a>

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/ToolExecutor.md#service)\<[`ToolContext`](../../generalist/namespaces/ToolContext.md#toolcontext)\>

###### Inherited from

[`ToolResolution`](#toolresolution).[`executor`](#executor-4)

<a id="failure"></a>

##### failure

> `readonly` **failure**: `Codec`\<`unknown`, `unknown`\>

###### Inherited from

[`ToolResolution`](#toolresolution).[`failure`](#failure-1)

<a id="input-1"></a>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

###### Inherited from

[`ToolResolution`](#toolresolution).[`input`](#input-2)

<a id="output"></a>

##### output

> `readonly` **output**: `Codec`\<`unknown`, `unknown`\>

###### Inherited from

[`ToolResolution`](#toolresolution).[`output`](#output-1)

<a id="pinned"></a>

##### pinned

> `readonly` **pinned**: [`PinnedTool`](../../generalist/namespaces/ToolManifest.md#pinnedtool)

###### Inherited from

[`ToolResolution`](#toolresolution).[`pinned`](#pinned-2)

<a id="tool-1"></a>

##### tool

> `readonly` **tool**: `Any`

###### Inherited from

[`ToolResolution`](#toolresolution).[`tool`](#tool-2)

***

<a id="toolreconstructionrequest"></a>

### ToolReconstructionRequest

Construct the canonical resolver: static Agents keyed by their exact persisted Agent pin, and
every admitted Agent Program reconstructed from its exact manifest and persisted registrations.

#### Extends

- [`Input`](#input)

#### Properties

<a id="manifest-7"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### Inherited from

[`Input`](#input).[`manifest`](#manifest-4)

<a id="pinned-1"></a>

##### pinned

> `readonly` **pinned**: [`PinnedTool`](../../generalist/namespaces/ToolManifest.md#pinnedtool)

<a id="ref-7"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\> \| `string` & `Brand`\<`"generalist/tool-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`Input`](#input).[`ref`](#ref-4)

<a id="registrations-2"></a>

##### registrations

> `readonly` **registrations**: readonly `object`[]

###### Inherited from

[`Input`](#input).[`registrations`](#registrations)

<a id="runid-6"></a>

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`Input`](#input).[`runId`](#runid-3)

***

<a id="toolresolution"></a>

### ToolResolution

Exactly one reconstructed executable kind.

#### Properties

<a id="_tag-5"></a>

##### \_tag

> `readonly` **\_tag**: `"Tool"`

<a id="attestation-3"></a>

##### attestation

> `readonly` **attestation**: [`Attestation`](#attestation-1)

<a id="authorizer-1"></a>

##### authorizer

> `readonly` **authorizer**: (`approvals`) => [`Authorizer`](../../generalist/namespaces/ToolAuthorization.md#authorizer)

###### Parameters

###### approvals

[`Service`](../../approvals.md#service)

###### Returns

[`Authorizer`](../../generalist/namespaces/ToolAuthorization.md#authorizer)

<a id="executor-4"></a>

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/ToolExecutor.md#service)\<[`ToolContext`](../../generalist/namespaces/ToolContext.md#toolcontext)\>

<a id="failure-1"></a>

##### failure

> `readonly` **failure**: `Codec`\<`unknown`, `unknown`\>

<a id="input-2"></a>

##### input

> `readonly` **input**: `Codec`\<`unknown`, `unknown`\>

<a id="output-1"></a>

##### output

> `readonly` **output**: `Codec`\<`unknown`, `unknown`\>

<a id="pinned-2"></a>

##### pinned

> `readonly` **pinned**: [`PinnedTool`](../../generalist/namespaces/ToolManifest.md#pinnedtool)

<a id="tool-2"></a>

##### tool

> `readonly` **tool**: `Any`

## Type Aliases

<a id="reconstructionerror"></a>

### ReconstructionError

> **ReconstructionError** = [`ExecutablePinMissing`](./Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors.md#executableregistrationmissing)

Typed failures allowed while reconstructing an admitted executable.

***

<a id="resolution"></a>

### Resolution

> **Resolution** = [`AgentResolution`](#agentresolution) \| [`ProgramResolution`](#programresolution) \| [`ToolResolution`](#toolresolution)

***

<a id="resolveerror"></a>

### ResolveError

> **ResolveError** = [`ExecutablePinMissing`](./Errors.md#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors.md#executableregistrationmissing)

Typed failures allowed while resolving one executable.

***

<a id="staticexecutable"></a>

### StaticExecutable

> **StaticExecutable** = [`StaticAgentExecutable`](#staticagentexecutable) \| [`StaticProgramExecutable`](#staticprogramexecutable) \| [`StaticToolExecutable`](#statictoolexecutable)

***

<a id="toolreconstruction"></a>

### ToolReconstruction

> **ToolReconstruction** = (`request`) => `Effect.Effect`\<`Omit`\<[`ToolResolution`](#toolresolution), `"_tag"` \| `"pinned"` \| `"attestation"`\>, [`ReconstructionError`](#reconstructionerror), `Scope.Scope`\>

#### Parameters

##### request

[`ToolReconstructionRequest`](#toolreconstructionrequest)

#### Returns

`Effect.Effect`\<`Omit`\<[`ToolResolution`](#toolresolution), `"_tag"` \| `"pinned"` \| `"attestation"`\>, [`ReconstructionError`](#reconstructionerror), `Scope.Scope`\>

## Variables

<a id="attestation-4"></a>

### Attestation

> **Attestation**: `Codec`\<[`Attestation`](#attestation-1), `unknown`, `never`, `never`\>

***

<a id="input-3"></a>

### Input

> **Input**: `Codec`\<[`Input`](#input), `unknown`, `never`, `never`\>

***

<a id="layerdynamic"></a>

### layerDynamic

> `const` **layerDynamic**: (`options`) => `Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

#### Parameters

##### options

###### agents

`ReadonlyArray`\<[`StaticAgentExecutable`](#staticagentexecutable)\>

###### program

[`ProgramReconstruction`](#programreconstruction)

###### tool?

[`ToolReconstruction`](#toolreconstruction)

###### tools?

`ReadonlyArray`\<[`StaticToolExecutable`](#statictoolexecutable)\>

#### Returns

`Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

***

<a id="layerstatic"></a>

### layerStatic

> `const` **layerStatic**: (`executables`) => `Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

Exact static resolver Layer helper.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

***

<a id="makedynamic"></a>

### makeDynamic

> `const` **makeDynamic**: (`options`) => `Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

#### Parameters

##### options

###### agents

`ReadonlyArray`\<[`StaticAgentExecutable`](#staticagentexecutable)\>

###### program

[`ProgramReconstruction`](#programreconstruction)

###### tool?

[`ToolReconstruction`](#toolreconstruction)

###### tools?

`ReadonlyArray`\<[`StaticToolExecutable`](#statictoolexecutable)\>

#### Returns

`Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

***

<a id="makestatic"></a>

### makeStatic

> `const` **makeStatic**: (`executables`) => `Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

Construct an exact static resolver without resolving at admission or startup.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors.md#executableregistrationinvalid)\>

***

<a id="matchesactiverunoptions"></a>

### matchesActiveRunOptions

> `const` **matchesActiveRunOptions**: \{(`manifest`, `options`): (`ref`) => `boolean`; (`ref`, `manifest`, `options`): `boolean`; \}

Verify resolver-owned static options against the persisted active Agent.

#### Call Signature

> (`manifest`, `options`): (`ref`) => `boolean`

##### Parameters

###### manifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### options

[`StaticRunOptions`](#staticrunoptions) \| `undefined`

##### Returns

(`ref`) => `boolean`

#### Call Signature

> (`ref`, `manifest`, `options`): `boolean`

##### Parameters

###### ref

###### active

`Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/tool-pin"`\>\]\>

###### executable

`Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>

###### manifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest.md#executablemanifest)

###### options

[`StaticRunOptions`](#staticrunoptions) \| `undefined`

##### Returns

`boolean`

***

<a id="verifyattestation"></a>

### verifyAttestation

> `const` **verifyAttestation**: (`attestation`) => [`Attestation`](#attestation-1)

Verify resolver attestation against pinned identity.

#### Parameters

##### attestation

[`Attestation`](#attestation-1)

#### Returns

[`Attestation`](#attestation-1)

***

<a id="verifyinput"></a>

### verifyInput

> `const` **verifyInput**: (`input`) => [`Input`](#input)

Verify resolver input against its paired authority.

#### Parameters

##### input

[`Input`](#input)

#### Returns

[`Input`](#input)
