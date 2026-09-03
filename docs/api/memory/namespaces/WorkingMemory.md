[**generalist**](../../index)

***

[generalist](../../index) / [memory](../index) / WorkingMemory

# WorkingMemory

## Interfaces

<a id="options"></a>

### Options

#### Properties

<a id="maxmessages"></a>

##### maxMessages?

> `readonly` `optional` **maxMessages?**: `number`

<a id="summarize"></a>

##### summarize?

> `readonly` `optional` **summarize?**: [`SummarizeOptions`](#summarizeoptions)

***

<a id="summarizeoptions"></a>

### SummarizeOptions

#### Properties

<a id="model"></a>

##### model?

> `readonly` `optional` **model?**: `Layer`\<`LanguageModel`, `never`, `never`\>

Model layer for summary calls; omit to use the model provided where this layer is built.

<a id="prompt"></a>

##### prompt?

> `readonly` `optional` **prompt?**: `string`

## Type Aliases

<a id="summaryrequirement"></a>

### SummaryRequirement

> **SummaryRequirement**\<`O`\> = `O` *extends* `object` ? `never` : `O` *extends* `object` ? \[`Extract`\<`S`, [`SummarizeOptions`](#summarizeoptions)\>\] *extends* \[`never`\] ? `never` : `LanguageModel.LanguageModel` : `never`

**`Internal`**

The ambient LanguageModel is required only when summarizing without an explicit model layer.

#### Type Parameters

##### O

`O`

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**(): `Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory)\>

##### Returns

`Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory)\>

#### Call Signature

> **layer**\<`O`\>(`options`): `Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`SummaryRequirement`](#summaryrequirement)\<`O`\>\>

##### Type Parameters

###### O

`O` *extends* [`Options`](#options)

##### Parameters

###### options

`O`

##### Returns

`Layer`\<[`Memory`](../../generalist/namespaces/Memory#memory), `never`, [`SummaryRequirement`](#summaryrequirement)\<`O`\>\>

***

<a id="make"></a>

### make()

#### Call Signature

> **make**(): `Effect`\<[`Service`](../../generalist/namespaces/Memory#service)\>

##### Returns

`Effect`\<[`Service`](../../generalist/namespaces/Memory#service)\>

#### Call Signature

> **make**\<`O`\>(`options`): `Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`SummaryRequirement`](#summaryrequirement)\<`O`\>\>

##### Type Parameters

###### O

`O` *extends* [`Options`](#options)

##### Parameters

###### options

`O`

##### Returns

`Effect`\<[`Service`](../../generalist/namespaces/Memory#service), `never`, [`SummaryRequirement`](#summaryrequirement)\<`O`\>\>
