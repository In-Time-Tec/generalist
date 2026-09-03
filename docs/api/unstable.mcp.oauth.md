[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.oauth

# unstable.mcp.oauth

## Classes

<a id="oauth"></a>

### OAuth

**`Experimental`**

#### Extends

- `OAuth_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new OAuth**(`_`): [`OAuth`](#oauth)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`OAuth`](#oauth)

###### Inherited from

`OAuth_base.constructor`

***

<a id="oauthdenied"></a>

### OAuthDenied

**`Experimental`**

#### Extends

- `OAuthDenied_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new OAuthDenied**(...`args`): [`OAuthDenied`](#oauthdenied)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`OAuthDenied`](#oauthdenied)

###### Inherited from

`OAuthDenied_base.constructor`

#### Properties

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthDenied_base.hint`

<a id="reason"></a>

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`OAuthDenied_base.reason`

***

<a id="oauthexpired"></a>

### OAuthExpired

**`Experimental`**

#### Extends

- `OAuthExpired_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new OAuthExpired**(...`args`): [`OAuthExpired`](#oauthexpired)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`OAuthExpired`](#oauthexpired)

###### Inherited from

`OAuthExpired_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthExpired_base.hint`

<a id="server"></a>

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`OAuthExpired_base.server`

***

<a id="oauthpending"></a>

### OAuthPending

**`Experimental`**

#### Extends

- `OAuthPending_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new OAuthPending**(...`args`): [`OAuthPending`](#oauthpending)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`OAuthPending`](#oauthpending)

###### Inherited from

`OAuthPending_base.constructor`

#### Properties

<a id="authorizationurl"></a>

##### authorizationUrl

> `readonly` **authorizationUrl**: `string`

**`Experimental`**

###### Inherited from

`OAuthPending_base.authorizationUrl`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthPending_base.hint`

***

<a id="oauthprovidererror"></a>

### OAuthProviderError

**`Experimental`**

#### Extends

- `OAuthProviderError_base`

#### Constructors

<a id="constructor-4"></a>

##### Constructor

> **new OAuthProviderError**(...`args`): [`OAuthProviderError`](#oauthprovidererror)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`OAuthProviderError`](#oauthprovidererror)

###### Inherited from

`OAuthProviderError_base.constructor`

#### Properties

<a id="hint-3"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.hint`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.message`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.operation`

<a id="server-1"></a>

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.server`

***

<a id="tokenstore"></a>

### TokenStore

**`Experimental`**

#### Extends

- `TokenStore_base`

#### Constructors

<a id="constructor-5"></a>

##### Constructor

> **new TokenStore**(`_`): [`TokenStore`](#tokenstore)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`TokenStore`](#tokenstore)

###### Inherited from

`TokenStore_base.constructor`

## Interfaces

<a id="authorization"></a>

### Authorization

**`Experimental`**

#### Properties

<a id="state"></a>

##### state

> `readonly` **state**: `string`

**`Experimental`**

<a id="url"></a>

##### url

> `readonly` **url**: `string`

**`Experimental`**

***

<a id="configuration"></a>

### Configuration

**`Experimental`**

#### Properties

<a id="clientinformation"></a>

##### clientInformation?

> `readonly` `optional` **clientInformation?**: `OAuthClientInformationMixed`

**`Experimental`**

<a id="clientmetadata"></a>

##### clientMetadata

> `readonly` **clientMetadata**: `object`

**`Experimental`**

<a id="redirecturl"></a>

##### redirectUrl

> `readonly` **redirectUrl**: `string`

**`Experimental`**

<a id="scope"></a>

##### scope?

> `readonly` `optional` **scope?**: `string`

**`Experimental`**

<a id="serverurl"></a>

##### serverUrl

> `readonly` **serverUrl**: `string`

**`Experimental`**

***

<a id="service"></a>

### Service

**`Experimental`**

#### Properties

<a id="authorize"></a>

##### authorize

> `readonly` **authorize**: `Effect`\<[`Authorization`](#authorization), [`OAuthProviderError`](#oauthprovidererror)\>

**`Experimental`**

<a id="callback"></a>

##### callback

> `readonly` **callback**: (`url`) => `Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror) \| [`OAuthDenied`](#oauthdenied) \| [`OAuthExpired`](#oauthexpired)\>

**`Experimental`**

###### Parameters

###### url

`string`

###### Returns

`Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror) \| [`OAuthDenied`](#oauthdenied) \| [`OAuthExpired`](#oauthexpired)\>

<a id="clear"></a>

##### clear

> `readonly` **clear**: `Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror)\>

**`Experimental`**

<a id="pending"></a>

##### pending

> `readonly` **pending**: `Effect`\<`Option`\<[`Authorization`](#authorization)\>\>

**`Experimental`**

<a id="provider"></a>

##### provider

> `readonly` **provider**: `OAuthClientProvider`

**`Experimental`**

<a id="withtransport"></a>

##### withTransport

> `readonly` **withTransport**: \<`A`, `E`, `R`\>(`effect`) => `Effect`\<`A`, [`OAuthProviderError`](#oauthprovidererror) \| `E`, `R`\>

**`Experimental`**

###### Type Parameters

###### A

`A`

###### E

`E`

###### R

`R`

###### Parameters

###### effect

`Effect`\<`A`, `E`, `R`\>

###### Returns

`Effect`\<`A`, [`OAuthProviderError`](#oauthprovidererror) \| `E`, `R`\>

## Variables

<a id="layer"></a>

### layer

> `const` **layer**: (`configuration`) => `Layer.Layer`\<[`OAuth`](#oauth), `never`, [`TokenStore`](#tokenstore) \| `Crypto.Crypto`\>

**`Experimental`**

#### Parameters

##### configuration

[`Configuration`](#configuration)

#### Returns

`Layer.Layer`\<[`OAuth`](#oauth), `never`, [`TokenStore`](#tokenstore) \| `Crypto.Crypto`\>

***

<a id="layertest"></a>

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`OAuth`](#oauth)\>

**`Experimental`**

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`OAuth`](#oauth)\>

***

<a id="layertokenstorememory"></a>

### layerTokenStoreMemory

> `const` **layerTokenStoreMemory**: `Layer.Layer`\<[`TokenStore`](#tokenstore)\>

**`Experimental`**

***

<a id="layertokenstoretest"></a>

### layerTokenStoreTest

> `const` **layerTokenStoreTest**: (`implementation`) => `Layer.Layer`\<[`TokenStore`](#tokenstore)\>

**`Experimental`**

#### Parameters

##### implementation

[`TokenStore`](#tokenstore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`TokenStore`](#tokenstore)\>
