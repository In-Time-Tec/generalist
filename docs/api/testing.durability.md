[**generalist**](./index.md)

***

[generalist](./index.md) / testing.durability

# testing.durability

## Classes

<a id="objectstoreconformancefailure"></a>

### ObjectStoreConformanceFailure

**`Experimental`**

Observable provider-contract violation, distinct from transport failure.

#### Extends

- `ObjectStoreConformanceFailure_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new ObjectStoreConformanceFailure**(...`args`): [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ObjectStoreConformanceFailure`](#objectstoreconformancefailure)

###### Inherited from

`ObjectStoreConformanceFailure_base.constructor`

#### Properties

<a id="check"></a>

##### check

> `readonly` **check**: `string`

**`Experimental`**

###### Inherited from

`ObjectStoreConformanceFailure_base.check`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`ObjectStoreConformanceFailure_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`ObjectStoreConformanceFailure_base.message`

## Interfaces

<a id="client"></a>

### Client

**`Experimental`**

An independent transport client, with a separate fault queue.

#### Extended by

- [`Simulator`](#simulator)

#### Properties

<a id="faults"></a>

##### faults

> `readonly` **faults**: [`Faults`](#faults-1)

**`Experimental`**

<a id="maintenance"></a>

##### maintenance

> `readonly` **maintenance**: `object`

**`Experimental`**

###### remove

> `readonly` **remove**: (`key`) => `Effect`\<`void`, `ObjectStoreFailure`\>

###### Parameters

###### key

`string`

###### Returns

`Effect`\<`void`, `ObjectStoreFailure`\>

<a id="store"></a>

##### store

> `readonly` **store**: `Service`

**`Experimental`**

***

<a id="conformanceoptions"></a>

### ConformanceOptions

**`Experimental`**

Supply isolated empty prefixes and genuinely new provider clients.

#### Type Parameters

##### E

`E` = `never`

##### R

`R` = `never`

#### Properties

<a id="connect"></a>

##### connect

> `readonly` **connect**: `Effect`\<`Service`, `E`, `R`\>

**`Experimental`**

<a id="prefix"></a>

##### prefix

> `readonly` **prefix**: `string`

**`Experimental`**

***

<a id="createdispatch"></a>

### CreateDispatch

**`Experimental`**

A provider request owned by the fixture scope after its caller is interrupted.

#### Properties

<a id="completed"></a>

##### completed

> `readonly` **completed**: `Effect`\<`"created"` \| `"conflict"`, `ObjectStoreFailure`\>

**`Experimental`**

<a id="entered"></a>

##### entered

> `readonly` **entered**: `Effect`\<\{ `bytes`: `Uint8Array`; `key`: `string`; \}\>

**`Experimental`**

<a id="release"></a>

##### release

> `readonly` **release**: `Effect`\<`void`\>

**`Experimental`**

***

<a id="createpause"></a>

### CreatePause

**`Experimental`**

A create held before publication until the test explicitly releases it.

#### Properties

<a id="entered-1"></a>

##### entered

> `readonly` **entered**: `Effect`\<\{ `bytes`: `Uint8Array`; `key`: `string`; \}\>

**`Experimental`**

<a id="release-1"></a>

##### release

> `readonly` **release**: `Effect`\<`void`\>

**`Experimental`**

***

<a id="faults-1"></a>

### Faults

**`Experimental`**

One-shot faults are local to a client; corruption changes the shared bucket.

#### Properties

<a id="conflictnextcreate"></a>

##### conflictNextCreate

> `readonly` **conflictNextCreate**: (`key`, `bytes`) => `Effect`\<`void`\>

**`Experimental`**

###### Parameters

###### key

`string`

###### bytes

`Uint8Array`

###### Returns

`Effect`\<`void`\>

<a id="corrupt"></a>

##### corrupt

> `readonly` **corrupt**: (`key`, `bytes`) => `Effect`\<`void`, `ObjectStoreFailure`\>

**`Experimental`**

###### Parameters

###### key

`string`

###### bytes

`Uint8Array`

###### Returns

`Effect`\<`void`, `ObjectStoreFailure`\>

<a id="dispatchnextcreate"></a>

##### dispatchNextCreate

> `readonly` **dispatchNextCreate**: (`key?`) => `Effect`\<[`CreateDispatch`](#createdispatch), `never`, `Scope`\>

**`Experimental`**

Fork the provider request into the current fixture scope before awaiting it.

###### Parameters

###### key?

`string`

###### Returns

`Effect`\<[`CreateDispatch`](#createdispatch), `never`, `Scope`\>

<a id="failnextcreate"></a>

##### failNextCreate

> `readonly` **failNextCreate**: (`options`) => `Effect`\<`void`\>

**`Experimental`**

###### Parameters

###### options

###### key?

`string`

###### phase

`"before"` \| `"after"`

###### reason?

`"authentication"` \| `"rate-limit"` \| `"timeout"` \| `"limit"` \| `"unavailable"` \| `"invalid-response"`

###### Returns

`Effect`\<`void`\>

<a id="failnextread"></a>

##### failNextRead

> `readonly` **failNextRead**: (`options?`) => `Effect`\<`void`\>

**`Experimental`**

###### Parameters

###### options?

###### key?

`string`

###### reason?

`"authentication"` \| `"rate-limit"` \| `"timeout"` \| `"limit"` \| `"unavailable"` \| `"invalid-response"`

###### Returns

`Effect`\<`void`\>

<a id="pausenextcreate"></a>

##### pauseNextCreate

> `readonly` **pauseNextCreate**: (`key?`) => `Effect`\<[`CreatePause`](#createpause)\>

**`Experimental`**

###### Parameters

###### key?

`string`

###### Returns

`Effect`\<[`CreatePause`](#createpause)\>

***

<a id="simulator"></a>

### Simulator

**`Experimental`**

Testing-only object storage; fresh clients share bytes, never fault queues.

#### Extends

- [`Client`](#client)

#### Properties

<a id="connect-1"></a>

##### connect

> `readonly` **connect**: `Effect`\<[`Client`](#client)\>

**`Experimental`**

<a id="faults-2"></a>

##### faults

> `readonly` **faults**: [`Faults`](#faults-1)

**`Experimental`**

###### Inherited from

[`Client`](#client).[`faults`](#faults)

<a id="maintenance-1"></a>

##### maintenance

> `readonly` **maintenance**: `object`

**`Experimental`**

###### remove

> `readonly` **remove**: (`key`) => `Effect`\<`void`, `ObjectStoreFailure`\>

###### Parameters

###### key

`string`

###### Returns

`Effect`\<`void`, `ObjectStoreFailure`\>

###### Inherited from

[`Client`](#client).[`maintenance`](#maintenance)

<a id="store-1"></a>

##### store

> `readonly` **store**: `Service`

**`Experimental`**

###### Inherited from

[`Client`](#client).[`store`](#store)

## Variables

<a id="atomiccreates"></a>

### atomicCreates

> `const` **atomicCreates**: \<`E`, `R`\>(`options`) => `Effect.Effect`\<`undefined`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

**`Experimental`**

Concurrent independent writers must produce exactly one immutable winner.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### options

[`ConformanceOptions`](#conformanceoptions)\<`E`, `R`\>

#### Returns

`Effect.Effect`\<`undefined`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

***

<a id="byteintegrity"></a>

### byteIntegrity

> `const` **byteIntegrity**: \<`E`, `R`\>(`options`) => `Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

**`Experimental`**

Binary and empty objects must round-trip without aliases into stored bytes.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### options

[`ConformanceOptions`](#conformanceoptions)\<`E`, `R`\>

#### Returns

`Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

***

<a id="freshreads"></a>

### freshReads

> `const` **freshReads**: \<`E`, `R`\>(`options`) => `Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

**`Experimental`**

A new client must see acknowledged writes and distinguish absence.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### options

[`ConformanceOptions`](#conformanceoptions)\<`E`, `R`\>

#### Returns

`Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

***

<a id="layer"></a>

### layer

> `const` **layer**: (`client`) => `Layer.Layer`\<`ObjectStore`\>

**`Experimental`**

Provide a simulator client to the production object Runtime in a test scope.

#### Parameters

##### client

[`Client`](#client)

#### Returns

`Layer.Layer`\<`ObjectStore`\>

***

<a id="listing"></a>

### listing

> `const` **listing**: \<`E`, `R`\>(`options`) => `Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

**`Experimental`**

Complete paginated discovery must neither skip nor duplicate acknowledged keys.

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### options

[`ConformanceOptions`](#conformanceoptions)\<`E`, `R`\> & `object`

#### Returns

`Effect.Effect`\<`void`, `E` \| [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure) \| `ObjectStoreFailure`, `R`\>

***

<a id="make"></a>

### make

> `const` **make**: (`configuration?`) => `Effect.Effect`\<[`Simulator`](#simulator), `ObjectStoreFailure`\>

**`Experimental`**

Creates a private test bucket and its first client. Each evaluation of `connect`
returns an independent client over the same bucket. Faults are consumed by the
first matching request, in queue order. No timers or process-global state are used.

#### Parameters

##### configuration?

###### pageSize?

`number`

#### Returns

`Effect.Effect`\<[`Simulator`](#simulator), `ObjectStoreFailure`\>

***

<a id="unsupportedpreconditions"></a>

### unsupportedPreconditions

> `const` **unsupportedPreconditions**: \<`A`, `R`\>(`initialize`) => `Effect.Effect`\<`void`, [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure), `R`\>

**`Experimental`**

Pass initialization configured with unsupported conditional-create semantics.

#### Type Parameters

##### A

`A`

##### R

`R`

#### Parameters

##### initialize

`Effect.Effect`\<`A`, `ObjectStoreFailure`, `R`\>

#### Returns

`Effect.Effect`\<`void`, [`ObjectStoreConformanceFailure`](#objectstoreconformancefailure), `R`\>
