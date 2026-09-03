[**generalist**](../../index)

***

[generalist](../../index) / [instructions](../index) / PackageCatalog

# PackageCatalog

## Classes

<a id="packagecatalog"></a>

### PackageCatalog

#### Extends

- `PackageCatalog_base`

#### Constructors

<a id="constructor"></a>

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

<a id="packagecatalogerror"></a>

### PackageCatalogError

Package resolution or loading failed.

#### Extends

- `PackageCatalogError_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="cause"></a>

##### cause?

> `readonly` `optional` **cause?**: `unknown`

###### Inherited from

`PackageCatalogError_base.cause`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PackageCatalogError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

###### Inherited from

`PackageCatalogError_base.message`

<a id="source"></a>

##### source

> `readonly` **source**: `string`

###### Inherited from

`PackageCatalogError_base.source`

***

<a id="packageintegritymismatch"></a>

### PackageIntegrityMismatch

A package does not match its locked integrity or resolution.

#### Extends

- `PackageIntegrityMismatch_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="actual"></a>

##### actual

> `readonly` **actual**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.actual`

<a id="expected"></a>

##### expected

> `readonly` **expected**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.expected`

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.hint`

<a id="specifier"></a>

##### specifier

> `readonly` **specifier**: `string`

###### Inherited from

`PackageIntegrityMismatch_base.specifier`

## Interfaces

<a id="options"></a>

### Options

Package catalog configuration.

#### Properties

<a id="allowtools"></a>

##### allowTools?

> `readonly` `optional` **allowTools?**: `boolean`

<a id="cachedir"></a>

##### cacheDir

> `readonly` **cacheDir**: `string`

<a id="githubapiurl"></a>

##### githubApiUrl?

> `readonly` `optional` **githubApiUrl?**: `string`

<a id="lock"></a>

##### lock

> `readonly` **lock**: `string`

<a id="npmregistryurl"></a>

##### npmRegistryUrl?

> `readonly` `optional` **npmRegistryUrl?**: `string`

<a id="packages"></a>

##### packages

> `readonly` **packages**: readonly `string`[]

***

<a id="service"></a>

### Service

A resolved package catalog.

#### Properties

<a id="handlers"></a>

##### handlers

> `readonly` **handlers**: `Layer`\<`Handler`\<`string`\>\>

Every installed package's tool handlers; provide it wherever the toolkit runs.

<a id="instructions"></a>

##### instructions

> `readonly` **instructions**: readonly [`Provider`](../index#provider)\<`never`\>[]

<a id="skills"></a>

##### skills

> `readonly` **skills**: [`Service`](../../generalist/namespaces/SkillCatalog#service)

<a id="toolkit"></a>

##### toolkit

> `readonly` **toolkit**: `Toolkit`\<`Record`\<`string`, `PackageTool`\>\>

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<[`PackageCatalog`](#packagecatalog), [`PackageCatalogError`](#packagecatalogerror) \| [`PackageIntegrityMismatch`](#packageintegritymismatch), `FileSystem.FileSystem` \| `Path.Path` \| `HttpClient.HttpClient` \| `Crypto.Crypto`\>

Resolve packages and hold their catalog for the Layer scope.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<[`PackageCatalog`](#packagecatalog), [`PackageCatalogError`](#packagecatalogerror) \| [`PackageIntegrityMismatch`](#packageintegritymismatch), `FileSystem.FileSystem` \| `Path.Path` \| `HttpClient.HttpClient` \| `Crypto.Crypto`\>
