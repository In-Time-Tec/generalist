[**generalist**](./index)

***

[generalist](./index) / unstable.cloudflare.workers

# unstable.cloudflare.workers

## Classes

### WorkerContext

**`Experimental`**

#### Extends

- `WorkerContext_base`

#### Constructors

##### Constructor

> **new WorkerContext**(`_`): [`WorkerContext`](#workercontext)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`WorkerContext`](#workercontext)

###### Inherited from

`WorkerContext_base.constructor`

## Interfaces

### ExecutionContext

**`Experimental`**

#### Properties

##### passThroughOnException

> `readonly` **passThroughOnException**: () => `void`

**`Experimental`**

###### Returns

`void`

##### waitUntil

> `readonly` **waitUntil**: (`promise`) => `void`

**`Experimental`**

###### Parameters

###### promise

`Promise`\<`unknown`\>

###### Returns

`void`

***

### RequestContext

**`Experimental`**

#### Properties

##### bindings

> `readonly` **bindings**: `object`

**`Experimental`**

##### executionContext

> `readonly` **executionContext**: [`ExecutionContext`](#executioncontext)

**`Experimental`**

***

### Worker

**`Experimental`**

#### Type Parameters

##### Bindings

`Bindings` *extends* `object`

#### Properties

##### fetch

> `readonly` **fetch**: (`request`, `bindings`, `context`) => `Promise`\<`Response`\>

**`Experimental`**

###### Parameters

###### request

`Request`

###### bindings

`Bindings`

###### context

[`ExecutionContext`](#executioncontext)

###### Returns

`Promise`\<`Response`\>

## Type Aliases

### BindingValue

> **BindingValue** = `string` \| `number` \| `boolean` \| `null` \| `undefined` \| `object`

**`Experimental`**

Values exposed by Cloudflare Worker bindings.

## Variables

### make

> `const` **make**: \<`Bindings`, `E`\>(`handle`) => [`Worker`](#worker)\<`Bindings`\>

**`Experimental`**

#### Type Parameters

##### Bindings

`Bindings` *extends* `object`

##### E

`E`

#### Parameters

##### handle

(`request`) => `Effect.Effect`\<`Response`, `E`, [`WorkerContext`](#workercontext) \| `Scope.Scope`\>

#### Returns

[`Worker`](#worker)\<`Bindings`\>

***

### makeConfigProvider

> `const` **makeConfigProvider**: \{\<`Bindings`, `Key`\>(`bindings`, `keys`): `ConfigProvider`; \<`Bindings`, `Key`\>(`keys`): (`bindings`) => `ConfigProvider`; \}

**`Experimental`**

#### Call Signature

> \<`Bindings`, `Key`\>(`bindings`, `keys`): `ConfigProvider`

##### Type Parameters

###### Bindings

`Bindings` *extends* `object`

###### Key

`Key` *extends* `string`

##### Parameters

###### bindings

`Bindings`

###### keys

readonly `Key`[]

##### Returns

`ConfigProvider`

#### Call Signature

> \<`Bindings`, `Key`\>(`keys`): (`bindings`) => `ConfigProvider`

##### Type Parameters

###### Bindings

`Bindings` *extends* `object`

###### Key

`Key` *extends* `string`

##### Parameters

###### keys

readonly `Key`[]

##### Returns

(`bindings`) => `ConfigProvider`
