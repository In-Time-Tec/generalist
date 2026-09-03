[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutableResolver

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

> `readonly` **agentManifest**: [`AgentManifest`](../../generalist/namespaces/AgentManifest#agentmanifest)

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

<a id="program"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent#closed)

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

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="ref-1"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="program-1"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

<a id="ref-2"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

<a id="pin-2"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

<a id="program-2"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref-3"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

#### Properties

<a id="manifest-4"></a>

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="ref-4"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

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

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

<a id="ref-5"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **agent**: (`request`) => `Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`AgentCapabilityRequest`](#agentcapabilityrequest)

###### Returns

`Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

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

> `readonly` **executor**: (`request`) => `Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`CapabilityRequest`](#capabilityrequest)

###### Returns

`Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

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

> `readonly` **step**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

<a id="tool"></a>

##### tool

> `readonly` **tool**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

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

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor#service)

<a id="handlers"></a>

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers#handlers)

<a id="program-4"></a>

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

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

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

<a id="program-5"></a>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

<a id="ref-6"></a>

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

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

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent#closed)

<a id="executable"></a>

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

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

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

<a id="executor-2"></a>

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor#service)

<a id="handlers-1"></a>

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers#handlers)

<a id="program-6"></a>

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

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

## Type Aliases

<a id="reconstructionerror"></a>

### ReconstructionError

> **ReconstructionError** = [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)

Typed failures allowed while reconstructing an admitted executable.

***

<a id="resolution"></a>

### Resolution

> **Resolution** = [`AgentResolution`](#agentresolution) \| [`ProgramResolution`](#programresolution)

Exactly one reconstructed executable kind.

***

<a id="resolveerror"></a>

### ResolveError

> **ResolveError** = [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)

Typed failures allowed while resolving one executable.

***

<a id="staticexecutable"></a>

### StaticExecutable

> **StaticExecutable** = [`StaticAgentExecutable`](#staticagentexecutable) \| [`StaticProgramExecutable`](#staticprogramexecutable)

One exact static executable used by tests and process-local hosts.

## Variables

<a id="attestation-3"></a>

### Attestation

> **Attestation**: `Codec`\<[`Attestation`](#attestation-1), `unknown`, `never`, `never`\>

***

<a id="input-1"></a>

### Input

> **Input**: `Codec`\<[`Input`](#input), `unknown`, `never`, `never`\>

***

<a id="layerdynamic"></a>

### layerDynamic

> `const` **layerDynamic**: (`options`) => `Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Canonical resolver Layer helper.

#### Parameters

##### options

###### agents

`ReadonlyArray`\<[`StaticAgentExecutable`](#staticagentexecutable)\>

###### program

[`ProgramReconstruction`](#programreconstruction)

#### Returns

`Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

<a id="layerstatic"></a>

### layerStatic

> `const` **layerStatic**: (`executables`) => `Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Exact static resolver Layer helper.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

<a id="makedynamic"></a>

### makeDynamic

> `const` **makeDynamic**: (`options`) => `Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Construct the canonical resolver: static Agents keyed by their exact persisted Agent pin, and
every admitted Agent Program reconstructed from its exact manifest and persisted registrations.

#### Parameters

##### options

###### agents

`ReadonlyArray`\<[`StaticAgentExecutable`](#staticagentexecutable)\>

###### program

[`ProgramReconstruction`](#programreconstruction)

#### Returns

`Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

<a id="makestatic"></a>

### makeStatic

> `const` **makeStatic**: (`executables`) => `Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Construct an exact static resolver without resolving at admission or startup.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

<a id="matchesactiverunoptions"></a>

### matchesActiveRunOptions

> `const` **matchesActiveRunOptions**: \{(`manifest`, `options`): (`ref`) => `boolean`; (`ref`, `manifest`, `options`): `boolean`; \}

Verify resolver-owned static options against the persisted active Agent.

#### Call Signature

> (`manifest`, `options`): (`ref`) => `boolean`

##### Parameters

###### manifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### options

[`StaticRunOptions`](#staticrunoptions) \| `undefined`

##### Returns

(`ref`) => `boolean`

#### Call Signature

> (`ref`, `manifest`, `options`): `boolean`

##### Parameters

###### ref

###### active

`Schema.Union`\<readonly \[`Schema.brand`\<`Schema.String`, `"generalist/agent-pin"`\>, `Schema.brand`\<`Schema.String`, `"generalist/program-pin"`\>\]\>

###### executable

`Schema.brand`\<`Schema.String`, `"generalist/executable-pin"`\>

###### manifest

[`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

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
