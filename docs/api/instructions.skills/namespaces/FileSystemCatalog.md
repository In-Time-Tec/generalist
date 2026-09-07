[**generalist**](../../index.md)

***

[generalist](../../index.md) / [instructions.skills](../index.md) / FileSystemCatalog

# FileSystemCatalog

## Interfaces

<a id="options"></a>

### Options

Filesystem skill catalog options.

#### Properties

<a id="cwd"></a>

##### cwd

> `readonly` **cwd**: `string`

<a id="frontmattermaxbytes"></a>

##### frontmatterMaxBytes?

> `readonly` `optional` **frontmatterMaxBytes?**: `number`

<a id="roots"></a>

##### roots?

> `readonly` `optional` **roots?**: readonly `string`[]

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SkillCatalog`](../../generalist/namespaces/SkillCatalog.md#skillcatalog), [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

Build a SkillCatalog layer from filesystem roots.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SkillCatalog`](../../generalist/namespaces/SkillCatalog.md#skillcatalog), [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

Build a composable SkillCatalog from filesystem roots.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog.md#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog.md#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>
