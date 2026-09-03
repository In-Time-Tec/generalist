[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentManifest

# AgentManifest

## Interfaces

<a id="agentmanifest"></a>

### AgentManifest

Closed, reconstructable identity contract for one Agent.

#### Properties

<a id="budget"></a>

##### budget

> `readonly` **budget**: `object`

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

<a id="children"></a>

##### children

> `readonly` **children**: readonly [`ChildSelection`](#childselection)[]

<a id="compaction"></a>

##### compaction?

> `readonly` `optional` **compaction?**: [`CompactionIdentity`](#compactionidentity)

<a id="instructions"></a>

##### instructions?

> `readonly` `optional` **instructions?**: `string`

<a id="model"></a>

##### model

> `readonly` **model**: `string` & `Brand`\<`"generalist/model-pin"`\>

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="policy"></a>

##### policy

> `readonly` **policy**: [`PolicyIdentity`](#policyidentity)

<a id="programauthority"></a>

##### programAuthority?

> `readonly` `optional` **programAuthority?**: [`ProgramAuthority`](#programauthority-1)

<a id="services"></a>

##### services

> `readonly` **services**: readonly [`NamedCapability`](#namedcapability)[]

<a id="skills"></a>

##### skills

> `readonly` **skills**: readonly [`NamedCapability`](#namedcapability)[]

<a id="supplemental"></a>

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

<a id="tools"></a>

##### tools

> `readonly` **tools**: readonly [`NamedCapability`](#namedcapability)[]

<a id="toolscheduling"></a>

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](./Agent#toolschedulingpolicy)

<a id="version"></a>

##### version

> `readonly` **version**: `"2"`

***

<a id="childselection"></a>

### ChildSelection

One child profile name this Agent may select from its executable registry.

#### Properties

<a id="selection"></a>

##### selection

> `readonly` **selection**: `string`

***

<a id="compactionidentity"></a>

### CompactionIdentity

Exact identity and token limits of one reconstructable compaction capability.

#### Properties

<a id="contextwindow"></a>

##### contextWindow

> `readonly` **contextWindow**: `number`

<a id="keeprecenttokens"></a>

##### keepRecentTokens

> `readonly` **keepRecentTokens**: `number`

<a id="reservetokens"></a>

##### reserveTokens

> `readonly` **reserveTokens**: `number`

<a id="service"></a>

##### service

> `readonly` **service**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="strategyidentity"></a>

##### strategyIdentity

> `readonly` **strategyIdentity**: `string`

<a id="summarymodel"></a>

##### summaryModel

> `readonly` **summaryModel**: `string` & `Brand`\<`"generalist/model-pin"`\>

<a id="summarypromptidentity"></a>

##### summaryPromptIdentity

> `readonly` **summaryPromptIdentity**: `string`

***

<a id="namedcapability"></a>

### NamedCapability

One named capability required by an Agent or Agent Program.

#### Properties

<a id="content"></a>

##### content?

> `readonly` `optional` **content?**: `object`

###### codec

> `readonly` **codec**: `string`

###### digest

> `readonly` **digest**: `string`

###### version

> `readonly` **version**: `string`

<a id="name-1"></a>

##### name

> `readonly` **name**: `string`

<a id="pin"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

***

<a id="pinnedagent"></a>

### PinnedAgent

An Agent manifest paired with its constructor-owned digest.

#### Properties

<a id="manifest"></a>

##### manifest

> `readonly` **manifest**: [`AgentManifest`](#agentmanifest)

<a id="pin-1"></a>

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/agent-pin"`\>

***

<a id="portablepolicy"></a>

### PortablePolicy

#### Properties

<a id="_tag"></a>

##### \_tag

> `readonly` **\_tag**: `"Forever"` \| `"Recurs"` \| `"UntilToolCall"` \| `"Both"`

<a id="count"></a>

##### count?

> `readonly` `optional` **count?**: `number`

<a id="first"></a>

##### first?

> `readonly` `optional` **first?**: [`PortablePolicy`](#portablepolicy)

<a id="name-2"></a>

##### name?

> `readonly` `optional` **name?**: `string`

<a id="second"></a>

##### second?

> `readonly` `optional` **second?**: [`PortablePolicy`](#portablepolicy)

***

<a id="programauthority-1"></a>

### ProgramAuthority

Maximum Program authority an Agent may narrow for one dynamic child.

#### Properties

<a id="agents"></a>

##### agents

> `readonly` **agents**: readonly `object`[]

<a id="budget-1"></a>

##### budget

> `readonly` **budget**: `object`

###### agentRuns

> `readonly` **agentRuns**: `number`

###### concurrency

> `readonly` **concurrency**: `number`

###### logBytes

> `readonly` **logBytes**: `number`

###### outputBytes

> `readonly` **outputBytes**: `number`

###### tokens

> `readonly` **tokens**: `number`

###### toolCalls

> `readonly` **toolCalls**: `number`

###### wallClockMillis

> `readonly` **wallClockMillis**: `number`

<a id="input"></a>

##### input

> `readonly` **input**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="maxsourcebytes"></a>

##### maxSourceBytes

> `readonly` **maxSourceBytes**: `number`

<a id="output"></a>

##### output

> `readonly` **output**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="sandbox"></a>

##### sandbox

> `readonly` **sandbox**: `string` & `Brand`\<`"generalist/capability-pin"`\>

<a id="steps"></a>

##### steps

> `readonly` **steps**: readonly [`NamedCapability`](#namedcapability)[]

<a id="tools-1"></a>

##### tools

> `readonly` **tools**: readonly [`NamedCapability`](#namedcapability)[]

## Type Aliases

<a id="pinnedcontent"></a>

### PinnedContent

> **PinnedContent** = *typeof* `PinnedContent.Type`

Exact identity of the host-owned content one capability registration must reconstruct.

***

<a id="policyidentity"></a>

### PolicyIdentity

> **PolicyIdentity** = \{ `_tag`: `"Portable"`; `policy`: [`PortablePolicy`](#portablepolicy); \} \| \{ `_tag`: `"Pinned"`; `pin`: [`CapabilityPin`](./Pins#capabilitypin); \}

Exact identity of either a portable policy or an opaque policy capability.

## Variables

<a id="agentmanifest-1"></a>

### AgentManifest

> **AgentManifest**: `Codec`\<[`AgentManifest`](#agentmanifest), `AgentManifestEncoded`, `never`, `never`\>

Closed, reconstructable identity contract for one Agent.

***

<a id="childselection-1"></a>

### ChildSelection

> **ChildSelection**: `Codec`\<[`ChildSelection`](#childselection), [`ChildSelection`](#childselection), `never`, `never`\>

One child profile name this Agent may select from its executable registry.

***

<a id="compactionidentity-1"></a>

### CompactionIdentity

> **CompactionIdentity**: `Codec`\<[`CompactionIdentity`](#compactionidentity), `CompactionIdentityEncoded`, `never`, `never`\>

Exact identity and token limits of one reconstructable compaction capability.

***

<a id="fromliveagent"></a>

### fromLiveAgent

> `const` **fromLiveAgent**: \{\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`identity`): (`agent`) => [`PinnedAgent`](#pinnedagent); \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`agent`, `identity`): [`PinnedAgent`](#pinnedagent); \}

Build an exact manifest for a live Agent using explicitly supplied opaque dependencies.

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`identity`): (`agent`) => [`PinnedAgent`](#pinnedagent)

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

##### Parameters

###### identity

###### budget

[`BudgetLimits`](./RunBudget#budgetlimits)

###### children

`ReadonlyArray`\<[`ChildSelection`](#childselection)\>

###### compaction?

[`CompactionIdentity`](#compactionidentity)

###### model

[`ModelPin`](./Pins#modelpin)

###### policy

[`PolicyIdentity`](#policyidentity)

###### programAuthority?

[`ProgramAuthority`](#programauthority-1)

###### services

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

###### skills

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

###### tools

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

##### Returns

(`agent`) => [`PinnedAgent`](#pinnedagent)

#### Call Signature

> \<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`\>(`agent`, `identity`): [`PinnedAgent`](#pinnedagent)

##### Type Parameters

###### Tools

`Tools` *extends* `Record`\<`string`, `Any`\>

###### R

`R`

###### PolicyServices

`PolicyServices`

###### AuthorizationServices

`AuthorizationServices`

##### Parameters

###### agent

[`Agent`](./Agent#agent)\<`Tools`, `R`, `PolicyServices`, `AuthorizationServices`, `Top`, `Top`\>

###### identity

###### budget

[`BudgetLimits`](./RunBudget#budgetlimits)

###### children

`ReadonlyArray`\<[`ChildSelection`](#childselection)\>

###### compaction?

[`CompactionIdentity`](#compactionidentity)

###### model

[`ModelPin`](./Pins#modelpin)

###### policy

[`PolicyIdentity`](#policyidentity)

###### programAuthority?

[`ProgramAuthority`](#programauthority-1)

###### services

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

###### skills

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

###### tools

`ReadonlyArray`\<[`NamedCapability`](#namedcapability)\>

##### Returns

[`PinnedAgent`](#pinnedagent)

***

<a id="make"></a>

### make

> `const` **make**: (`input`) => [`PinnedAgent`](#pinnedagent)

Construct and pin a canonical closed Agent manifest.

#### Parameters

##### input

`Omit`\<[`AgentManifest`](#agentmanifest), `"version"`\> & `object`

#### Returns

[`PinnedAgent`](#pinnedagent)

***

<a id="namedcapability-1"></a>

### NamedCapability

> **NamedCapability**: `Codec`\<[`NamedCapability`](#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>

One named capability required by an Agent or Agent Program.

***

<a id="pinnedcontent-1"></a>

### PinnedContent

> `const` **PinnedContent**: `Schema.Struct`\<\{ `codec`: `Schema.String`; `digest`: `Schema.String`; `version`: `Schema.String`; \}\>

Exact identity of the host-owned content one capability registration must reconstruct.

***

<a id="policyidentity-1"></a>

### PolicyIdentity

> **PolicyIdentity**: `Codec`\<[`PolicyIdentity`](#policyidentity), `PolicyIdentityEncoded`, `never`, `never`\>

Exact identity of either a portable policy or an opaque policy capability.

***

<a id="portablepolicy-1"></a>

### PortablePolicy

> **PortablePolicy**: `Codec`\<[`PortablePolicy`](#portablepolicy), [`PortablePolicy`](#portablepolicy), `never`, `never`\>

Closed portable turn-policy constructor data.

***

<a id="programauthority-2"></a>

### ProgramAuthority

> **ProgramAuthority**: `Struct`\<\{ `agents`: `$Array`\<`Struct`\<\{ `agent`: `brand`\<`String`, `"generalist/agent-pin"`\>; `input`: `brand`\<`String`, `"generalist/capability-pin"`\>; `selection`: `String`; \}\>\>; `budget`: `Struct`\<\{ `agentRuns`: `Int`; `concurrency`: `Int`; `logBytes`: `Int`; `outputBytes`: `Int`; `tokens`: `Int`; `toolCalls`: `Int`; `wallClockMillis`: `Int`; \}\>; `input`: `brand`\<`String`, `"generalist/capability-pin"`\>; `maxSourceBytes`: `Int`; `output`: `brand`\<`String`, `"generalist/capability-pin"`\>; `sandbox`: `brand`\<`String`, `"generalist/capability-pin"`\>; `steps`: `$Array`\<`Struct`\<\{ `content`: `optionalKey`\<`Struct`\<\{ `codec`: `String`; `digest`: `String`; `version`: `String`; \}\>\>; `name`: `String`; `pin`: `brand`\<`String`, `"generalist/capability-pin"`\>; \}\>\>; `tools`: `$Array`\<`Struct`\<\{ `content`: `optionalKey`\<`Struct`\<\{ `codec`: `String`; `digest`: `String`; `version`: `String`; \}\>\>; `name`: `String`; `pin`: `brand`\<`String`, `"generalist/capability-pin"`\>; \}\>\>; \}\>

Maximum Program authority an Agent may narrow for one dynamic child.
