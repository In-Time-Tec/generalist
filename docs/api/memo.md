[**generalist**](./index)

***

[generalist](./index) / memo

# memo

## Classes

### Dependencies

#### Extends

- `Dependencies_base`

#### Constructors

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

### Store

#### Extends

- `Store_base`

#### Constructors

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

### DependencyOptions

#### Properties

##### capabilityScope

> `readonly` **capabilityScope**: `string`

##### tenant

> `readonly` **tenant**: `string`

##### versions

> `readonly` **versions**: `Readonly`\<`Record`\<`string`, `string`\>\>

***

### DependencyService

#### Properties

##### capabilityScope

> `readonly` **capabilityScope**: `string`

##### tenant

> `readonly` **tenant**: `string`

##### version

> `readonly` **version**: (`name`) => `Effect`\<`string`\>

###### Parameters

###### name

`string`

###### Returns

`Effect`\<`string`\>

***

### Entry

#### Extends

- [`Provenance`](#provenance)

#### Properties

##### expiresAtMillis

> `readonly` **expiresAtMillis**: `number`

##### fromOperation

> `readonly` **fromOperation**: `string`

###### Inherited from

[`Provenance`](#provenance).[`fromOperation`](#fromoperation-1)

##### fromRun

> `readonly` **fromRun**: `string`

###### Inherited from

[`Provenance`](#provenance).[`fromRun`](#fromrun-1)

##### value

> `readonly` **value**: `unknown`

***

### LayerOptions

#### Properties

##### models?

> `readonly` `optional` **models?**: [`Models`](#models-1)

***

### Models

#### Properties

##### enabled

> `readonly` **enabled**: `boolean`

***

### ModelsOptions

#### Properties

##### enabled

> `readonly` **enabled**: `boolean`

***

### Provenance

#### Extended by

- [`Entry`](#entry)

#### Properties

##### fromOperation

> `readonly` **fromOperation**: `string`

##### fromRun

> `readonly` **fromRun**: `string`

***

### PureOptions

#### Properties

##### dependsOn?

> `readonly` `optional` **dependsOn?**: readonly `string`[]

##### ttl

> `readonly` **ttl**: `Input`

***

### StoreService

#### Properties

##### get

> `readonly` **get**: (`key`) => `Effect`\<`Option`\<[`Entry`](#entry)\>\>

###### Parameters

###### key

`string`

###### Returns

`Effect`\<`Option`\<[`Entry`](#entry)\>\>

##### modelsEnabled

> `readonly` **modelsEnabled**: `boolean`

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

### layerDependencies

> `const` **layerDependencies**: (`options`) => `Layer.Layer`\<[`Dependencies`](#dependencies)\>

#### Parameters

##### options

[`DependencyOptions`](#dependencyoptions)

#### Returns

`Layer.Layer`\<[`Dependencies`](#dependencies)\>

***

### layerMemory

> `const` **layerMemory**: (`options?`) => `Layer.Layer`\<[`Store`](#store)\>

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Store`](#store)\>

***

### layerSql

> `const` **layerSql**: (`options?`) => `Layer.Layer`\<[`Store`](#store), `never`, `SqlClient.SqlClient`\>

#### Parameters

##### options?

[`LayerOptions`](#layeroptions)

#### Returns

`Layer.Layer`\<[`Store`](#store), `never`, `SqlClient.SqlClient`\>

***

### models

> `const` **models**: (`options`) => [`Models`](#models-1)

#### Parameters

##### options

[`ModelsOptions`](#modelsoptions)

#### Returns

[`Models`](#models-1)

***

### pure

> `const` **pure**: (`options`) => \<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>

#### Parameters

##### options

[`PureOptions`](#pureoptions)

#### Returns

\<`Name`, `Config`, `Requirements`\>(`tool`) => `Tool.Tool`\<`Name`, `Config`, `Requirements`\>
