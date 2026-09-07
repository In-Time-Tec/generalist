[**generalist**](./index.md)

***

[generalist](./index.md) / durability.s3

# durability.s3

## Interfaces

<a id="client"></a>

### Client

**`Experimental`**

Injectable signed client; conditional writes have no unconditional counterpart.

#### Properties

<a id="createobject"></a>

##### createObject

> `readonly` **createObject**: (`input`, `signal`) => `Promise`\<`PutObjectCommandOutput`\>

**`Experimental`**

###### Parameters

###### input

`PutObjectCommandInput` & `object`

###### signal

`AbortSignal`

###### Returns

`Promise`\<`PutObjectCommandOutput`\>

<a id="getobject"></a>

##### getObject

> `readonly` **getObject**: (`input`, `signal`) => `Promise`\<`GetObjectCommandOutput`\>

**`Experimental`**

###### Parameters

###### input

`GetObjectCommandInput`

###### signal

`AbortSignal`

###### Returns

`Promise`\<`GetObjectCommandOutput`\>

<a id="guarantees"></a>

##### guarantees

> `readonly` **guarantees**: [`ClientGuarantees`](#clientguarantees-1)

**`Experimental`**

<a id="listobjects"></a>

##### listObjects

> `readonly` **listObjects**: (`input`, `signal`) => `Promise`\<`ListObjectsV2CommandOutput`\>

**`Experimental`**

###### Parameters

###### input

`ListObjectsV2CommandInput`

###### signal

`AbortSignal`

###### Returns

`Promise`\<`ListObjectsV2CommandOutput`\>

***

<a id="clientguarantees-1"></a>

### ClientGuarantees

**`Experimental`**

Advanced clients must preserve abort signals and must not retry or follow redirects.

#### Properties

<a id="noredirects"></a>

##### noRedirects

> `readonly` **noRedirects**: `boolean`

**`Experimental`**

<a id="singleattempt"></a>

##### singleAttempt

> `readonly` **singleAttempt**: `boolean`

**`Experimental`**

***

<a id="connectionoptions"></a>

### ConnectionOptions

**`Experimental`**

S3 general-purpose bucket connection; custom providers must attest the durability contract.

#### Extended by

- [`Options`](#options)
- [`MaintenanceOptions`](#maintenanceoptions)

#### Properties

<a id="bucket"></a>

##### bucket

> `readonly` **bucket**: `string`

**`Experimental`**

<a id="capabilities"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: `object`

**`Experimental`**

###### conditionalCreate

> `readonly` **conditionalCreate**: `boolean`

###### consistentListing

> `readonly` **consistentListing**: `boolean`

###### strongReadAfterWrite

> `readonly` **strongReadAfterWrite**: `boolean`

<a id="credentials"></a>

##### credentials?

> `readonly` `optional` **credentials?**: `AwsCredentialIdentity` \| `AwsCredentialIdentityProvider`

**`Experimental`**

<a id="endpoint"></a>

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

**`Experimental`**

<a id="forcepathstyle"></a>

##### forcePathStyle?

> `readonly` `optional` **forcePathStyle?**: `boolean`

**`Experimental`**

<a id="region"></a>

##### region

> `readonly` **region**: `string`

**`Experimental`**

<a id="requesttimeoutms"></a>

##### requestTimeoutMs?

> `readonly` `optional` **requestTimeoutMs?**: `number`

**`Experimental`**

***

<a id="maintenanceclient"></a>

### MaintenanceClient

**`Experimental`**

Deletion is supplied only to a separately constructed maintenance service.

#### Properties

<a id="deleteobject"></a>

##### deleteObject

> `readonly` **deleteObject**: (`input`, `signal`) => `Promise`\<`DeleteObjectCommandOutput`\>

**`Experimental`**

###### Parameters

###### input

`DeleteObjectCommandInput`

###### signal

`AbortSignal`

###### Returns

`Promise`\<`DeleteObjectCommandOutput`\>

<a id="guarantees-1"></a>

##### guarantees

> `readonly` **guarantees**: [`ClientGuarantees`](#clientguarantees-1)

**`Experimental`**

***

<a id="maintenanceoptions"></a>

### MaintenanceOptions

**`Experimental`**

Maintenance credentials can be different from ordinary runtime credentials.

#### Extends

- [`ConnectionOptions`](#connectionoptions)

#### Properties

<a id="bucket-1"></a>

##### bucket

> `readonly` **bucket**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`bucket`](#bucket)

<a id="capabilities-1"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: `object`

**`Experimental`**

###### conditionalCreate

> `readonly` **conditionalCreate**: `boolean`

###### consistentListing

> `readonly` **consistentListing**: `boolean`

###### strongReadAfterWrite

> `readonly` **strongReadAfterWrite**: `boolean`

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`capabilities`](#capabilities)

<a id="client-1"></a>

##### client?

> `readonly` `optional` **client?**: [`MaintenanceClient`](#maintenanceclient)

**`Experimental`**

<a id="credentials-1"></a>

##### credentials?

> `readonly` `optional` **credentials?**: `AwsCredentialIdentity` \| `AwsCredentialIdentityProvider`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`credentials`](#credentials)

<a id="endpoint-1"></a>

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`endpoint`](#endpoint)

<a id="forcepathstyle-1"></a>

##### forcePathStyle?

> `readonly` `optional` **forcePathStyle?**: `boolean`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`forcePathStyle`](#forcepathstyle)

<a id="region-1"></a>

##### region

> `readonly` **region**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`region`](#region)

<a id="requesttimeoutms-1"></a>

##### requestTimeoutMs?

> `readonly` `optional` **requestTimeoutMs?**: `number`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`requestTimeoutMs`](#requesttimeoutms)

***

<a id="options"></a>

### Options

**`Experimental`**

Default SDK signing or an explicitly qualified advanced client.

#### Extends

- [`ConnectionOptions`](#connectionoptions)

#### Properties

<a id="bucket-2"></a>

##### bucket

> `readonly` **bucket**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`bucket`](#bucket)

<a id="capabilities-2"></a>

##### capabilities?

> `readonly` `optional` **capabilities?**: `object`

**`Experimental`**

###### conditionalCreate

> `readonly` **conditionalCreate**: `boolean`

###### consistentListing

> `readonly` **consistentListing**: `boolean`

###### strongReadAfterWrite

> `readonly` **strongReadAfterWrite**: `boolean`

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`capabilities`](#capabilities)

<a id="client-2"></a>

##### client?

> `readonly` `optional` **client?**: [`Client`](#client)

**`Experimental`**

<a id="credentials-2"></a>

##### credentials?

> `readonly` `optional` **credentials?**: `AwsCredentialIdentity` \| `AwsCredentialIdentityProvider`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`credentials`](#credentials)

<a id="endpoint-2"></a>

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`endpoint`](#endpoint)

<a id="forcepathstyle-2"></a>

##### forcePathStyle?

> `readonly` `optional` **forcePathStyle?**: `boolean`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`forcePathStyle`](#forcepathstyle)

<a id="region-2"></a>

##### region

> `readonly` **region**: `string`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`region`](#region)

<a id="requesttimeoutms-2"></a>

##### requestTimeoutMs?

> `readonly` `optional` **requestTimeoutMs?**: `number`

**`Experimental`**

###### Inherited from

[`ConnectionOptions`](#connectionoptions).[`requestTimeoutMs`](#requesttimeoutms)

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`options`) => `Layer.Layer`\<`ObjectStore`, `ObjectStoreFailure`\>

**`Experimental`**

Signed S3 canonical transport layer.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Layer.Layer`\<`ObjectStore`, `ObjectStoreFailure`\>

***

<a id="layermaintenance"></a>

### layerMaintenance

> `const` **layerMaintenance**: (`options`) => `Layer.Layer`\<`ObjectMaintenance`, `ObjectStoreFailure`\>

**`Experimental`**

Separately authorized S3 deletion layer.

#### Parameters

##### options

[`MaintenanceOptions`](#maintenanceoptions)

#### Returns

`Layer.Layer`\<`ObjectMaintenance`, `ObjectStoreFailure`\>

***

<a id="make"></a>

### make

> `const` **make**: (`options`) => `Effect.Effect`\<`Service`, `ObjectStoreFailure`\>

**`Experimental`**

Creates the signed transport. Every request is single-attempt: reconcile uncertain creates by reading the key.

#### Parameters

##### options

[`Options`](#options)

#### Returns

`Effect.Effect`\<`Service`, `ObjectStoreFailure`\>

***

<a id="makemaintenance"></a>

### makeMaintenance

> `const` **makeMaintenance**: (`options`) => `Effect.Effect`\<\{ `remove`: (`key`) => `Effect.Effect`\<`void`, `ObjectStoreFailure`, `never`\>; \}, `ObjectStoreFailure`, `never`\>

**`Experimental`**

Constructs separately authorized maintenance deletion; never included in the normal store.

#### Parameters

##### options

[`MaintenanceOptions`](#maintenanceoptions)

#### Returns

`Effect.Effect`\<\{ `remove`: (`key`) => `Effect.Effect`\<`void`, `ObjectStoreFailure`, `never`\>; \}, `ObjectStoreFailure`, `never`\>
