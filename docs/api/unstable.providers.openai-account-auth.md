[**generalist**](./index)

***

[generalist](./index) / unstable.providers.openai-account-auth

# unstable.providers.openai-account-auth

## Classes

<a id="autherror"></a>

### AuthError

**`Experimental`**

#### Extends

- `AuthError_base`

#### Constructors

<a id="constructor"></a>

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

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`AuthError_base.hint`

<a id="kind"></a>

##### kind

> `readonly` **kind**: `"timeout"` \| `"cancelled"` \| `"network"` \| `"protocol"` \| `"host"` \| `"account-mismatch"` \| `"login-required"`

**`Experimental`**

###### Inherited from

`AuthError_base.kind`

<a id="message"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`AuthError_base.message`

***

<a id="browserauthorization"></a>

### BrowserAuthorization

**`Experimental`**

#### Extends

- `BrowserAuthorization_base`

#### Constructors

<a id="constructor-1"></a>

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

<a id="credentialstore"></a>

### CredentialStore

**`Experimental`**

#### Extends

- `CredentialStore_base`

#### Constructors

<a id="constructor-2"></a>

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

<a id="deviceauthorizationpresenter"></a>

### DeviceAuthorizationPresenter

**`Experimental`**

#### Extends

- `DeviceAuthorizationPresenter_base`

#### Constructors

<a id="constructor-3"></a>

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

<a id="oauthclient"></a>

### OAuthClient

**`Experimental`**

#### Extends

- `OAuthClient_base`

#### Constructors

<a id="constructor-4"></a>

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

<a id="openaiaccountauth"></a>

### OpenAIAccountAuth

**`Experimental`**

#### Extends

- `OpenAIAccountAuth_base`

#### Constructors

<a id="constructor-5"></a>

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

<a id="storeerror"></a>

### StoreError

**`Experimental`**

#### Extends

- `StoreError_base`

#### Constructors

<a id="constructor-6"></a>

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

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

**`Experimental`**

###### Inherited from

`StoreError_base.hint`

<a id="kind-1"></a>

##### kind

> `readonly` **kind**: `"missing"` \| `"corrupt"` \| `"unsafe"` \| `"busy"` \| `"io"`

**`Experimental`**

###### Inherited from

`StoreError_base.kind`

<a id="message-1"></a>

##### message

> `readonly` **message**: `string`

**`Experimental`**

###### Inherited from

`StoreError_base.message`

## Interfaces

<a id="authorizationresult"></a>

### AuthorizationResult

**`Experimental`**

#### Properties

<a id="code"></a>

##### code

> `readonly` **code**: `Redacted`\<`string`\>

**`Experimental`**

<a id="state"></a>

##### state

> `readonly` **state**: `Redacted`\<`string`\>

**`Experimental`**

***

<a id="credential"></a>

### Credential

**`Experimental`**

#### Properties

<a id="accesstoken"></a>

##### accessToken

> `readonly` **accessToken**: `Redacted`\<`string`\>

**`Experimental`**

<a id="accountid"></a>

##### accountId

> `readonly` **accountId**: `Redacted`\<`string`\>

**`Experimental`**

<a id="expiresat"></a>

##### expiresAt

> `readonly` **expiresAt**: `number`

**`Experimental`**

<a id="fingerprint"></a>

##### fingerprint

> `readonly` **fingerprint**: `string`

**`Experimental`**

<a id="generation"></a>

##### generation

> `readonly` **generation**: `string`

**`Experimental`**

<a id="idtoken"></a>

##### idToken

> `readonly` **idToken**: `Redacted`\<`string`\>

**`Experimental`**

<a id="refreshedat"></a>

##### refreshedAt

> `readonly` **refreshedAt**: `number`

**`Experimental`**

<a id="refreshtoken"></a>

##### refreshToken

> `readonly` **refreshToken**: `Redacted`\<`string`\>

**`Experimental`**

***

<a id="deviceprompt"></a>

### DevicePrompt

**`Experimental`**

#### Properties

<a id="usercode"></a>

##### userCode

> `readonly` **userCode**: `string`

**`Experimental`**

<a id="verificationurl"></a>

##### verificationUrl

> `readonly` **verificationUrl**: `string`

**`Experimental`**

<a id="warning"></a>

##### warning

> `readonly` **warning**: `string`

**`Experimental`**

***

<a id="timingoptions"></a>

### TimingOptions

**`Experimental`**

#### Properties

<a id="devicetimeout"></a>

##### deviceTimeout?

> `readonly` `optional` **deviceTimeout?**: `number`

**`Experimental`**

## Type Aliases

<a id="error"></a>

### Error

> **Error** = [`AuthError`](#autherror) \| [`StoreError`](#storeerror)

**`Experimental`**

***

<a id="status"></a>

### Status

> **Status** = \{ `_tag`: `"Unauthenticated"`; \} \| \{ `_tag`: `"Present"`; `fingerprint`: `string`; \} \| \{ `_tag`: `"RefreshRequired"`; `fingerprint`: `string`; \} \| \{ `_tag`: `"Corrupt"`; \}

**`Experimental`**

***

<a id="tokenresponse"></a>

### TokenResponse

> **TokenResponse** = *typeof* `TokenResponse.Type`

**`Experimental`**

## Variables

<a id="authorizationurl"></a>

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

<a id="clientid"></a>

### clientId

> `const` **clientId**: `"app_EMoamEEZ73f0CkXaXp7hrann"` = `"app_EMoamEEZ73f0CkXaXp7hrann"`

**`Experimental`**

***

<a id="credentialdisk"></a>

### CredentialDisk

> `const` **CredentialDisk**: `Schema.Struct`\<\{ `accessToken`: `Schema.String`; `accountId`: `Schema.String`; `expiresAt`: `Schema.Finite`; `fingerprint`: `Schema.String`; `formatVersion`: `Schema.Literal`\<`1`\>; `generation`: `Schema.String`; `idToken`: `Schema.String`; `refreshedAt`: `Schema.Finite`; `refreshToken`: `Schema.String`; \}\>

**`Experimental`**

***

<a id="credentialformatversion"></a>

### credentialFormatVersion

> `const` **credentialFormatVersion**: `1` = `1`

**`Experimental`**

***

<a id="deviceexchangeredirect"></a>

### deviceExchangeRedirect

> `const` **deviceExchangeRedirect**: `"https://auth.openai.com/deviceauth/callback"` = `"https://auth.openai.com/deviceauth/callback"`

**`Experimental`**

***

<a id="devicepollresponse"></a>

### DevicePollResponse

> `const` **DevicePollResponse**: `Schema.Struct`\<\{ `authorization_code`: `Schema.String`; `code_challenge`: `Schema.String`; `code_verifier`: `Schema.String`; \}\>

**`Experimental`**

***

<a id="devicestartresponse"></a>

### DeviceStartResponse

> `const` **DeviceStartResponse**: `Schema.Struct`\<\{ `device_auth_id`: `Schema.String`; `interval`: `Schema.String`; `user_code`: `Schema.String`; \}\>

**`Experimental`**

***

<a id="deviceverificationurl"></a>

### deviceVerificationUrl

> `const` **deviceVerificationUrl**: `"https://auth.openai.com/codex/device"` = `"https://auth.openai.com/codex/device"`

**`Experimental`**

***

<a id="generatepkce"></a>

### generatePkce

> `const` **generatePkce**: `Effect.Effect`\<\{ `challenge`: `string`; `state`: `Redacted.Redacted`\<`string`\>; `verifier`: `Redacted.Redacted`\<`string`\>; \}, [`AuthError`](#autherror), `Crypto.Crypto`\>

**`Experimental`**

***

<a id="issuer"></a>

### issuer

> `const` **issuer**: `"https://auth.openai.com"` = `"https://auth.openai.com"`

**`Experimental`**

***

<a id="layer"></a>

### layer

> `const` **layer**: (`options?`) => `Layer.Layer`\<[`OpenAIAccountAuth`](#openaiaccountauth), `never`, [`BrowserAuthorization`](#browserauthorization) \| [`CredentialStore`](#credentialstore) \| `Crypto.Crypto` \| [`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter) \| [`OAuthClient`](#oauthclient)\>

**`Experimental`**

#### Parameters

##### options?

[`TimingOptions`](#timingoptions)

#### Returns

`Layer.Layer`\<[`OpenAIAccountAuth`](#openaiaccountauth), `never`, [`BrowserAuthorization`](#browserauthorization) \| [`CredentialStore`](#credentialstore) \| `Crypto.Crypto` \| [`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter) \| [`OAuthClient`](#oauthclient)\>

***

<a id="layerbrowserauthorizationtest"></a>

### layerBrowserAuthorizationTest

> `const` **layerBrowserAuthorizationTest**: (`implementation`) => `Layer.Layer`\<[`BrowserAuthorization`](#browserauthorization)\>

**`Experimental`**

#### Parameters

##### implementation

[`BrowserAuthorization`](#browserauthorization)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`BrowserAuthorization`](#browserauthorization)\>

***

<a id="layercredentialstoretest"></a>

### layerCredentialStoreTest

> `const` **layerCredentialStoreTest**: (`implementation`) => `Layer.Layer`\<[`CredentialStore`](#credentialstore)\>

**`Experimental`**

#### Parameters

##### implementation

[`CredentialStore`](#credentialstore)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`CredentialStore`](#credentialstore)\>

***

<a id="layerdeviceauthorizationpresentertest"></a>

### layerDeviceAuthorizationPresenterTest

> `const` **layerDeviceAuthorizationPresenterTest**: (`implementation`) => `Layer.Layer`\<[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\>

**`Experimental`**

#### Parameters

##### implementation

[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`DeviceAuthorizationPresenter`](#deviceauthorizationpresenter)\>

***

<a id="layeroauthclienttest"></a>

### layerOAuthClientTest

> `const` **layerOAuthClientTest**: (`implementation`) => `Layer.Layer`\<[`OAuthClient`](#oauthclient)\>

**`Experimental`**

#### Parameters

##### implementation

[`OAuthClient`](#oauthclient)\[`"Service"`\]

#### Returns

`Layer.Layer`\<[`OAuthClient`](#oauthclient)\>

***

<a id="originator"></a>

### originator

> `const` **originator**: `"codex_cli_rs"` = `"codex_cli_rs"`

**`Experimental`**

***

<a id="redirecturi"></a>

### redirectUri

> `const` **redirectUri**: `"http://localhost:1455/auth/callback"` = `"http://localhost:1455/auth/callback"`

**`Experimental`**

***

<a id="scopes"></a>

### scopes

> `const` **scopes**: `"openid profile email offline_access api.connectors.read api.connectors.invoke"` = `"openid profile email offline_access api.connectors.read api.connectors.invoke"`

**`Experimental`**

***

<a id="tokenresponse-1"></a>

### TokenResponse

> `const` **TokenResponse**: `Schema.Struct`\<\{ `access_token`: `Schema.optionalKey`\<`Schema.String`\>; `expires_in`: `Schema.optionalKey`\<`Schema.Int`\>; `id_token`: `Schema.optionalKey`\<`Schema.String`\>; `refresh_token`: `Schema.optionalKey`\<`Schema.String`\>; \}\>

**`Experimental`**
