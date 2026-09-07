[**generalist**](../../index.md)

***

[generalist](../../index.md) / [instructions.skills](../index.md) / GitHubCatalog

# GitHubCatalog

## Interfaces

<a id="options"></a>

### Options

Manifest-backed GitHub catalog options.

#### Extends

- `Limits`

#### Properties

<a id="apibaseurl"></a>

##### apiBaseUrl?

> `readonly` `optional` **apiBaseUrl?**: `string`

<a id="bodymaxbytes"></a>

##### bodyMaxBytes?

> `readonly` `optional` **bodyMaxBytes?**: `number`

###### Inherited from

`Limits.bodyMaxBytes`

<a id="manifestmaxbytes"></a>

##### manifestMaxBytes?

> `readonly` `optional` **manifestMaxBytes?**: `number`

###### Inherited from

`Limits.manifestMaxBytes`

<a id="manifestname"></a>

##### manifestName?

> `readonly` `optional` **manifestName?**: `string`

<a id="maxskills"></a>

##### maxSkills?

> `readonly` `optional` **maxSkills?**: `number`

###### Inherited from

`Limits.maxSkills`

<a id="owner"></a>

##### owner

> `readonly` **owner**: `string`

<a id="ref"></a>

##### ref

> `readonly` **ref**: `string`

<a id="repo"></a>

##### repo

> `readonly` **repo**: `string`

<a id="root"></a>

##### root?

> `readonly` `optional` **root?**: `string`

<a id="toolsbyskill"></a>

##### toolsBySkill?

> `readonly` `optional` **toolsBySkill?**: `Readonly`\<`Record`\<`string`, readonly `Any`[]\>\>

###### Inherited from

`Limits.toolsBySkill`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

Build a manifest-backed immutable GitHub catalog layer.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>

Build a manifest-backed immutable GitHub catalog.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>
