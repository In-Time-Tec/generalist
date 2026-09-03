[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / AgentManifest

# AgentManifest

## Interfaces

### AgentManifest

Closed, reconstructable identity contract for one Agent.

#### Properties

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

##### children

> `readonly` **children**: readonly [`ChildSelection`](#childselection)[]

##### compaction?

> `readonly` `optional` **compaction?**: [`CompactionIdentity`](#compactionidentity)

##### instructions?

> `readonly` `optional` **instructions?**: `string`

##### model

> `readonly` **model**: `string` & `Brand`\<`"generalist/model-pin"`\>

##### name

> `readonly` **name**: `string`

##### policy

> `readonly` **policy**: [`PolicyIdentity`](#policyidentity)

##### programAuthority?

> `readonly` `optional` **programAuthority?**: [`ProgramAuthority`](#programauthority-1)

##### services

> `readonly` **services**: readonly [`NamedCapability`](#namedcapability)[]

##### skills

> `readonly` **skills**: readonly [`NamedCapability`](#namedcapability)[]

##### supplemental?

> `readonly` `optional` **supplemental?**: `string`

##### tools

> `readonly` **tools**: readonly [`NamedCapability`](#namedcapability)[]

##### toolScheduling

> `readonly` **toolScheduling**: [`ToolSchedulingPolicy`](./Agent#toolschedulingpolicy)

##### version

> `readonly` **version**: `"2"`

***

### ChildSelection

One child profile name this Agent may select from its executable registry.

#### Properties

##### selection

> `readonly` **selection**: `string`

***

### CompactionIdentity

Exact identity and token limits of one reconstructable compaction capability.

#### Properties

##### contextWindow

> `readonly` **contextWindow**: `number`

##### keepRecentTokens

> `readonly` **keepRecentTokens**: `number`

##### reserveTokens

> `readonly` **reserveTokens**: `number`

##### service

> `readonly` **service**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### strategyIdentity

> `readonly` **strategyIdentity**: `string`

##### summaryModel

> `readonly` **summaryModel**: `string` & `Brand`\<`"generalist/model-pin"`\>

##### summaryPromptIdentity

> `readonly` **summaryPromptIdentity**: `string`

***

### NamedCapability

One named capability required by an Agent or Agent Program.

#### Properties

##### content?

> `readonly` `optional` **content?**: `object`

###### codec

> `readonly` **codec**: `string`

###### digest

> `readonly` **digest**: `string`

###### version

> `readonly` **version**: `string`

##### name

> `readonly` **name**: `string`

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/capability-pin"`\>

***

### PinnedAgent

An Agent manifest paired with its constructor-owned digest.

#### Properties

##### manifest

> `readonly` **manifest**: [`AgentManifest`](#agentmanifest)

##### pin

> `readonly` **pin**: `string` & `Brand`\<`"generalist/agent-pin"`\>

***

### PortablePolicy

#### Properties

##### \_tag

> `readonly` **\_tag**: `"Forever"` \| `"Recurs"` \| `"UntilToolCall"` \| `"Both"`

##### count?

> `readonly` `optional` **count?**: `number`

##### first?

> `readonly` `optional` **first?**: [`PortablePolicy`](#portablepolicy)

##### name?

> `readonly` `optional` **name?**: `string`

##### second?

> `readonly` `optional` **second?**: [`PortablePolicy`](#portablepolicy)

***

### ProgramAuthority

Maximum Program authority an Agent may narrow for one dynamic child.

#### Properties

##### agents

> `readonly` **agents**: readonly `object`[]

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

##### input

> `readonly` **input**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### maxSourceBytes

> `readonly` **maxSourceBytes**: `number`

##### output

> `readonly` **output**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### sandbox

> `readonly` **sandbox**: `string` & `Brand`\<`"generalist/capability-pin"`\>

##### steps

> `readonly` **steps**: readonly [`NamedCapability`](#namedcapability)[]

##### tools

> `readonly` **tools**: readonly [`NamedCapability`](#namedcapability)[]

## Type Aliases

### PinnedContent

> **PinnedContent** = *typeof* `PinnedContent.Type`

Exact identity of the host-owned content one capability registration must reconstruct.

***

### PolicyIdentity

> **PolicyIdentity** = \{ `_tag`: `"Portable"`; `policy`: [`PortablePolicy`](#portablepolicy); \} \| \{ `_tag`: `"Pinned"`; `pin`: [`CapabilityPin`](./Pins#capabilitypin); \}

Exact identity of either a portable policy or an opaque policy capability.

## Variables

### AgentManifest

> **AgentManifest**: `Codec`\<[`AgentManifest`](#agentmanifest), `AgentManifestEncoded`, `never`, `never`\>

Closed, reconstructable identity contract for one Agent.

***

### ChildSelection

> **ChildSelection**: `Codec`\<[`ChildSelection`](#childselection), [`ChildSelection`](#childselection), `never`, `never`\>

One child profile name this Agent may select from its executable registry.

***

### CompactionIdentity

> **CompactionIdentity**: `Codec`\<[`CompactionIdentity`](#compactionidentity), `CompactionIdentityEncoded`, `never`, `never`\>

Exact identity and token limits of one reconstructable compaction capability.

***

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

### make

> `const` **make**: (`input`) => [`PinnedAgent`](#pinnedagent)

Construct and pin a canonical closed Agent manifest.

#### Parameters

##### input

`Omit`\<[`AgentManifest`](#agentmanifest), `"version"`\> & `object`

#### Returns

[`PinnedAgent`](#pinnedagent)

***

### NamedCapability

> **NamedCapability**: `Codec`\<[`NamedCapability`](#namedcapability), `NamedCapabilityEncoded`, `never`, `never`\>

One named capability required by an Agent or Agent Program.

***

### PinnedContent

> `const` **PinnedContent**: `Schema.Struct`\<\{ `codec`: `Schema.String`; `digest`: `Schema.String`; `version`: `Schema.String`; \}\>

Exact identity of the host-owned content one capability registration must reconstruct.

***

### PolicyIdentity

> **PolicyIdentity**: `Codec`\<[`PolicyIdentity`](#policyidentity), `PolicyIdentityEncoded`, `never`, `never`\>

Exact identity of either a portable policy or an opaque policy capability.

***

### PortablePolicy

> **PortablePolicy**: `Codec`\<[`PortablePolicy`](#portablepolicy), [`PortablePolicy`](#portablepolicy), `never`, `never`\>

Closed portable turn-policy constructor data.

***

### ProgramAuthority

> **ProgramAuthority**: `Struct`\<\{ `agents`: `$Array`\<`Struct`\<\{ `agent`: `brand`\<`String`, `"generalist/agent-pin"`\>; `input`: `brand`\<`String`, `"generalist/capability-pin"`\>; `selection`: `String`; \}\>\>; `budget`: `Struct`\<\{ `agentRuns`: `Int`; `concurrency`: `Int`; `logBytes`: `Int`; `outputBytes`: `Int`; `tokens`: `Int`; `toolCalls`: `Int`; `wallClockMillis`: `Int`; \}\>; `input`: `brand`\<`String`, `"generalist/capability-pin"`\>; `maxSourceBytes`: `Int`; `output`: `brand`\<`String`, `"generalist/capability-pin"`\>; `sandbox`: `brand`\<`String`, `"generalist/capability-pin"`\>; `steps`: `$Array`\<`Struct`\<\{ `content`: `optionalKey`\<`Struct`\<\{ `codec`: `String`; `digest`: `String`; `version`: `String`; \}\>\>; `name`: `String`; `pin`: `brand`\<`String`, `"generalist/capability-pin"`\>; \}\>\>; `tools`: `$Array`\<`Struct`\<\{ `content`: `optionalKey`\<`Struct`\<\{ `codec`: `String`; `digest`: `String`; `version`: `String`; \}\>\>; `name`: `String`; `pin`: `brand`\<`String`, `"generalist/capability-pin"`\>; \}\>\>; \}\>

Maximum Program authority an Agent may narrow for one dynamic child.
