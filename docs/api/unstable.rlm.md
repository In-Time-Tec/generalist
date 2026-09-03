[**generalist**](./index)

***

[generalist](./index) / unstable.rlm

# unstable.rlm

## Interfaces

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

##### leaf

> `readonly` **leaf**: `Layer`\<`LanguageModel`, `LeafError`, `LeafRequirements`\>

**`Experimental`**

##### maxDepth

> `readonly` **maxDepth**: `number`

**`Experimental`**

##### maxSubCalls

> `readonly` **maxSubCalls**: `number`

**`Experimental`**

##### root

> `readonly` **root**: `Layer`\<`LanguageModel`, `RootError`, `RootRequirements`\>

**`Experimental`**

***

### RlmOffloadOptions

**`Experimental`**

Options for retaining recent context while moving older turns into the RLM Sandbox.

#### Properties

##### keepRecentTokens

> `readonly` **keepRecentTokens**: `number`

**`Experimental`**

## Variables

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

### rlmOffload

> `const` **rlmOffload**: (`options`) => [`StrategyPart`](./compaction#strategypart)

**`Experimental`**

Move compacted turns into the RLM Sandbox instead of summarizing them.

#### Parameters

##### options

[`RlmOffloadOptions`](#rlmoffloadoptions)

#### Returns

[`StrategyPart`](./compaction#strategypart)
