[**generalist**](./index)

***

[generalist](./index) / unstable.providers.openai-account-auth

# unstable.providers.openai-account-auth

## Classes

### AuthError

**`Experimental`**

#### Extends

- `AuthError_base`

#### Constructors

##### Constructor

> **new AuthError**(...`args`): [`AuthError`](#autherror)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`AuthError`](#autherror)

###### Inherited from

`AuthError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`AuthError_base.hint`

##### kind

> `readonly` **kind**: `"timeout"` \| `"network"` \| `"cancelled"` \| `"protocol"` \| `"host"` \| `"account-mismatch"` \| `"login-required"`

**`Experimental`**

###### Inherited from

`AuthError_base.kind`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`AuthError_base.message`

***

### BrowserAuthorization

**`Experimental`**

#### Extends

- `BrowserAuthorization_base`

#### Constructors

##### Constructor

> **new BrowserAuthorization**(`_`): [`BrowserAuthorization`](#browserauthorization)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`BrowserAuthorization`](#browserauthorization)

###### Inherited from

`BrowserAuthorization_base.constructor`

***

### CredentialStore

**`Experimental`**

#### Extends

- `CredentialStore_base`

#### Constructors

##### Constructor

> **new CredentialStore**(`_`): [`CredentialStore`](#credentialstore)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`CredentialStore`](#credentialstore)

###### Inherited from

`CredentialStore_base.constructor`

***

### DeviceAuthorizationPresenter

**`Experimental`**

#### Extends

- `DeviceAuthorizationPresenter_base`

#### Constructors

##### Constructor

> **new DeviceAuthorizationPresenter**(`_`): [`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)

###### Inherited from

`DeviceAuthorizationPresenter_base.constructor`

***

### OAuthClient

**`Experimental`**

#### Extends

- `OAuthClient_base`

#### Constructors

##### Constructor

> **new OAuthClient**(`_`): [`OAuthClient`](#oauthclient)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`OAuthClient`](#oauthclient)

###### Inherited from

`OAuthClient_base.constructor`

***

### OpenAIAccountAuth

**`Experimental`**

#### Extends

- `OpenAIAccountAuth_base`

#### Constructors

##### Constructor

> **new OpenAIAccountAuth**(`_`): [`OpenAIAccountAuth`](#openaiaccountauth)

**`Experimental`**

###### Parameters

###### \_

`never`

###### Returns

[`OpenAIAccountAuth`](#openaiaccountauth)

###### Inherited from

`OpenAIAccountAuth_base.constructor`

***

### StoreError

**`Experimental`**

#### Extends

- `StoreError_base`

#### Constructors

##### Constructor

> **new StoreError**(...`args`): [`StoreError`](#storeerror)

**`Experimental`**

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`StoreError`](#storeerror)

###### Inherited from

`StoreError_base.constructor`

#### Properties

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`StoreError_base.hint`

##### kind

> `readonly` **kind**: `"missing"` \| `"corrupt"` \| `"unsafe"` \| `"busy"` \| `"io"`

**`Experimental`**

###### Inherited from

`StoreError_base.kind`

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`StoreError_base.message`

## Interfaces

### AuthorizationResult

**`Experimental`**

#### Properties

##### code

> `readonly` **code**: `Redacted`\<`string`\>

**`Experimental`**

##### state

> `readonly` **state**: `Redacted`\<`string`\>

**`Experimental`**

***

### Credential

**`Experimental`**

#### Properties

##### accessToken

> `readonly` **accessToken**: `Redacted`\<`string`\>

**`Experimental`**

##### accountId

> `readonly` **accountId**: `Redacted`\<`string`\>

**`Experimental`**

##### expiresAt

> `readonly` **expiresAt**: `number`

**`Experimental`**

##### fingerprint

> `readonly` **fingerprint**: `string`

**`Experimental`**

##### generation

> `readonly` **generation**: `string`

**`Experimental`**

##### idToken

> `readonly` **idToken**: `Redacted`\<`string`\>

**`Experimental`**

##### refreshedAt

> `readonly` **refreshedAt**: `number`

**`Experimental`**

##### refreshToken

> `readonly` **refreshToken**: `Redacted`\<`string`\>

**`Experimental`**

***

### DevicePrompt

**`Experimental`**

#### Properties

##### userCode

> `readonly` **userCode**: `string`

**`Experimental`**

##### verificationUrl

> `readonly` **verificationUrl**: `string`

**`Experimental`**

##### warning

> `readonly` **warning**: `string`

**`Experimental`**

***

### TimingOptions

**`Experimental`**

#### Properties

##### deviceTimeout?

> `readonly` `optional` **deviceTimeout?**: `number`

**`Experimental`**

## Type Aliases

### Error

> **Error** = [`AuthError`](#autherror) \| [`StoreError`](#storeerror)

**`Experimental`**

***

### Status

> **Status** = \{ `_tag`: `"Unauthenticated"`; \} \| \{ `_tag`: `"Present"`; `fingerprint`: `string`; \} \| \{ `_tag`: `"RefreshRequired"`; `fingerprint`: `string`; \} \| \{ `_tag`: `"Corrupt"`; \}

**`Experimental`**

***

### TokenResponse

> **TokenResponse** = *typeof* `TokenResponse.Type`

**`Experimental`**

## Variables

### authorizationUrl

> `const` **authorizationUrl**: \{(`challenge`, `state`, `redirect?`): `URL`; (`state`, `redirect?`): (`challenge`) => `URL`; \}

**`Experimental`**

#### Call Signature

> (`challenge`, `state`, `redirect?`): `URL`

##### Parameters

###### challenge

`string`

###### state

`Redacted`\<`string`\>

###### redirect?

`string`

##### Returns

`URL`

#### Call Signature

> (`state`, `redirect?`): (`challenge`) => `URL`

##### Parameters

###### state

`Redacted`\<`string`\>

###### redirect?

`string`

##### Returns

(`challenge`) => `URL`

***

### clientId

> `const` **clientId**: `"app_EMoamEEZ73f0CkXaXp7hrann"` = `"app_EMoamEEZ73f0CkXaXp7hrann"`

**`Experimental`**

***

### CredentialDisk

> `const` **CredentialDisk**: `Schema.Struct`\<\{ `accessToken`: `Schema.String`; `accountId`: `Schema.String`; `expiresAt`: `Schema.Finite`; `fingerprint`: `Schema.String`; `formatVersion`: `Schema.Literal`\<`1`\>; `generation`: `Schema.String`; `idToken`: `Schema.String`; `refreshedAt`: `Schema.Finite`; `refreshToken`: `Schema.String`; \}\>

**`Experimental`**

***

### credentialFormatVersion

> `const` **credentialFormatVersion**: `1` = `1`

**`Experimental`**

***

### deviceExchangeRedirect

> `const` **deviceExchangeRedirect**: `"https://auth.openai.com/deviceauth/callback"` = `"https://auth.openai.com/deviceauth/callback"`

**`Experimental`**

***

### DevicePollResponse

> `const` **DevicePollResponse**: `Schema.Struct`\<\{ `authorization_code`: `Schema.String`; `code_challenge`: `Schema.String`; `code_verifier`: `Schema.String`; \}\>

**`Experimental`**

***

### DeviceStartResponse

> `const` **DeviceStartResponse**: `Schema.Struct`\<\{ `device_auth_id`: `Schema.String`; `interval`: `Schema.String`; `user_code`: `Schema.String`; \}\>

**`Experimental`**

***

### deviceVerificationUrl

> `const` **deviceVerificationUrl**: `"https://auth.openai.com/codex/device"` = `"https://auth.openai.com/codex/device"`

**`Experimental`**

***

### generatePkce

> `const` **generatePkce**: `Effect.Effect`\<\{ `challenge`: `string`; `state`: `Redacted.Redacted`\<`string`\>; `verifier`: `Redacted.Redacted`\<`string`\>; \}, [`AuthError`](#autherror), `Crypto.Crypto`\>

**`Experimental`**

***

### issuer

> `const` **issuer**: `"https://auth.openai.com"` = `"https://auth.openai.com"`

**`Experimental`**

***

### layer

> `const` **layer**: (`options?`) => `Layer.Layer`\<[`OpenAIAccountAuth`](#openaiaccountauth), `never`, [`BrowserAuthorization`](#browserauthorization) \| [`CredentialStore`](#credentialstore) \| `Crypto.Crypto` \| [`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter) \| [`OAuthClient`](#oauthclient)\>

**`Experimental`**

#### Parameters

##### options?

[`TimingOptions`](#timingoptions)

#### Returns

`Layer.Layer`\<[`OpenAIAccountAuth`](#openaiaccountauth), `never`, [`BrowserAuthorization`](#browserauthorization) \| [`CredentialStore`](#credentialstore) \| `Crypto.Crypto` \| [`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter) \| [`OAuthClient`](#oauthclient)\>

***

### layerBrowserAuthorizationTest

> `const` **layerBrowserAuthorizationTest**: (`implementation`) => `Layer.Layer`\<[`BrowserAuthorization`](#browserauthorization)\>

**`Experimental`**

#### Parameters

##### implementation

[`BrowserAuthorization`](#browserauthorization)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`BrowserAuthorization`](#browserauthorization)\>

***

### layerCredentialStoreTest

> `const` **layerCredentialStoreTest**: (`implementation`) => `Layer.Layer`\<[`CredentialStore`](#credentialstore)\>

**`Experimental`**

#### Parameters

##### implementation

[`CredentialStore`](#credentialstore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`CredentialStore`](#credentialstore)\>

***

### layerDeviceAuthorizationPresenterTest

> `const` **layerDeviceAuthorizationPresenterTest**: (`implementation`) => `Layer.Layer`\<[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\>

**`Experimental`**

#### Parameters

##### implementation

[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\>

***

### layerOAuthClientTest

> `const` **layerOAuthClientTest**: (`implementation`) => `Layer.Layer`\<[`OAuthClient`](#oauthclient)\>

**`Experimental`**

#### Parameters

##### implementation

[`OAuthClient`](#oauthclient)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`OAuthClient`](#oauthclient)\>

***

### originator

> `const` **originator**: `"codex_cli_rs"` = `"codex_cli_rs"`

**`Experimental`**

***

### redirectUri

> `const` **redirectUri**: `"http://localhost:1455/auth/callback"` = `"http://localhost:1455/auth/callback"`

**`Experimental`**

***

### scopes

> `const` **scopes**: `"openid profile email offline_access api.connectors.read api.connectors.invoke"` = `"openid profile email offline_access api.connectors.read api.connectors.invoke"`

**`Experimental`**

***

### TokenResponse

> `const` **TokenResponse**: `Schema.Struct`\<\{ `access_token`: `Schema.optionalKey`\<`Schema.String`\>; `expires_in`: `Schema.optionalKey`\<`Schema.Int`\>; `id_token`: `Schema.optionalKey`\<`Schema.String`\>; `refresh_token`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

**`Experimental`**
