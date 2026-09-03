[**generalist**](./index)

***

[generalist](./index) / providers.amazon-bedrock

# providers.amazon-bedrock

## Classes

<a id="client"></a>

### Client

#### Extends

- `Client_base`

#### Constructors

<a id="constructor"></a>

##### Constructor

> **new Client**(`_`): [`Client`](#client)

###### Parameters

###### \_

`never`

###### Returns

[`Client`](#client)

###### Inherited from

`Client_base.constructor`

***

<a id="clientfailure"></a>

### ClientFailure

#### Extends

- `ClientFailure_base`

#### Constructors

<a id="constructor-1"></a>

##### Constructor

> **new ClientFailure**(...`args`): [`ClientFailure`](#clientfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`ClientFailure`](#clientfailure)

###### Inherited from

`ClientFailure_base.constructor`

#### Properties

<a id="awserrorcode"></a>

##### awsErrorCode?

> `readonly` `optional` **awsErrorCode?**: `string`

###### Inherited from

`ClientFailure_base.awsErrorCode`

<a id="awserrorname"></a>

##### awsErrorName?

> `readonly` `optional` **awsErrorName?**: `string`

###### Inherited from

`ClientFailure_base.awsErrorName`

<a id="description"></a>

##### description

> `readonly` **description**: `string`

###### Inherited from

`ClientFailure_base.description`

<a id="hint"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ClientFailure_base.hint`

<a id="httpstatus"></a>

##### httpStatus?

> `readonly` `optional` **httpStatus?**: `number`

###### Inherited from

`ClientFailure_base.httpStatus`

<a id="operation"></a>

##### operation

> `readonly` **operation**: `"converse"` \| `"converseStream"` \| `"invokeModel"`

###### Inherited from

`ClientFailure_base.operation`

<a id="requestid"></a>

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`ClientFailure_base.requestId`

***

<a id="credentialfailure"></a>

### CredentialFailure

#### Extends

- `CredentialFailure_base`

#### Constructors

<a id="constructor-2"></a>

##### Constructor

> **new CredentialFailure**(...`args`): [`CredentialFailure`](#credentialfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`CredentialFailure`](#credentialfailure)

###### Inherited from

`CredentialFailure_base.constructor`

#### Properties

<a id="hint-1"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CredentialFailure_base.hint`

<a id="operation-1"></a>

##### operation

> `readonly` **operation**: `"acquire"` \| `"refreshRejected"`

###### Inherited from

`CredentialFailure_base.operation`

***

<a id="recoveryfailure"></a>

### RecoveryFailure

#### Extends

- `RecoveryFailure_base`

#### Constructors

<a id="constructor-3"></a>

##### Constructor

> **new RecoveryFailure**(...`args`): [`RecoveryFailure`](#recoveryfailure)

###### Parameters

###### args

...\[`object`, `MakeOptions`\]

###### Returns

[`RecoveryFailure`](#recoveryfailure)

###### Inherited from

`RecoveryFailure_base.constructor`

#### Properties

<a id="description-1"></a>

##### description

> `readonly` **description**: `string`

###### Inherited from

`RecoveryFailure_base.description`

<a id="hint-2"></a>

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RecoveryFailure_base.hint`

## Interfaces

<a id="clientoptions"></a>

### ClientOptions

#### Properties

<a id="authmode"></a>

##### authMode?

> `readonly` `optional` **authMode?**: `"default"` \| `"bearer"`

<a id="bearertoken"></a>

##### bearerToken?

> `readonly` `optional` **bearerToken?**: `Redacted`\<`string`\>

<a id="client-1"></a>

##### client?

> `readonly` `optional` **client?**: [`Service`](#service)

<a id="credentials"></a>

##### credentials?

> `readonly` `optional` **credentials?**: [`Credentials`](#credentials-1)

<a id="endpoint"></a>

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

<a id="profile"></a>

##### profile?

> `readonly` `optional` **profile?**: `string`

<a id="recovery"></a>

##### recovery?

> `readonly` `optional` **recovery?**: [`Recovery`](#recovery-1)

<a id="region"></a>

##### region?

> `readonly` `optional` **region?**: `string`

<a id="requesthandler"></a>

##### requestHandler?

> `readonly` `optional` **requestHandler?**: (Record\<string, unknown\> \| NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

***

<a id="credential"></a>

### Credential

#### Properties

<a id="accesskeyid"></a>

##### accessKeyId

> `readonly` **accessKeyId**: `string`

<a id="expiration"></a>

##### expiration?

> `readonly` `optional` **expiration?**: `Date`

<a id="generation"></a>

##### generation

> `readonly` **generation**: `string`

<a id="secretaccesskey"></a>

##### secretAccessKey

> `readonly` **secretAccessKey**: `Redacted`\<`string`\>

<a id="sessiontoken"></a>

##### sessionToken?

> `readonly` `optional` **sessionToken?**: `Redacted`\<`string`\>

***

<a id="credentials-1"></a>

### Credentials

#### Properties

<a id="acquire"></a>

##### acquire

> `readonly` **acquire**: `Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

<a id="refreshrejected"></a>

##### refreshRejected

> `readonly` **refreshRejected**: (`generation`) => `Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

###### Parameters

###### generation

`string`

###### Returns

`Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

***

<a id="embeddingoptions"></a>

### EmbeddingOptions

Amazon Bedrock embedding model configuration.

#### Properties

<a id="dimensions"></a>

##### dimensions?

> `readonly` `optional` **dimensions?**: `256` \| `512` \| `1024`

<a id="model"></a>

##### model

> `readonly` **model**: `string`

<a id="normalize"></a>

##### normalize?

> `readonly` `optional` **normalize?**: `boolean`

***

<a id="options"></a>

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai#registrationoptions)

#### Properties

<a id="config"></a>

##### config?

> `readonly` `optional` **config?**: `object`

###### additionalModelRequestFields?

> `readonly` `optional` **additionalModelRequestFields?**: `object`

###### Index Signature

\[`key`: `string`\]: `Json`

###### additionalModelResponseFieldPaths?

> `readonly` `optional` **additionalModelResponseFieldPaths?**: readonly `string`[]

###### guardrailConfig?

> `readonly` `optional` **guardrailConfig?**: `object`

###### guardrailConfig.guardrailIdentifier

> `readonly` **guardrailIdentifier**: `string`

###### guardrailConfig.guardrailVersion

> `readonly` **guardrailVersion**: `string`

###### guardrailConfig.trace?

> `readonly` `optional` **trace?**: `"disabled"` \| `"enabled"` \| `"enabled_full"`

###### maxTokens?

> `readonly` `optional` **maxTokens?**: `number`

###### performanceConfig?

> `readonly` `optional` **performanceConfig?**: `object`

###### performanceConfig.latency?

> `readonly` `optional` **latency?**: `"standard"` \| `"optimized"`

###### promptVariables?

> `readonly` `optional` **promptVariables?**: `object`

###### Index Signature

\[`key`: `string`\]: `object`

###### requestMetadata?

> `readonly` `optional` **requestMetadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `string`

###### stopSequences?

> `readonly` `optional` **stopSequences?**: readonly `string`[]

###### temperature?

> `readonly` `optional` **temperature?**: `number`

###### topP?

> `readonly` `optional` **topP?**: `number`

<a id="metadata"></a>

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

<a id="model-1"></a>

##### model

> `readonly` **model**: `string`

<a id="registrationkey"></a>

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

***

<a id="recovery-1"></a>

### Recovery

#### Properties

<a id="recover"></a>

##### recover

> `readonly` **recover**: (`rejectedGeneration`) => `Effect`\<`void`, [`RecoveryFailure`](#recoveryfailure)\>

###### Parameters

###### rejectedGeneration

`string`

###### Returns

`Effect`\<`void`, [`RecoveryFailure`](#recoveryfailure)\>

***

<a id="service"></a>

### Service

#### Properties

<a id="converse"></a>

##### converse

> `readonly` **converse**: (`input`) => `Effect`\<`ConverseCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`ConverseCommandInput`

###### Returns

`Effect`\<`ConverseCommandOutput`, [`ClientFailure`](#clientfailure)\>

<a id="conversestream"></a>

##### converseStream

> `readonly` **converseStream**: (`input`) => `Effect`\<`ConverseStreamCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`ConverseCommandInput`

###### Returns

`Effect`\<`ConverseStreamCommandOutput`, [`ClientFailure`](#clientfailure)\>

<a id="invokemodel"></a>

##### invokeModel

> `readonly` **invokeModel**: (`input`) => `Effect`\<`InvokeModelCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`InvokeModelCommandInput`

###### Returns

`Effect`\<`InvokeModelCommandOutput`, [`ClientFailure`](#clientfailure)\>

## Type Aliases

<a id="config-1"></a>

### Config

> **Config** = *typeof* `ConfigSchema.Type`

## Variables

<a id="classifyfailure"></a>

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

<a id="decodeconfig"></a>

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-1), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-1), `Schema.SchemaError`\>

***

<a id="defaultchain"></a>

### defaultChain

> `const` **defaultChain**: (`options?`) => [`Credentials`](#credentials-1)

AWS SDK v3's Node default chain. It supports environment variables, shared
profiles (including SSO, roles, credential_process and CLI login), web
identity, ECS and EC2 instance metadata. Values are resolved for every call.

#### Parameters

##### options?

`Parameters`\<*typeof* `defaultProvider`\>\[`0`\]

#### Returns

[`Credentials`](#credentials-1)

***

<a id="isrecoverablecredentialfailure"></a>

### isRecoverableCredentialFailure

> `const` **isRecoverableCredentialFailure**: (`failure`) => `boolean`

#### Parameters

##### failure

[`ClientFailure`](#clientfailure)

#### Returns

`boolean`

***

<a id="layer"></a>

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `never`, `never`\>

#### Parameters

##### input

[`Options`](#options) & `object`

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `never`, `never`\>

***

<a id="layerclient"></a>

### layerClient

> `const` **layerClient**: (`options?`) => `Layer.Layer`\<[`Client`](#client), `never`, `never`\>

#### Parameters

##### options?

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`Client`](#client), `never`, `never`\>

***

<a id="layerembedding"></a>

### layerEmbedding

> `const` **layerEmbedding**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`\>

EmbeddingModel layer backed by an owned Bedrock client.

#### Parameters

##### options

[`EmbeddingOptions`](#embeddingoptions) & `object`

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`\>

***

<a id="layerlanguagemodel"></a>

### layerLanguageModel

> `const` **layerLanguageModel**: (`input`) => `Layer.Layer`\<`LanguageModel.LanguageModel`, `never`, [`Client`](#client)\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<`LanguageModel.LanguageModel`, `never`, [`Client`](#client)\>

***

<a id="layermodel"></a>

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"amazon-bedrock"`, `LanguageModel.LanguageModel`, [`Client`](#client)\>

Model layer over the Bedrock `Client`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"amazon-bedrock"`, `LanguageModel.LanguageModel`, [`Client`](#client)\>

***

<a id="make"></a>

### make

> `const` **make**: (`input`) => `Effect.Effect`\<`LanguageModel.Service`, `never`, [`Client`](#client)\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Effect.Effect`\<`LanguageModel.Service`, `never`, [`Client`](#client)\>

***

<a id="makeembedding"></a>

### makeEmbedding

> `const` **makeEmbedding**: (`options`) => `Effect.Effect`\<`EmbeddingModel.Service`, `never`, [`Client`](#client)\>

Effect AI EmbeddingModel backed by Bedrock InvokeModel.

#### Parameters

##### options

[`EmbeddingOptions`](#embeddingoptions)

#### Returns

`Effect.Effect`\<`EmbeddingModel.Service`, `never`, [`Client`](#client)\>

***

<a id="tooljsonschemacompiler"></a>

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
