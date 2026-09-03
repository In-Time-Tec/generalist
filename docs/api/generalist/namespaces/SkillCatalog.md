[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / SkillCatalog

# SkillCatalog

## Classes

### SkillCatalog

#### Extends

- `SkillCatalog_base`

#### Constructors

##### Constructor

> **new SkillCatalog**(`_`): [`SkillCatalog`](#skillcatalog)

###### Parameters

###### \_

`never`

###### Returns

[`SkillCatalog`](#skillcatalog)

###### Inherited from

`SkillCatalog_base.constructor`

***

### SkillCatalogError

Skill catalog operation failed.

#### Extends

- `SkillCatalogError_base`

#### Constructors

##### Constructor

> **new SkillCatalogError**(...`args`): [`SkillCatalogError`](#skillcatalogerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`SkillCatalogError`](#skillcatalogerror)

###### Inherited from

`SkillCatalogError_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`SkillCatalogError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SkillCatalogError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`SkillCatalogError_base.message`

##### source

> `readonly` **source**: `string`

###### Inherited from

`SkillCatalogError_base.source`

## Interfaces

### Service

Skill registry seam.

#### Properties

##### all

> `readonly` **all**: `Effect`\<readonly [`Skill`](#skill)[], [`SkillCatalogError`](#skillcatalogerror)\>

##### get

> `readonly` **get**: (`name`) => `Effect`\<[`Skill`](#skill) \| `undefined`, [`SkillCatalogError`](#skillcatalogerror)\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<[`Skill`](#skill) \| `undefined`, [`SkillCatalogError`](#skillcatalogerror)\>

***

### Skill

A discovered skill.

#### Properties

##### allowedTools?

> `readonly` `optional` **allowedTools?**: readonly `string`[]

##### contextFork?

> `readonly` `optional` **contextFork?**: `boolean`

##### description

> `readonly` **description**: `string`

##### disableModelInvocation?

> `readonly` `optional` **disableModelInvocation?**: `boolean`

##### instructions

> `readonly` **instructions**: `Effect`\<`string`, [`SkillCatalogError`](#skillcatalogerror)\>

##### location?

> `readonly` `optional` **location?**: `string`

Where the skill was found, for a catalog that reads a filesystem. A host that resolves resources
beside a skill needs the directory it came from rather than one derived from its name, because
a catalog may find a skill anywhere beneath its root.

##### name

> `readonly` **name**: `string`

##### paths?

> `readonly` `optional` **paths?**: readonly `string`[]

##### tools

> `readonly` **tools**: readonly `Any`[]

##### userInvocable?

> `readonly` `optional` **userInvocable?**: `boolean`

##### whenToUse?

> `readonly` `optional` **whenToUse?**: `string`

## Variables

### descriptionLimit

> `const` **descriptionLimit**: `1024` = `1024`

Per-entry description character cap.

***

### layer

> `const` **layer**: \<`R`\>(`catalogs`) => `Layer.Layer`\<[`SkillCatalog`](#skillcatalog), [`SkillCatalogError`](#skillcatalogerror), `R`\>

Build one layer from composable catalogs.

#### Type Parameters

##### R

`R`

#### Parameters

##### catalogs

`ReadonlyArray`\<`Effect.Effect`\<[`Service`](#service), [`SkillCatalogError`](#skillcatalogerror), `R`\>\>

#### Returns

`Layer.Layer`\<[`SkillCatalog`](#skillcatalog), [`SkillCatalogError`](#skillcatalogerror), `R`\>

***

### layerEmpty

> `const` **layerEmpty**: `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

Empty skill catalog.

***

### layerSkills

> `const` **layerSkills**: (`skills`) => `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

A catalog built from in-memory skills.

#### Parameters

##### skills

`ReadonlyArray`\<[`Skill`](#skill)\>

#### Returns

`Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

***

### merge

> `const` **merge**: \{(`second`): (`first`) => [`Service`](#service); (`first`, `second`): [`Service`](#service); \}

Merge two catalogs with the second catalog winning duplicate names.

#### Call Signature

> (`second`): (`first`) => [`Service`](#service)

##### Parameters

###### second

[`Service`](#service)

##### Returns

(`first`) => [`Service`](#service)

#### Call Signature

> (`first`, `second`): [`Service`](#service)

##### Parameters

###### first

[`Service`](#service)

###### second

[`Service`](#service)

##### Returns

[`Service`](#service)

***

### selectListings

> `const` **selectListings**: \{(`budgetTokens`, `recentlyUsed`): (`skills`) => readonly [`Skill`](#skill)[]; (`skills`, `budgetTokens`, `recentlyUsed`): readonly [`Skill`](#skill)[]; \}

Select startup listings within a token budget.

#### Call Signature

> (`budgetTokens`, `recentlyUsed`): (`skills`) => readonly [`Skill`](#skill)[]

##### Parameters

###### budgetTokens

`number`

###### recentlyUsed

readonly `string`[]

##### Returns

(`skills`) => readonly [`Skill`](#skill)[]

#### Call Signature

> (`skills`, `budgetTokens`, `recentlyUsed`): readonly [`Skill`](#skill)[]

##### Parameters

###### skills

readonly [`Skill`](#skill)[]

###### budgetTokens

`number`

###### recentlyUsed

readonly `string`[]

##### Returns

readonly [`Skill`](#skill)[]
