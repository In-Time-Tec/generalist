[**generalist**](../../index.md)

***

[generalist](../../index.md) / [instructions.skills](../index.md) / HttpCatalog

# HttpCatalog

## Interfaces

<a id="options"></a>

### Options

Generic HTTP skill catalog options.

#### Extends

- `Limits`

#### Properties

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

<a id="manifesturl"></a>

##### manifestUrl

> `readonly` **manifestUrl**: `string`

<a id="maxskills"></a>

##### maxSkills?

> `readonly` `optional` **maxSkills?**: `number`

###### Inherited from

`Limits.maxSkills`

<a id="toolsbyskill"></a>

##### toolsBySkill?

> `readonly` `optional` **toolsBySkill?**: `Readonly`\<`Record`\<`string`, readonly `Any`[]\>\>

###### Inherited from

`Limits.toolsBySkill`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

Build a generic HTTP catalog layer.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>

Build a generic HTTP catalog.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>
