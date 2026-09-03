[**generalist**](./index)

***

[generalist](./index) / unstable.rlm

# unstable.rlm

## Interfaces

<a id="options"></a>

### Options

**`Experimental`**

RLM model layers and recursion limits.

#### Type Parameters

##### RootError

`RootError`

##### RootRequirements

`RootRequirements`

##### LeafError

`LeafError`

##### LeafRequirements

`LeafRequirements`

#### Properties

<a id="leaf"></a>

##### leaf

> `readonly` **leaf**: `Layer`\<`LanguageModel`, `LeafError`, `LeafRequirements`\>

**`Experimental`**

<a id="maxdepth"></a>

##### maxDepth

> `readonly` **maxDepth**: `number`

**`Experimental`**

<a id="maxsubcalls"></a>

##### maxSubCalls

> `readonly` **maxSubCalls**: `number`

**`Experimental`**

<a id="root"></a>

##### root

> `readonly` **root**: `Layer`\<`LanguageModel`, `RootError`, `RootRequirements`\>

**`Experimental`**

***

<a id="rlmoffloadoptions"></a>

### RlmOffloadOptions

**`Experimental`**

Options for retaining recent context while moving older turns into the RLM Sandbox.

#### Properties

<a id="keeprecenttokens"></a>

##### keepRecentTokens

> `readonly` **keepRecentTokens**: `number`

**`Experimental`**

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: \<`RootError`, `RootRequirements`, `LeafError`, `LeafRequirements`\>(`options`) => `Layer.Layer`\<`LanguageModel.LanguageModel`, `RootError` \| `LeafError`, [`SandboxProvider`](./sandbox#sandboxprovider) \| `RootRequirements` \| `LeafRequirements`\>

**`Experimental`**

Provide a Recursive Language Model as an Effect AI LanguageModel.

#### Type Parameters

##### RootError

`RootError`

##### RootRequirements

`RootRequirements`

##### LeafError

`LeafError`

##### LeafRequirements

`LeafRequirements`

#### Parameters

##### options

[`Options`](#options)\<`RootError`, `RootRequirements`, `LeafError`, `LeafRequirements`\>

#### Returns

`Layer.Layer`\<`LanguageModel.LanguageModel`, `RootError` \| `LeafError`, [`SandboxProvider`](./sandbox#sandboxprovider) \| `RootRequirements` \| `LeafRequirements`\>

***

<a id="rlmoffload"></a>

### rlmOffload

> `const` **rlmOffload**: (`options`) => [`StrategyPart`](./compaction#strategypart)

**`Experimental`**

Move compacted turns into the RLM Sandbox instead of summarizing them.

#### Parameters

##### options

[`RlmOffloadOptions`](#rlmoffloadoptions)

#### Returns

[`StrategyPart`](./compaction#strategypart)
