[**generalist**](../../index)

***

[generalist](../../index) / [instructions.skills](../index) / FileSystemCatalog

# FileSystemCatalog

## Interfaces

### Options

Filesystem skill catalog options.

#### Properties

##### cwd

> `readonly` **cwd**: `string`

##### frontmatterMaxBytes?

> `readonly` `optional` **frontmatterMaxBytes?**: `number`

##### roots?

> `readonly` `optional` **roots?**: readonly `string`[]

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`SkillCatalog`](../../generalist/namespaces/SkillCatalog#skillcatalog), [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

Build a SkillCatalog layer from filesystem roots.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`SkillCatalog`](../../generalist/namespaces/SkillCatalog#skillcatalog), [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

***

### make

> `const` **make**: (`options`) => `Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>

Build a composable SkillCatalog from filesystem roots.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<\{ `all`: `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog#skill)[], `never`, `never`\>; `get`: (`name`) => `Effect.Effect`\<[`Skill`](../../generalist/namespaces/SkillCatalog#skill) \| `undefined`, `never`, `never`\>; \}, [`SkillCatalogError`](../../generalist/namespaces/SkillCatalog#skillcatalogerror), `FileSystem.FileSystem` \| `Path.Path`\>
