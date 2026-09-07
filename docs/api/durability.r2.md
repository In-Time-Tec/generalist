[**generalist**](./index.md)

***

[generalist](./index.md) / durability.r2

# durability.r2

## Interfaces

<a id="bucket"></a>

### Bucket

**`Experimental`**

Minimal native R2Bucket binding; no Workers globals or deletion permission required.

#### Methods

<a id="get"></a>

##### get()

> **get**(`key`, `options?`): `Promise`\<[`ObjectBody`](#objectbody) \| `null`\>

**`Experimental`**

###### Parameters

###### key

`string`

###### options?

###### range

\{ `length`: `number`; `offset`: `number`; \}

###### range.length

`number`

###### range.offset

`number`

###### Returns

`Promise`\<[`ObjectBody`](#objectbody) \| `null`\>

<a id="list"></a>

##### list()

> **list**(`options`): `Promise`\<[`ObjectList`](#objectlist)\>

**`Experimental`**

###### Parameters

###### options

###### cursor?

`string`

###### prefix

`string`

###### Returns

`Promise`\<[`ObjectList`](#objectlist)\>

<a id="put"></a>

##### put()

> **put**(`key`, `value`, `options`): `Promise`\<[`ObjectMetadata`](#objectmetadata) \| `null`\>

**`Experimental`**

###### Parameters

###### key

`string`

###### value

`Uint8Array`

###### options

###### onlyIf

\{ `etagDoesNotMatch`: `"*"`; \}

###### onlyIf.etagDoesNotMatch

`"*"`

###### Returns

`Promise`\<[`ObjectMetadata`](#objectmetadata) \| `null`\>

***

<a id="maintenancebucket"></a>

### MaintenanceBucket

**`Experimental`**

Supply separately, with maintenance credentials and a retired namespace.

#### Methods

<a id="delete"></a>

##### delete()

> **delete**(`key`): `Promise`\<`void`\>

**`Experimental`**

###### Parameters

###### key

`string`

###### Returns

`Promise`\<`void`\>

***

<a id="objectbody"></a>

### ObjectBody

**`Experimental`**

Native R2 body is consumed incrementally rather than with arrayBuffer().

#### Extends

- [`ObjectMetadata`](#objectmetadata)

#### Properties

<a id="body"></a>

##### body

> `readonly` **body**: `ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\>

**`Experimental`**

<a id="etag"></a>

##### etag

> `readonly` **etag**: `string`

**`Experimental`**

###### Inherited from

[`ObjectMetadata`](#objectmetadata).[`etag`](#etag-1)

<a id="key"></a>

##### key

> `readonly` **key**: `string`

**`Experimental`**

###### Inherited from

[`ObjectMetadata`](#objectmetadata).[`key`](#key-1)

<a id="range"></a>

##### range?

> `readonly` `optional` **range?**: `object`

**`Experimental`**

###### length?

> `readonly` `optional` **length?**: `number`

###### offset?

> `readonly` `optional` **offset?**: `number`

###### suffix?

> `readonly` `optional` **suffix?**: `number`

<a id="size"></a>

##### size

> `readonly` **size**: `number`

**`Experimental`**

###### Inherited from

[`ObjectMetadata`](#objectmetadata).[`size`](#size-1)

***

<a id="objectlist"></a>

### ObjectList

**`Experimental`**

Native listing fields consumed by the canonical transport.

#### Properties

<a id="cursor"></a>

##### cursor?

> `readonly` `optional` **cursor?**: `string`

**`Experimental`**

<a id="objects"></a>

##### objects

> `readonly` **objects**: readonly `object`[]

**`Experimental`**

<a id="truncated"></a>

##### truncated

> `readonly` **truncated**: `boolean`

**`Experimental`**

***

<a id="objectmetadata"></a>

### ObjectMetadata

**`Experimental`**

Native metadata used to verify complete reads and write acknowledgements.

#### Extended by

- [`ObjectBody`](#objectbody)

#### Properties

<a id="etag-1"></a>

##### etag

> `readonly` **etag**: `string`

**`Experimental`**

<a id="key-1"></a>

##### key

> `readonly` **key**: `string`

**`Experimental`**

<a id="size-1"></a>

##### size

> `readonly` **size**: `number`

**`Experimental`**

***

<a id="options"></a>

### Options

**`Experimental`**

Native binding request deadlines also cover complete body consumption.

#### Properties

<a id="requesttimeoutms"></a>

##### requestTimeoutMs?

> `readonly` `optional` **requestTimeoutMs?**: `number`

**`Experimental`**

Defaults to 30 seconds. A timed-out native PUT may still commit and must be reconciled.

## Variables

<a id="layermaintenance"></a>

### layerMaintenance

> `const` **layerMaintenance**: (`bucket`) => `Layer.Layer`\<`ObjectMaintenance`\>

**`Experimental`**

Provide explicitly authorized, offline maintenance deletion.

#### Parameters

##### bucket

[`MaintenanceBucket`](#maintenancebucket)

#### Returns

`Layer.Layer`\<`ObjectMaintenance`\>

***

<a id="makemaintenance"></a>

### makeMaintenance

> `const` **makeMaintenance**: (`bucket`) => `object`

**`Experimental`**

Construct deletion capability independently of canonical runtime access.

#### Parameters

##### bucket

[`MaintenanceBucket`](#maintenancebucket)

#### Returns

`object`

##### remove

> **remove**: (`key`) => `Effect.Effect`\<`void`, `ObjectStoreFailure`\>

###### Parameters

###### key

`string`

###### Returns

`Effect.Effect`\<`void`, `ObjectStoreFailure`\>

## Functions

<a id="layer"></a>

### layer()

#### Call Signature

> **layer**(`bucket`, `options?`): `Layer`\<`ObjectStore`\>

**`Experimental`**

Provide canonical object transport from a native R2Bucket binding.

##### Parameters

###### bucket

[`Bucket`](#bucket)

###### options?

[`Options`](#options)

##### Returns

`Layer`\<`ObjectStore`\>

#### Call Signature

> **layer**(`options?`): (`bucket`) => `Layer`\<`ObjectStore`\>

**`Experimental`**

Provide canonical object transport from a native R2Bucket binding.

##### Parameters

###### options?

[`Options`](#options)

##### Returns

(`bucket`) => `Layer`\<`ObjectStore`\>

***

<a id="make"></a>

### make()

#### Call Signature

> **make**(`bucket`, `options?`): `Service`

**`Experimental`**

Native reads bypass public-domain caches; writes are always atomic create-only PUTs.

##### Parameters

###### bucket

[`Bucket`](#bucket)

###### options?

[`Options`](#options)

##### Returns

`Service`

#### Call Signature

> **make**(`options?`): (`bucket`) => `Service`

**`Experimental`**

Native reads bypass public-domain caches; writes are always atomic create-only PUTs.

##### Parameters

###### options?

[`Options`](#options)

##### Returns

(`bucket`) => `Service`
