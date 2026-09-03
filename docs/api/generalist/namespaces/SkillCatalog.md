[**generalist**](../../index)

***

[generalist](../../index) / [generalist](../index) / SkillCatalog

# SkillCatalog

## Classes

<a id="skillcatalog"></a>

### SkillCatalog

#### Extends

- `SkillCatalog_base`

#### Constructors

<a id="constructor"></a>

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

<a id="skillcatalogerror"></a>

### SkillCatalogError

Skill catalog operation failed.

#### Extends

- `SkillCatalogError_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`SkillCatalogError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`SkillCatalogError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`SkillCatalogError_base.message`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`SkillCatalogError_base.source`

## Interfaces

<a id="service"></a>

### Service

Skill registry seam.

#### Properties

<a id="all"></a>

##### all

> `readonly` **all**: `Effect`\<readonly [`Skill`](#skill)[], [`SkillCatalogError`](#skillcatalogerror)\>

<a id="get"></a>

##### get

> `readonly` **get**: (`name`) => `Effect`\<[`Skill`](#skill) \| `undefined`, [`SkillCatalogError`](#skillcatalogerror)\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<[`Skill`](#skill) \| `undefined`, [`SkillCatalogError`](#skillcatalogerror)\>

***

<a id="skill"></a>

### Skill

A discovered skill.

#### Properties

<a id="allowedtools"></a>

##### allowedTools?

> `readonly` `optional` **allowedTools?**: readonly `string`[]

<a id="contextfork"></a>

##### contextFork?

> `readonly` `optional` **contextFork?**: `boolean`

<a id="description"></a>

##### description

> `readonly` **description**: `string`

<a id="disablemodelinvocation"></a>

##### disableModelInvocation?

> `readonly` `optional` **disableModelInvocation?**: `boolean`

<a id="instructions"></a>

##### instructions

> `readonly` **instructions**: `Effect`\<`string`, [`SkillCatalogError`](#skillcatalogerror)\>

<a id="location"></a>

##### location?

> `readonly` `optional` **location?**: `string`

Where the skill was found, for a catalog that reads a filesystem. A host that resolves resources
beside a skill needs the directory it came from rather than one derived from its name, because
a catalog may find a skill anywhere beneath its root.

<a id="name"></a>

##### name

> `readonly` **name**: `string`

<a id="paths"></a>

##### paths?

> `readonly` `optional` **paths?**: readonly `string`[]

<a id="tools"></a>

##### tools

> `readonly` **tools**: readonly `Any`[]

<a id="userinvocable"></a>

##### userInvocable?

> `readonly` `optional` **userInvocable?**: `boolean`

<a id="whentouse"></a>

##### whenToUse?

> `readonly` `optional` **whenToUse?**: `string`

## Variables

<a id="descriptionlimit"></a>

### descriptionLimit

> `const` **descriptionLimit**: `1024` = `1024`

Per-entry description character cap.

***

<a id="layer"></a>

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

<a id="layerempty"></a>

### layerEmpty

> `const` **layerEmpty**: `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

Empty skill catalog.

***

<a id="layerskills"></a>

### layerSkills

> `const` **layerSkills**: (`skills`) => `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

A catalog built from in-memory skills.

#### Parameters

##### skills

`ReadonlyArray`\<[`Skill`](#skill)\>

#### Returns

`Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`SkillCatalog`](#skillcatalog)\>

***

<a id="merge"></a>

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

<a id="selectlistings"></a>

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
