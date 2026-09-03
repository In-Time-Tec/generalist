[**generalist**](./index)

***

[generalist](./index) / memo

# memo

## Classes

<a id="dependencies"></a>

### Dependencies

#### Extends

- `Dependencies_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Dependencies**(`_`): [`Dependencies`](#dependencies)

###### Parameters

###### \_

`never`

###### Returns

[`Dependencies`](#dependencies)

###### Inherited from

`Dependencies_base.constructor`

***

<a id="store"></a>

### Store

#### Extends

- `Store_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new Store**(`_`): [`Store`](#store)

###### Parameters

###### \_

`never`

###### Returns

[`Store`](#store)

###### Inherited from

`Store_base.constructor`

## Interfaces

<a id="dependencyoptions"></a>

### DependencyOptions

#### Properties

<a id="capabilityscope"></a>

##### capabilityScope

> `readonly` **capabilityScope**: `string`

<a id="tenant"></a>

##### tenant

> `readonly` **tenant**: `string`

<a id="versions"></a>

##### versions

> `readonly` **versions**: `Readonly`\<`Record`\<`string`, `string`\>\>

***

<a id="dependencyservice"></a>

### DependencyService

#### Properties

<a id="capabilityscope-1"></a>

##### capabilityScope

> `readonly` **capabilityScope**: `string`

<a id="tenant-1"></a>

##### tenant

> `readonly` **tenant**: `string`

<a id="version"></a>

##### version

> `readonly` **version**: (`name`) => `Effect`\<`string`\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<`string`\>

***

<a id="entry"></a>

### Entry

#### Extends

- [`Provenance`](#provenance)

#### Properties

<a id="expiresatmillis"></a>

##### expiresAtMillis

> `readonly` **expiresAtMillis**: `number`

<a id="fromoperation"></a>

##### fromOperation

> `readonly` **fromOperation**: `string`

###### Inherited from

[`Provenance`](#provenance).[`fromOperation`](#fromoperation-1)

<a id="fromrun"></a>

##### fromRun

> `readonly` **fromRun**: `string`

###### Inherited from

[`Provenance`](#provenance).[`fromRun`](#fromrun-1)

<a id="value"></a>

##### value

> `readonly` **value**: `unknown`

***

<a id="layeroptions"></a>

### LayerOptions

#### Properties

<a id="models"></a>

##### models?

> `readonly` `optional` **models?**: [`Models`](#models-1)

***

<a id="models-1"></a>

### Models

#### Properties

<a id="enabled"></a>

##### enabled

> `readonly` **enabled**: `boolean`

***

<a id="modelsoptions"></a>

### ModelsOptions

#### Properties

<a id="enabled-1"></a>

##### enabled

> `readonly` **enabled**: `boolean`

***

<a id="provenance"></a>

### Provenance

#### Extended by

- [`Entry`](#entry)

#### Properties

<a id="fromoperation-1"></a>

##### fromOperation

> `readonly` **fromOperation**: `string`

<a id="fromrun-1"></a>

##### fromRun

> `readonly` **fromRun**: `string`

***

<a id="pureoptions"></a>

### PureOptions

#### Properties

<a id="dependson"></a>

##### dependsOn?

> `readonly` `optional` **dependsOn?**: readonly `string`[]

<a id="ttl"></a>

##### ttl

> `readonly` **ttl**: `Input`

***

<a id="storeservice"></a>

### StoreService

#### Properties

<a id="get"></a>

##### get

> `readonly` **get**: (`key`) => `Effect`\<`Option`\<[`Entry`](#entry)\>\>

###### Parameters

###### key

`string`

###### Returns

`Effect`\<`Option`\<[`Entry`](#entry)\>\>

<a id="modelsenabled-1"></a>

##### modelsEnabled

> `readonly` **modelsEnabled**: `boolean`

<a id="put"></a>

##### put

> `readonly` **put**: (`key`, `entry`) => `Effect`\<`void`\>

###### Parameters

###### key

`string`

###### entry

[`Entry`](#entry)

###### Returns

`Effect`\<`void`\>

## Variables

<a id="layerdependencies"></a>

### layerDependencies

> `const` **layerDependencies**: (`options`) => `Layer.Layer`\<[`Dependencies`](#dependencies)\>

#### Parameters

##### options

[`DependencyOptions`](#dependencyoptions)

#### Returns

`Layer.Layer`\<[`Dependencies`](#dependencies)\>

***

<a id="layermemory"></a>

### layerMemory

> `const` **layerMemory**: (`options?`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Store`](#store)\>

***

<a id="layersql"></a>

### layerSql

> `const` **layerSql**: (`options?`) => `Layer.Layer`\<[`Store`](#store), `never`, `SqlClient.SqlClient`\>

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Store`](#store), `never`, `SqlClient.SqlClient`\>

***

<a id="models-2"></a>

### models

> `const` **models**: (`options`) => [`Models`](#models-1)

#### Parameters

##### options

[`ModelsOptions`](#modelsoptions)

#### Returns

[`Models`](#models-1)

***

<a id="pure"></a>

### pure

> `const` **pure**: (`options`) => \<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>

#### Parameters

##### options

[`PureOptions`](#pureoptions)

#### Returns

\<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>
