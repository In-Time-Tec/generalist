[**generalist**](../../index.md)

***

[generalist](../../index.md) / [instructions.skills](../index.md) / S3Catalog

# S3Catalog

## Interfaces

<a id="options"></a>

### Options

Manifest-backed S3 catalog options.

#### Extends

- `Limits`

#### Properties

<a id="bodymaxbytes"></a>

##### bodyMaxBytes?

> `readonly` `optional` **bodyMaxBytes?**: `number`

###### Inherited from

`Limits.bodyMaxBytes`

<a id="bucket"></a>

##### bucket

> `readonly` **bucket**: `string`

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

<a id="prefix"></a>

##### prefix?

> `readonly` `optional` **prefix?**: `string`

<a id="region"></a>

##### region

> `readonly` **region**: `string`

<a id="toolsbyskill"></a>

##### toolsBySkill?

> `readonly` `optional` **toolsBySkill?**: `Readonly`\<`Record`\<`string`, readonly `Any`[]\>\>

###### Inherited from

`Limits.toolsBySkill`

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

Build a manifest-backed S3 catalog layer.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`ReturnType`\<*typeof* [`layer`](../../generalist/namespaces/SkillCatalog.md#layer)\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>

Build a manifest-backed S3 catalog.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `Crypto` \| `HttpClient`\>
