[**generalist**](./index)

***

[generalist](./index) / unstable.mcp.oauth

# unstable.mcp.oauth

## Classes

### OAuth

**`Experimental`**

#### Extends

- `OAuth_base`

#### Constructors

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

### OAuthDenied

**`Experimental`**

#### Extends

- `OAuthDenied_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthDenied_base.hint`

##### reason

> `readonly` **reason**: `string`

**`Experimental`**

###### Inherited from

`OAuthDenied_base.reason`

***

### OAuthExpired

**`Experimental`**

#### Extends

- `OAuthExpired_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthExpired_base.hint`

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`OAuthExpired_base.server`

***

### OAuthPending

**`Experimental`**

#### Extends

- `OAuthPending_base`

#### Constructors

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

##### authorizationUrl

> `readonly` **authorizationUrl**: `string`

**`Experimental`**

###### Inherited from

`OAuthPending_base.authorizationUrl`

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthPending_base.hint`

***

### OAuthProviderError

**`Experimental`**

#### Extends

- `OAuthProviderError_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.hint`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.message`

##### operation

> `readonly` **operation**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.operation`

##### server

> `readonly` **server**: `string`

**`Experimental`**

###### Inherited from

`OAuthProviderError_base.server`

***

### TokenStore

**`Experimental`**

#### Extends

- `TokenStore_base`

#### Constructors

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

### Authorization

**`Experimental`**

#### Properties

##### state

> `readonly` **state**: `string`

**`Experimental`**

##### url

> `readonly` **url**: `string`

**`Experimental`**

***

### Configuration

**`Experimental`**

#### Properties

##### clientInformation?

> `readonly` `optional` **clientInformation?**: `OAuthClientInformationMixed`

**`Experimental`**

##### clientMetadata

> `readonly` **clientMetadata**: `object`

**`Experimental`**

##### redirectUrl

> `readonly` **redirectUrl**: `string`

**`Experimental`**

##### scope?

> `readonly` `optional` **scope?**: `string`

**`Experimental`**

##### serverUrl

> `readonly` **serverUrl**: `string`

**`Experimental`**

***

### Service

**`Experimental`**

#### Properties

##### authorize

> `readonly` **authorize**: `Effect`\<[`Authorization`](#authorization), [`OAuthProviderError`](#oauthprovidererror)\>

**`Experimental`**

##### callback

> `readonly` **callback**: (`url`) => `Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror) \| [`OAuthDenied`](#oauthdenied) \| [`OAuthExpired`](#oauthexpired)\>

**`Experimental`**

###### Parameters

###### url

`string`

###### Returns

`Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror) \| [`OAuthDenied`](#oauthdenied) \| [`OAuthExpired`](#oauthexpired)\>

##### clear

> `readonly` **clear**: `Effect`\<`void`, [`OAuthProviderError`](#oauthprovidererror)\>

**`Experimental`**

##### pending

> `readonly` **pending**: `Effect`\<`Option`\<[`Authorization`](#authorization)\>\>

**`Experimental`**

##### provider

> `readonly` **provider**: `OAuthClientProvider`

**`Experimental`**

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

### layer

> `const` **layer**: (`configuration`) => `Layer.Layer`\<[`OAuth`](#oauth), `never`, [`TokenStore`](#tokenstore) \| `Crypto.Crypto`\>

**`Experimental`**

#### Parameters

##### configuration

[`Configuration`](#configuration)

#### Returns

`Layer.Layer`\<[`OAuth`](#oauth), `never`, [`TokenStore`](#tokenstore) \| `Crypto.Crypto`\>

***

### layerTest

> `const` **layerTest**: (`implementation`) => `Layer.Layer`\<[`OAuth`](#oauth)\>

**`Experimental`**

#### Parameters

##### implementation

[`Service`](#service)

#### Returns

`Layer.Layer`\<[`OAuth`](#oauth)\>

***

### layerTokenStoreMemory

> `const` **layerTokenStoreMemory**: `Layer.Layer`\<[`TokenStore`](#tokenstore)\>

**`Experimental`**

***

### layerTokenStoreTest

> `const` **layerTokenStoreTest**: (`implementation`) => `Layer.Layer`\<[`TokenStore`](#tokenstore)\>

**`Experimental`**

#### Parameters

##### implementation

[`TokenStore`](#tokenstore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`TokenStore`](#tokenstore)\>
