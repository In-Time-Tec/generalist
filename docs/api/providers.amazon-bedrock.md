[**generalist**](./index)

***

[generalist](./index) / providers.amazon-bedrock

# providers.amazon-bedrock

## Classes

### Client

#### Extends

- `Client_base`

#### Constructors

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

### ClientFailure

#### Extends

- `ClientFailure_base`

#### Constructors

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

##### awsErrorCode?

> `readonly` `optional` **awsErrorCode?**: `string`

###### Inherited from

`ClientFailure_base.awsErrorCode`

##### awsErrorName?

> `readonly` `optional` **awsErrorName?**: `string`

###### Inherited from

`ClientFailure_base.awsErrorName`

##### description

> `readonly` **description**: `string`

###### Inherited from

`ClientFailure_base.description`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`ClientFailure_base.hint`

##### httpStatus?

> `readonly` `optional` **httpStatus?**: `number`

###### Inherited from

`ClientFailure_base.httpStatus`

##### operation

> `readonly` **operation**: `"converse"` \| `"converseStream"` \| `"invokeModel"`

###### Inherited from

`ClientFailure_base.operation`

##### requestId?

> `readonly` `optional` **requestId?**: `string`

###### Inherited from

`ClientFailure_base.requestId`

***

### CredentialFailure

#### Extends

- `CredentialFailure_base`

#### Constructors

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

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`CredentialFailure_base.hint`

##### operation

> `readonly` **operation**: `"acquire"` \| `"refreshRejected"`

###### Inherited from

`CredentialFailure_base.operation`

***

### RecoveryFailure

#### Extends

- `RecoveryFailure_base`

#### Constructors

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

##### description

> `readonly` **description**: `string`

###### Inherited from

`RecoveryFailure_base.description`

##### hint

> `readonly` **hint**: `string`

###### Inherited from

`RecoveryFailure_base.hint`

## Interfaces

### ClientOptions

#### Properties

##### authMode?

> `readonly` `optional` **authMode?**: `"default"` \| `"bearer"`

##### bearerToken?

> `readonly` `optional` **bearerToken?**: `Redacted`\<`string`\>

##### client?

> `readonly` `optional` **client?**: [`Service`](#service)

##### credentials?

> `readonly` `optional` **credentials?**: [`Credentials`](#credentials-1)

##### endpoint?

> `readonly` `optional` **endpoint?**: `string`

##### profile?

> `readonly` `optional` **profile?**: `string`

##### recovery?

> `readonly` `optional` **recovery?**: [`Recovery`](#recovery-1)

##### region?

> `readonly` `optional` **region?**: `string`

##### requestHandler?

> `readonly` `optional` **requestHandler?**: (Record\<string, unknown\> \| NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

***

### Credential

#### Properties

##### accessKeyId

> `readonly` **accessKeyId**: `string`

##### expiration?

> `readonly` `optional` **expiration?**: `Date`

##### generation

> `readonly` **generation**: `string`

##### secretAccessKey

> `readonly` **secretAccessKey**: `Redacted`\<`string`\>

##### sessionToken?

> `readonly` `optional` **sessionToken?**: `Redacted`\<`string`\>

***

### Credentials

#### Properties

##### acquire

> `readonly` **acquire**: `Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

##### refreshRejected

> `readonly` **refreshRejected**: (`generation`) => `Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

###### Parameters

###### generation

`string`

###### Returns

`Effect`\<[`Credential`](#credential), [`CredentialFailure`](#credentialfailure)\>

***

### EmbeddingOptions

Amazon Bedrock embedding model configuration.

#### Properties

##### dimensions?

> `readonly` `optional` **dimensions?**: `256` \| `512` \| `1024`

##### model

> `readonly` **model**: `string`

##### normalize?

> `readonly` `optional` **normalize?**: `boolean`

***

### Options

#### Extends

- [`RegistrationOptions`](./providers.openai#registrationoptions)

#### Properties

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

##### metadata?

> `readonly` `optional` **metadata?**: `object`

###### Index Signature

\[`key`: `string`\]: `unknown`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`metadata`](./providers.openai#metadata-3)

##### model

> `readonly` **model**: `string`

##### registrationKey?

> `readonly` `optional` **registrationKey?**: `string`

###### Inherited from

[`RegistrationOptions`](./providers.openai#registrationoptions).[`registrationKey`](./providers.openai#registrationkey-3)

***

### Recovery

#### Properties

##### recover

> `readonly` **recover**: (`rejectedGeneration`) => `Effect`\<`void`, [`RecoveryFailure`](#recoveryfailure)\>

###### Parameters

###### rejectedGeneration

`string`

###### Returns

`Effect`\<`void`, [`RecoveryFailure`](#recoveryfailure)\>

***

### Service

#### Properties

##### converse

> `readonly` **converse**: (`input`) => `Effect`\<`ConverseCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`ConverseCommandInput`

###### Returns

`Effect`\<`ConverseCommandOutput`, [`ClientFailure`](#clientfailure)\>

##### converseStream

> `readonly` **converseStream**: (`input`) => `Effect`\<`ConverseStreamCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`ConverseCommandInput`

###### Returns

`Effect`\<`ConverseStreamCommandOutput`, [`ClientFailure`](#clientfailure)\>

##### invokeModel

> `readonly` **invokeModel**: (`input`) => `Effect`\<`InvokeModelCommandOutput`, [`ClientFailure`](#clientfailure)\>

###### Parameters

###### input

`InvokeModelCommandInput`

###### Returns

`Effect`\<`InvokeModelCommandOutput`, [`ClientFailure`](#clientfailure)\>

## Type Aliases

### Config

> **Config** = *typeof* `ConfigSchema.Type`

## Variables

### classifyFailure

> `const` **classifyFailure**: [`FailureClassifier`](./generalist/namespaces/ModelRegistry#failureclassifier)

***

### decodeConfig

> `const` **decodeConfig**: (`options`) => `Effect.Effect`\<[`Config`](#config-1), `Schema.SchemaError`\>

#### Parameters

##### options

`ConfigInput`

#### Returns

`Effect.Effect`\<[`Config`](#config-1), `Schema.SchemaError`\>

***

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

### isRecoverableCredentialFailure

> `const` **isRecoverableCredentialFailure**: (`failure`) => `boolean`

#### Parameters

##### failure

[`ClientFailure`](#clientfailure)

#### Returns

`boolean`

***

### layer

> `const` **layer**: (`input`) => `Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `never`, `never`\>

#### Parameters

##### input

[`Options`](#options) & `object`

#### Returns

`Layer.Layer`\<[`ModelRegistry`](./generalist/namespaces/ModelRegistry#modelregistry), `never`, `never`\>

***

### layerClient

> `const` **layerClient**: (`options?`) => `Layer.Layer`\<[`Client`](#client), `never`, `never`\>

#### Parameters

##### options?

[`ClientOptions`](#clientoptions)

#### Returns

`Layer.Layer`\<[`Client`](#client), `never`, `never`\>

***

### layerEmbedding

> `const` **layerEmbedding**: (`options`) => `Layer.Layer`\<`EmbeddingModel.EmbeddingModel`\>

EmbeddingModel layer backed by an owned Bedrock client.

#### Parameters

##### options

[`EmbeddingOptions`](#embeddingoptions) & `object`

#### Returns

`Layer.Layer`\<`EmbeddingModel.EmbeddingModel`\>

***

### layerLanguageModel

> `const` **layerLanguageModel**: (`input`) => `Layer.Layer`\<`LanguageModel.LanguageModel`, `never`, [`Client`](#client)\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Layer.Layer`\<`LanguageModel.LanguageModel`, `never`, [`Client`](#client)\>

***

### layerModel

> `const` **layerModel**: (`input`) => `Model.Model`\<`"amazon-bedrock"`, `LanguageModel.LanguageModel`, [`Client`](#client)\>

Model layer over the Bedrock `Client`; provide it to a run with `Effect.provide`.

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Model.Model`\<`"amazon-bedrock"`, `LanguageModel.LanguageModel`, [`Client`](#client)\>

***

### make

> `const` **make**: (`input`) => `Effect.Effect`\<`LanguageModel.Service`, `never`, [`Client`](#client)\>

#### Parameters

##### input

[`Options`](#options)

#### Returns

`Effect.Effect`\<`LanguageModel.Service`, `never`, [`Client`](#client)\>

***

### makeEmbedding

> `const` **makeEmbedding**: (`options`) => `Effect.Effect`\<`EmbeddingModel.Service`, `never`, [`Client`](#client)\>

Effect AI EmbeddingModel backed by Bedrock InvokeModel.

#### Parameters

##### options

[`EmbeddingOptions`](#embeddingoptions)

#### Returns

`Effect.Effect`\<`EmbeddingModel.Service`, `never`, [`Client`](#client)\>

***

### toolJsonSchemaCompiler

> `const` **toolJsonSchemaCompiler**: [`ToolJsonSchemaCompiler`](./generalist/namespaces/ModelRegistry#tooljsonschemacompiler-1)
