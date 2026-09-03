[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / PackageCatalog

# PackageCatalog

## Classes

### PackageCatalog

#### Extends

- `PackageCatalog_base`

#### Constructors

##### Constructor

> **new PackageCatalog**(`_`): [`PackageCatalog`](#packagecatalog)

###### Parameters

###### \_

`never`

###### Returns

[`PackageCatalog`](#packagecatalog)

###### Inherited from

`PackageCatalog_base.constructor`

***

### PackageCatalogError

Package resolution or loading failed.

#### Extends

- `PackageCatalogError_base`

#### Constructors

##### Constructor

> **new PackageCatalogError**(...`args`): [`PackageCatalogError`](#packagecatalogerror)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PackageCatalogError`](#packagecatalogerror)

###### Inherited from

`PackageCatalogError_base.constructor`

#### Properties

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`PackageCatalogError_base.cause`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PackageCatalogError_base.hint`

##### message

> `readonly` **message**: `string`

###### Inherited from

`PackageCatalogError_base.message`

##### source

> `readonly` **source**: `string`

###### Inherited from

`PackageCatalogError_base.source`

***

### PackageIntegrityMismatch

A package does not match its locked integrity or resolution.

#### Extends

- `PackageIntegrityMismatch_base`

#### Constructors

##### Constructor

> **new PackageIntegrityMismatch**(...`args`): [`PackageIntegrityMismatch`](#packageintegritymismatch)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`PackageIntegrityMismatch`](#packageintegritymismatch)

###### Inherited from

`PackageIntegrityMismatch_base.constructor`

#### Properties

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.actual`

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.expected`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.hint`

##### specifier

> `readonly` **specifier**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.specifier`

## Interfaces

### Options

Package catalog configuration.

#### Properties

##### allowTools?

> `readonly` `optional` **allowTools?**: `boolean`

##### cacheDir

> `readonly` **cacheDir**: `string`

##### githubApiUrl?

> `readonly` `optional` **githubApiUrl?**: `string`

##### lock

> `readonly` **lock**: `string`

##### npmRegistryUrl?

> `readonly` `optional` **npmRegistryUrl?**: `string`

##### packages

> `readonly` **packages**: readonly `string`[]

***

### Service

A resolved package catalog.

#### Properties

##### handlers

> `readonly` **handlers**: `Layer`\<`Handler`\<`string`\>\>

Every installed package's tool handlers; provide it wherever the toolkit runs.

##### instructions

> `readonly` **instructions**: readonly [`Provider`](../index#provider)\<`never`\>[]

##### skills

> `readonly` **skills**: [`Service`](../../generalist/namespaces/SkillCatalog#service)

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`Record`\<`string`, `PackageTool`\>\>

## Variables

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`PackageCatalog`](#packagecatalog), [`PackageCatalogError`](#packagecatalogerror) \| [`PackageIntegrityMismatch`](#packageintegritymismatch), `FileSystem.FileSystem` \| `Path.Path` \| `HttpClient.HttpClient` \| `Crypto.Crypto`\>

Resolve packages and hold their catalog for the Layer scope.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`PackageCatalog`](#packagecatalog), [`PackageCatalogError`](#packagecatalogerror) \| [`PackageIntegrityMismatch`](#packageintegritymismatch), `FileSystem.FileSystem` \| `Path.Path` \| `HttpClient.HttpClient` \| `Crypto.Crypto`\>
