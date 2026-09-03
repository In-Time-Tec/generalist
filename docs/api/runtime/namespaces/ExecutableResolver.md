[**generalist**](../../index)

***

[generalist](../../index) / [runtime](../index) / ExecutableResolver

# ExecutableResolver

## Classes

### ExecutableResolver

#### Extends

- `ExecutableResolver_base`

#### Constructors

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

### AgentCapabilityRequest

Exact persisted authority for one reconstructed Program Agent handler.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

##### agent

> `readonly` **agent**: `string` & `Brand`\<`"generalist/agent-pin"`\>

##### agentManifest

> `readonly` **agentManifest**: [`AgentManifest`](../../generalist/namespaces/AgentManifest#agentmanifest)

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

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

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

##### selection

> `readonly` **selection**: `string`

***

### AgentResolution

Live executable resources owned by the caller's scope.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Agent"`

##### agent

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent#closed)

##### attestation

> `readonly` **attestation**: [`Attestation`](#attestation-1)

##### runOptions?

> `readonly` `optional` **runOptions?**: [`StaticRunOptions`](#staticrunoptions)

***

### Attestation

Resolver-owned proof of the reconstructed executable identity.

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

***

### CapabilityRequest

Exact persisted authority for one reconstructed Program capability pin.

#### Extended by

- [`CodecRequest`](#codecrequest)
- [`NamedCapabilityRequest`](#namedcapabilityrequest)
- [`AgentCapabilityRequest`](#agentcapabilityrequest)

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

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

##### runId

> `readonly` **runId**: `string`

***

### CodecRequest

Exact persisted authority for one reconstructed Program boundary codec.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

##### boundary

> `readonly` **boundary**: `"input"` \| `"output"`

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

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

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

***

### Input

Exact persisted identity supplied to executable reconstruction.

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### registrations

> `readonly` **registrations**: readonly `object`[]

##### runId

> `readonly` **runId**: `string`

***

### NamedCapabilityRequest

Exact persisted authority for one reconstructed Program tool or step handler.

#### Extends

- [`CapabilityRequest`](#capabilityrequest)

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`manifest`](#manifest-2)

##### name

> `readonly` **name**: `string`

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`pin`](#pin-1)

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`program`](#program-1)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`ref`](#ref-2)

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

##### runId

> `readonly` **runId**: `string`

###### Inherited from

[`CapabilityRequest`](#capabilityrequest).[`runId`](#runid-1)

***

### ProgramReconstruction

Application-owned reconstruction of one admitted Agent Program from its exact persisted
registrations. Every member owns its codec, version, and credential dereference, and may acquire scoped
resources finalized with the resolver scope.

#### Properties

##### agent

> `readonly` **agent**: (`request`) => `Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`AgentCapabilityRequest`](#agentcapabilityrequest)

###### Returns

`Effect`\<[`AnyAgent`](../../generalist/namespaces/ProgramHandlers#anyagent), [`ReconstructionError`](#reconstructionerror), `Scope`\>

##### codec

> `readonly` **codec**: (`request`) => `Effect`\<`Codec`\<`unknown`, `unknown`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`CodecRequest`](#codecrequest)

###### Returns

`Effect`\<`Codec`\<`unknown`, `unknown`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

##### executor

> `readonly` **executor**: (`request`) => `Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`CapabilityRequest`](#capabilityrequest)

###### Returns

`Effect`\<[`Service`](../../generalist/namespaces/CodeExecutor#service), [`ReconstructionError`](#reconstructionerror), `Scope`\>

##### services?

> `readonly` `optional` **services?**: (`request`) => `Effect`\<`Layer`\<`never`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`ServicesRequest`](#servicesrequest)

###### Returns

`Effect`\<`Layer`\<`never`, `never`, `never`\>, [`ReconstructionError`](#reconstructionerror), `Scope`\>

##### step

> `readonly` **step**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

##### tool

> `readonly` **tool**: (`request`) => `Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

###### Parameters

###### request

[`NamedCapabilityRequest`](#namedcapabilityrequest)

###### Returns

`Effect`\<[`AnyTool`](../../generalist/namespaces/ProgramHandlers#anytool), [`ReconstructionError`](#reconstructionerror), `Scope`\>

***

### ProgramResolution

Live Agent Program resources owned by the caller's scope.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Program"`

##### attestation

> `readonly` **attestation**: [`Attestation`](#attestation-1)

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor#service)

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers#handlers)

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

##### services?

> `readonly` `optional` **services?**: `Layer`\<`never`, `never`, `never`\>

***

### Service

#### Properties

##### resolve

> `readonly` **resolve**: (`input`) => `Effect`\<[`Resolution`](#resolution), [`ResolveError`](#resolveerror), `Scope`\>

###### Parameters

###### input

[`Input`](#input)

###### Returns

`Effect`\<[`Resolution`](#resolution), [`ResolveError`](#resolveerror), `Scope`\>

***

### ServicesRequest

Exact persisted authority for the Run-scoped services of one reconstructed Program.

#### Properties

##### manifest

> `readonly` **manifest**: [`ExecutableManifest`](../../generalist/namespaces/ExecutableManifest#executablemanifest)

##### program

> `readonly` **program**: [`PinnedProgram`](../../generalist/namespaces/ProgramManifest#pinnedprogram)

##### ref

> `readonly` **ref**: `object`

###### active

> `readonly` **active**: `string` & `Brand`\<`"generalist/agent-pin"`\> \| `string` & `Brand`\<`"generalist/program-pin"`\>

###### executable

> `readonly` **executable**: `string` & `Brand`\<`"generalist/executable-pin"`\>

##### registrations

> `readonly` **registrations**: readonly `object`[]

##### runId

> `readonly` **runId**: `string`

***

### StaticAgentExecutable

One exact static Agent executable bound to its persisted Agent pin.

#### Properties

##### \_tag?

> `readonly` `optional` **\_tag?**: `"Agent"`

##### agent

> `readonly` **agent**: [`Closed`](../../generalist/namespaces/Agent#closed)

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### runOptions?

> `readonly` `optional` **runOptions?**: [`StaticRunOptions`](#staticrunoptions)

***

### StaticProgramExecutable

One exact static Program executable bound to its persisted Program pin.

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Program"`

##### executable

> `readonly` **executable**: [`PinnedExecutable`](../../generalist/namespaces/ExecutableManifest#pinnedexecutable)

##### executor

> `readonly` **executor**: [`Service`](../../generalist/namespaces/CodeExecutor#service)

##### handlers

> `readonly` **handlers**: [`Handlers`](../../generalist/namespaces/ProgramHandlers#handlers)

##### program

> `readonly` **program**: [`Program`](../../generalist/namespaces/AgentProgram#program)\<`unknown`, `unknown`, `unknown`, `unknown`\>

##### services?

> `readonly` `optional` **services?**: `Layer`\<`never`, `never`, `never`\>

***

### StaticRunOptions

Resolver-owned static options attested by the persisted Agent manifest.

#### Properties

##### compaction?

> `readonly` `optional` **compaction?**: `object`

###### contextWindow

> `readonly` **contextWindow**: `number`

###### reserveTokens

> `readonly` **reserveTokens**: `number`

## Type Aliases

### ReconstructionError

> **ReconstructionError** = [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)

Typed failures allowed while reconstructing an admitted executable.

***

### Resolution

> **Resolution** = [`AgentResolution`](#agentresolution) \| [`ProgramResolution`](#programresolution)

Exactly one reconstructed executable kind.

***

### ResolveError

> **ResolveError** = [`ExecutablePinMissing`](./Errors#executablepinmissing) \| [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid) \| [`ExecutableRegistrationMissing`](./Errors#executableregistrationmissing)

Typed failures allowed while resolving one executable.

***

### StaticExecutable

> **StaticExecutable** = [`StaticAgentExecutable`](#staticagentexecutable) \| [`StaticProgramExecutable`](#staticprogramexecutable)

One exact static executable used by tests and process-local hosts.

## Variables

### Attestation

> **Attestation**: `Codec`\<[`Attestation`](#attestation-1), `unknown`, `never`, `never`\>

***

### Input

> **Input**: `Codec`\<[`Input`](#input), `unknown`, `never`, `never`\>

***

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

### layerStatic

> `const` **layerStatic**: (`executables`) => `Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Exact static resolver Layer helper.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Layer.Layer`\<[`ExecutableResolver`](#executableresolver), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

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

### makeStatic

> `const` **makeStatic**: (`executables`) => `Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

Construct an exact static resolver without resolving at admission or startup.

#### Parameters

##### executables

`ReadonlyArray`\<[`StaticExecutable`](#staticexecutable)\>

#### Returns

`Effect.Effect`\<[`Service`](#service), [`ExecutableRegistrationInvalid`](./Errors#executableregistrationinvalid)\>

***

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

### verifyAttestation

> `const` **verifyAttestation**: (`attestation`) => [`Attestation`](#attestation-1)

Verify resolver attestation against pinned identity.

#### Parameters

##### attestation

[`Attestation`](#attestation-1)

#### Returns

[`Attestation`](#attestation-1)

***

### verifyInput

> `const` **verifyInput**: (`input`) => [`Input`](#input)

Verify resolver input against its paired authority.

#### Parameters

##### input

[`Input`](#input)

#### Returns

[`Input`](#input)
