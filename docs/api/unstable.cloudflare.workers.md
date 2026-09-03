[**generalist**](./index)

***

[generalist](./index) / unstable.cloudflare.workers

# unstable.cloudflare.workers

## Classes

<a id="workercontext"></a>

### WorkerContext

**`Experimental`**

#### Extends

- `WorkerContext_base`

#### Constructors

<a id="constructor"></a>

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

<a id="executioncontext"></a>

### ExecutionContext

**`Experimental`**

#### Properties

<a id="passthroughonexception"></a>

##### passThroughOnException

> `readonly` **passThroughOnException**: () => `void`

**`Experimental`**

###### Returns

`void`

<a id="waituntil"></a>

##### waitUntil

> `readonly` **waitUntil**: (`promise`) => `void`

**`Experimental`**

###### Parameters

###### promise

`Promise`\<`unknown`\>

###### Returns

`void`

***

<a id="requestcontext"></a>

### RequestContext

**`Experimental`**

#### Properties

<a id="bindings"></a>

##### bindings

> `readonly` **bindings**: `object`

**`Experimental`**

<a id="executioncontext-1"></a>

##### executionContext

> `readonly` **executionContext**: [`ExecutionContext`](#executioncontext)

**`Experimental`**

***

<a id="worker"></a>

### Worker

**`Experimental`**

#### Type Parameters

##### Bindings

`Bindings` *extends* `object`

#### Properties

<a id="fetch"></a>

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

<a id="bindingvalue"></a>

### BindingValue

> **BindingValue** = `string` \| `number` \| `boolean` \| `null` \| `undefined` \| `object`

**`Experimental`**

Values exposed by Cloudflare Worker bindings.

## Variables

<a id="make"></a>

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

<a id="makeconfigprovider"></a>

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
