import {
  classifyFailure as Anthropic_classifyFailure,
  decodeConfig as Anthropic_decodeConfig,
  toolJsonSchemaCompiler as Anthropic_toolJsonSchemaCompiler,
  layer as Anthropic_layer,
  registration as Anthropic_registration,
  layerConfig as Anthropic_layerConfig,
} from "./provider/anthropic.js"
export const Anthropic = {
  classifyFailure: Anthropic_classifyFailure,
  decodeConfig: Anthropic_decodeConfig,
  toolJsonSchemaCompiler: Anthropic_toolJsonSchemaCompiler,
  layer: Anthropic_layer,
  registration: Anthropic_registration,
  layerConfig: Anthropic_layerConfig,
}
export namespace Anthropic {
  export type classifyFailure = typeof import("./provider/anthropic.js").classifyFailure
  export type decodeConfig = typeof import("./provider/anthropic.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/anthropic.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/anthropic.js").layer
  export type registration = typeof import("./provider/anthropic.js").registration
  export type layerConfig = typeof import("./provider/anthropic.js").layerConfig
  export type AnthropicInput = import("./provider/anthropic.js").AnthropicInput
  export type Config = import("./provider/anthropic.js").Config
  export type LayerOptions = import("./provider/anthropic.js").LayerOptions
}
import {
  Client as amazonBedrockClient,
  ClientFailure as amazonBedrockClientFailure,
  CredentialFailure as amazonBedrockCredentialFailure,
  RecoveryFailure as amazonBedrockRecoveryFailure,
  defaultChain as amazonBedrockDefaultChain,
  isRecoverableCredentialFailure as amazonBedrockIsRecoverableCredentialFailure,
  layerClient as amazonBedrockLayerClient,
  make as amazonBedrockMake,
  layerLanguageModel as amazonBedrockLayerLanguageModel,
  classifyFailure as amazonBedrockClassifyFailure,
  decodeConfig as amazonBedrockDecodeConfig,
  toolJsonSchemaCompiler as amazonBedrockToolJsonSchemaCompiler,
  layer as amazonBedrockLayer,
} from "./provider/bedrock/service.js"
import { make as amazonBedrockRequestMake } from "./provider/bedrock/request.js"
const AmazonBedrockRequest = { make: amazonBedrockRequestMake }
export const AmazonBedrock = {
  Client: amazonBedrockClient,
  ClientFailure: amazonBedrockClientFailure,
  CredentialFailure: amazonBedrockCredentialFailure,
  RecoveryFailure: amazonBedrockRecoveryFailure,
  defaultChain: amazonBedrockDefaultChain,
  isRecoverableCredentialFailure: amazonBedrockIsRecoverableCredentialFailure,
  layerClient: amazonBedrockLayerClient,
  Request: AmazonBedrockRequest,
  make: amazonBedrockMake,
  layerLanguageModel: amazonBedrockLayerLanguageModel,
  classifyFailure: amazonBedrockClassifyFailure,
  decodeConfig: amazonBedrockDecodeConfig,
  toolJsonSchemaCompiler: amazonBedrockToolJsonSchemaCompiler,
  layer: amazonBedrockLayer,
}
export namespace AmazonBedrock {
  export type Client = typeof import("./provider/bedrock/service.js").Client
  export type ClientFailure = typeof import("./provider/bedrock/service.js").ClientFailure
  export type CredentialFailure = typeof import("./provider/bedrock/service.js").CredentialFailure
  export type RecoveryFailure = typeof import("./provider/bedrock/service.js").RecoveryFailure
  export type defaultChain = typeof import("./provider/bedrock/service.js").defaultChain
  export type isRecoverableCredentialFailure =
    typeof import("./provider/bedrock/service.js").isRecoverableCredentialFailure
  export type layerClient = typeof import("./provider/bedrock/service.js").layerClient
  export type Request = typeof AmazonBedrockRequest
  export type make = typeof import("./provider/bedrock/service.js").make
  export type layerLanguageModel = typeof import("./provider/bedrock/service.js").layerLanguageModel
  export type classifyFailure = typeof import("./provider/bedrock/service.js").classifyFailure
  export type decodeConfig = typeof import("./provider/bedrock/service.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/bedrock/service.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/bedrock/service.js").layer
  export type Config = import("./provider/bedrock/service.js").Config
  export type Credential = import("./provider/bedrock/service.js").Credential
  export type Credentials = import("./provider/bedrock/service.js").Credentials
  export type Input = import("./provider/bedrock/service.js").Input
  export type Interface = import("./provider/bedrock/service.js").Interface
  export type Options = import("./provider/bedrock/service.js").Options
  export type Recovery = import("./provider/bedrock/service.js").Recovery
}
import {
  ModelMetadataNotFound as Catalog_ModelMetadataNotFound,
  ModelCatalog as Catalog_ModelCatalog,
  bundled as Catalog_bundled,
  layer as Catalog_layer,
  layerTest as Catalog_layerTest,
  lookup as Catalog_lookup,
  require as Catalog_require,
  all as Catalog_all,
} from "./catalog/service.js"
export const Catalog = {
  ModelMetadataNotFound: Catalog_ModelMetadataNotFound,
  ModelCatalog: Catalog_ModelCatalog,
  bundled: Catalog_bundled,
  layer: Catalog_layer,
  layerTest: Catalog_layerTest,
  lookup: Catalog_lookup,
  require: Catalog_require,
  all: Catalog_all,
}
export namespace Catalog {
  export type ModelMetadataNotFound = import("./catalog/service.js").ModelMetadataNotFound
  export type ModelCatalog = import("./catalog/service.js").ModelCatalog
  export type bundled = typeof import("./catalog/service.js").bundled
  export type layer = typeof import("./catalog/service.js").layer
  export type layerTest = typeof import("./catalog/service.js").layerTest
  export type lookup = typeof import("./catalog/service.js").lookup
  export type require = typeof import("./catalog/service.js").require
  export type all = typeof import("./catalog/service.js").all
  export type Interface = import("./catalog/service.js").Interface
  export type ModelMetadata = import("./catalog/service.js").ModelMetadata
}
import {
  registration as Deterministic_registration,
  layer as Deterministic_layer,
  layerOpenAi as Deterministic_layerOpenAi,
} from "./provider/deterministic.js"
export const Deterministic = {
  registration: Deterministic_registration,
  layer: Deterministic_layer,
  layerOpenAi: Deterministic_layerOpenAi,
}
export namespace Deterministic {
  export type registration = typeof import("./provider/deterministic.js").registration
  export type layer = typeof import("./provider/deterministic.js").layer
  export type layerOpenAi = typeof import("./provider/deterministic.js").layerOpenAi
  export type DeterministicInput = import("./provider/deterministic.js").DeterministicInput
  export type OpenAiFallbackOptions = import("./provider/deterministic.js").OpenAiFallbackOptions
}
import { layer as Embedding_layer, layerCompatible as Embedding_layerCompatible } from "./model/embedding.js"
export const Embedding = {
  layer: Embedding_layer,
  layerCompatible: Embedding_layerCompatible,
}
export namespace Embedding {
  export type layer = typeof import("./model/embedding.js").layer
  export type layerCompatible = typeof import("./model/embedding.js").layerCompatible
  export type OpenAiCompatibleEmbeddingInput = import("./model/embedding.js").OpenAiCompatibleEmbeddingInput
  export type OpenAiEmbeddingInput = import("./model/embedding.js").OpenAiEmbeddingInput
}
import {
  AvailabilitySemanticsMissing as ModelRoute_AvailabilitySemanticsMissing,
  make as ModelRoute_make,
} from "./model/route.js"
export const ModelRoute = {
  AvailabilitySemanticsMissing: ModelRoute_AvailabilitySemanticsMissing,
  make: ModelRoute_make,
}
export namespace ModelRoute {
  export type AvailabilitySemanticsMissing = import("./model/route.js").AvailabilitySemanticsMissing
  export type make = typeof import("./model/route.js").make
  export type Input = import("./model/route.js").Input
  export type Route = import("./model/route.js").Route
}
import {
  classifyFailure as OpenAi_classifyFailure,
  decodeConfig as OpenAi_decodeConfig,
  toolJsonSchemaCompiler as OpenAi_toolJsonSchemaCompiler,
  layer as OpenAi_layer,
  registration as OpenAi_registration,
  normalizeResponsesSse as OpenAi_normalizeResponsesSse,
  layerConfig as OpenAi_layerConfig,
} from "./provider/openai.js"
import {
  OpenAiAccountCredentialError as OpenAi_OpenAiAccountCredentialError,
  credentialsFromAccountAuth as OpenAi_credentialsFromAccountAuth,
  registrationAccount as OpenAi_registrationAccount,
  layerAccount as OpenAi_layerAccount,
  layerAccountClient as OpenAi_layerAccountClient,
} from "./provider/openai-account.js"
export const OpenAi = {
  classifyFailure: OpenAi_classifyFailure,
  decodeConfig: OpenAi_decodeConfig,
  toolJsonSchemaCompiler: OpenAi_toolJsonSchemaCompiler,
  layer: OpenAi_layer,
  registration: OpenAi_registration,
  normalizeResponsesSse: OpenAi_normalizeResponsesSse,
  layerConfig: OpenAi_layerConfig,
  OpenAiAccountCredentialError: OpenAi_OpenAiAccountCredentialError,
  credentialsFromAccountAuth: OpenAi_credentialsFromAccountAuth,
  registrationAccount: OpenAi_registrationAccount,
  layerAccount: OpenAi_layerAccount,
  layerAccountClient: OpenAi_layerAccountClient,
}
export namespace OpenAi {
  export type classifyFailure = typeof import("./provider/openai.js").classifyFailure
  export type decodeConfig = typeof import("./provider/openai.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai.js").layer
  export type registration = typeof import("./provider/openai.js").registration
  export type normalizeResponsesSse = typeof import("./provider/openai.js").normalizeResponsesSse
  export type layerConfig = typeof import("./provider/openai.js").layerConfig
  export type OpenAiAccountCredentialError = import("./provider/openai-account.js").OpenAiAccountCredentialError
  export type credentialsFromAccountAuth = typeof import("./provider/openai-account.js").credentialsFromAccountAuth
  export type registrationAccount = typeof import("./provider/openai-account.js").registrationAccount
  export type layerAccount = typeof import("./provider/openai-account.js").layerAccount
  export type layerAccountClient = typeof import("./provider/openai-account.js").layerAccountClient
  export type LayerOptions = import("./provider/openai.js").LayerOptions
  export type Config = import("./provider/openai.js").Config
  export type OpenAiAccountCredential = import("./provider/openai-account.js").OpenAiAccountCredential
  export type OpenAiAccountCredentials = import("./provider/openai-account.js").OpenAiAccountCredentials
  export type OpenAiAccountInput = import("./provider/openai-account.js").OpenAiAccountInput
  export type OpenAiInput = import("./provider/openai.js").OpenAiInput
  export type RegistrationOptions = import("./provider/openai.js").RegistrationOptions
}
import {
  issuer as OpenAiAccountAuth_issuer,
  clientId as OpenAiAccountAuth_clientId,
  redirectUri as OpenAiAccountAuth_redirectUri,
  scopes as OpenAiAccountAuth_scopes,
  originator as OpenAiAccountAuth_originator,
  deviceVerificationUrl as OpenAiAccountAuth_deviceVerificationUrl,
  deviceExchangeRedirect as OpenAiAccountAuth_deviceExchangeRedirect,
  credentialFormatVersion as OpenAiAccountAuth_credentialFormatVersion,
  AuthError as OpenAiAccountAuth_AuthError,
  StoreError as OpenAiAccountAuth_StoreError,
  OpenAiAccountAuthHost as OpenAiAccountAuth_OpenAiAccountAuthHost,
  OpenAiAccountDevicePresenter as OpenAiAccountAuth_OpenAiAccountDevicePresenter,
  TokenResponse as OpenAiAccountAuth_TokenResponse,
  DeviceStartResponse as OpenAiAccountAuth_DeviceStartResponse,
  DevicePollResponse as OpenAiAccountAuth_DevicePollResponse,
  OpenAiAccountAuthHttp as OpenAiAccountAuth_OpenAiAccountAuthHttp,
  CredentialDisk as OpenAiAccountAuth_CredentialDisk,
  OpenAiAccountCredentialStore as OpenAiAccountAuth_OpenAiAccountCredentialStore,
  authorizationUrl as OpenAiAccountAuth_authorizationUrl,
  OpenAiAccountAuth as OpenAiAccountAuth_OpenAiAccountAuth,
  layer as OpenAiAccountAuth_layer,
  layerHostTest as OpenAiAccountAuth_layerHostTest,
  layerPresenterTest as OpenAiAccountAuth_layerPresenterTest,
  layerHttpTest as OpenAiAccountAuth_layerHttpTest,
  layerStoreTest as OpenAiAccountAuth_layerStoreTest,
  generatePkce as OpenAiAccountAuth_generatePkce,
} from "./provider/openai-account-auth.js"
export const OpenAiAccountAuth = {
  issuer: OpenAiAccountAuth_issuer,
  clientId: OpenAiAccountAuth_clientId,
  redirectUri: OpenAiAccountAuth_redirectUri,
  scopes: OpenAiAccountAuth_scopes,
  originator: OpenAiAccountAuth_originator,
  deviceVerificationUrl: OpenAiAccountAuth_deviceVerificationUrl,
  deviceExchangeRedirect: OpenAiAccountAuth_deviceExchangeRedirect,
  credentialFormatVersion: OpenAiAccountAuth_credentialFormatVersion,
  AuthError: OpenAiAccountAuth_AuthError,
  StoreError: OpenAiAccountAuth_StoreError,
  OpenAiAccountAuthHost: OpenAiAccountAuth_OpenAiAccountAuthHost,
  OpenAiAccountDevicePresenter: OpenAiAccountAuth_OpenAiAccountDevicePresenter,
  TokenResponse: OpenAiAccountAuth_TokenResponse,
  DeviceStartResponse: OpenAiAccountAuth_DeviceStartResponse,
  DevicePollResponse: OpenAiAccountAuth_DevicePollResponse,
  OpenAiAccountAuthHttp: OpenAiAccountAuth_OpenAiAccountAuthHttp,
  CredentialDisk: OpenAiAccountAuth_CredentialDisk,
  OpenAiAccountCredentialStore: OpenAiAccountAuth_OpenAiAccountCredentialStore,
  generatePkce: OpenAiAccountAuth_generatePkce,
  authorizationUrl: OpenAiAccountAuth_authorizationUrl,
  OpenAiAccountAuth: OpenAiAccountAuth_OpenAiAccountAuth,
  layer: OpenAiAccountAuth_layer,
  layerHostTest: OpenAiAccountAuth_layerHostTest,
  layerPresenterTest: OpenAiAccountAuth_layerPresenterTest,
  layerHttpTest: OpenAiAccountAuth_layerHttpTest,
  layerStoreTest: OpenAiAccountAuth_layerStoreTest,
}
export namespace OpenAiAccountAuth {
  export type issuer = typeof import("./provider/openai-account-auth.js").issuer
  export type clientId = typeof import("./provider/openai-account-auth.js").clientId
  export type redirectUri = typeof import("./provider/openai-account-auth.js").redirectUri
  export type scopes = typeof import("./provider/openai-account-auth.js").scopes
  export type originator = typeof import("./provider/openai-account-auth.js").originator
  export type deviceVerificationUrl = typeof import("./provider/openai-account-auth.js").deviceVerificationUrl
  export type deviceExchangeRedirect = typeof import("./provider/openai-account-auth.js").deviceExchangeRedirect
  export type credentialFormatVersion = typeof import("./provider/openai-account-auth.js").credentialFormatVersion
  export type AuthError = import("./provider/openai-account-auth.js").AuthError
  export type StoreError = import("./provider/openai-account-auth.js").StoreError
  export type OpenAiAccountAuthHost = import("./provider/openai-account-auth.js").OpenAiAccountAuthHost
  export type OpenAiAccountDevicePresenter = import("./provider/openai-account-auth.js").OpenAiAccountDevicePresenter
  export type TokenResponse = import("./provider/openai-account-auth.js").TokenResponse
  export type DeviceStartResponse = typeof import("./provider/openai-account-auth.js").DeviceStartResponse
  export type DevicePollResponse = typeof import("./provider/openai-account-auth.js").DevicePollResponse
  export type OpenAiAccountAuthHttp = import("./provider/openai-account-auth.js").OpenAiAccountAuthHttp
  export type CredentialDisk = typeof import("./provider/openai-account-auth.js").CredentialDisk
  export type OpenAiAccountCredentialStore = import("./provider/openai-account-auth.js").OpenAiAccountCredentialStore
  export type generatePkce = typeof import("./provider/openai-account-auth.js").generatePkce
  export type authorizationUrl = typeof import("./provider/openai-account-auth.js").authorizationUrl
  export type OpenAiAccountAuth = import("./provider/openai-account-auth.js").OpenAiAccountAuth
  export type layer = typeof import("./provider/openai-account-auth.js").layer
  export type layerHostTest = typeof import("./provider/openai-account-auth.js").layerHostTest
  export type layerPresenterTest = typeof import("./provider/openai-account-auth.js").layerPresenterTest
  export type layerHttpTest = typeof import("./provider/openai-account-auth.js").layerHttpTest
  export type layerStoreTest = typeof import("./provider/openai-account-auth.js").layerStoreTest
  export type AuthorizationResult = import("./provider/openai-account-auth.js").AuthorizationResult
  export type Credential = import("./provider/openai-account-auth.js").Credential
  export type DevicePrompt = import("./provider/openai-account-auth.js").DevicePrompt
  export type Error = import("./provider/openai-account-auth.js").Error
  export type HostInterface = import("./provider/openai-account-auth.js").HostInterface
  export type HttpInterface = import("./provider/openai-account-auth.js").HttpInterface
  export type PresenterInterface = import("./provider/openai-account-auth.js").PresenterInterface
  export type ServiceInterface = import("./provider/openai-account-auth.js").ServiceInterface
  export type Status = import("./provider/openai-account-auth.js").Status
  export type StoreInterface = import("./provider/openai-account-auth.js").StoreInterface
  export type TimingOptions = import("./provider/openai-account-auth.js").TimingOptions
}
import { layer as OpenAiAccountAuthHttp_layer } from "./provider/openai-account-auth-http.js"
export const OpenAiAccountAuthHttp = {
  layer: OpenAiAccountAuthHttp_layer,
}
export namespace OpenAiAccountAuthHttp {
  export type layer = typeof import("./provider/openai-account-auth-http.js").layer
}
import {
  decodeConfig as OpenAiChatCompletions_decodeConfig,
  toolJsonSchemaCompiler as OpenAiChatCompletions_toolJsonSchemaCompiler,
  layer as OpenAiChatCompletions_layer,
  layerConfig as OpenAiChatCompletions_layerConfig,
} from "./provider/openai-chat-completions.js"
export const OpenAiChatCompletions = {
  decodeConfig: OpenAiChatCompletions_decodeConfig,
  toolJsonSchemaCompiler: OpenAiChatCompletions_toolJsonSchemaCompiler,
  layer: OpenAiChatCompletions_layer,
  layerConfig: OpenAiChatCompletions_layerConfig,
}
export namespace OpenAiChatCompletions {
  export type decodeConfig = typeof import("./provider/openai-chat-completions.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai-chat-completions.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai-chat-completions.js").layer
  export type layerConfig = typeof import("./provider/openai-chat-completions.js").layerConfig
  export type Config = import("./provider/openai-chat-completions.js").Config
  export type LayerOptions = import("./provider/openai-chat-completions.js").LayerOptions
  export type OpenAiChatCompletionsInput = import("./provider/openai-chat-completions.js").OpenAiChatCompletionsInput
}
import {
  decodeConfig as OpenAiResponses_decodeConfig,
  toolJsonSchemaCompiler as OpenAiResponses_toolJsonSchemaCompiler,
  layer as OpenAiResponses_layer,
  layerConfig as OpenAiResponses_layerConfig,
} from "./provider/openai-responses.js"
export const OpenAiResponses = {
  decodeConfig: OpenAiResponses_decodeConfig,
  toolJsonSchemaCompiler: OpenAiResponses_toolJsonSchemaCompiler,
  layer: OpenAiResponses_layer,
  layerConfig: OpenAiResponses_layerConfig,
}
export namespace OpenAiResponses {
  export type decodeConfig = typeof import("./provider/openai-responses.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai-responses.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai-responses.js").layer
  export type layerConfig = typeof import("./provider/openai-responses.js").layerConfig
  export type LayerOptions = import("./provider/openai-responses.js").LayerOptions
  export type OpenAiResponsesInput = import("./provider/openai-responses.js").OpenAiResponsesInput
}
import {
  classifyFailure as OpenRouter_classifyFailure,
  decodeConfig as OpenRouter_decodeConfig,
  layer as OpenRouter_layer,
  layerConfig as OpenRouter_layerConfig,
  toolJsonSchemaCompiler as OpenRouter_toolJsonSchemaCompiler,
} from "./provider/openrouter.js"
export const OpenRouter = {
  classifyFailure: OpenRouter_classifyFailure,
  decodeConfig: OpenRouter_decodeConfig,
  layer: OpenRouter_layer,
  layerConfig: OpenRouter_layerConfig,
  toolJsonSchemaCompiler: OpenRouter_toolJsonSchemaCompiler,
}
export namespace OpenRouter {
  export type classifyFailure = typeof import("./provider/openrouter.js").classifyFailure
  export type decodeConfig = typeof import("./provider/openrouter.js").decodeConfig
  export type layer = typeof import("./provider/openrouter.js").layer
  export type layerConfig = typeof import("./provider/openrouter.js").layerConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openrouter.js").toolJsonSchemaCompiler
  export type LayerOptions = import("./provider/openrouter.js").LayerOptions
  export type OpenRouterInput = import("./provider/openrouter.js").OpenRouterInput
}
import {
  layerGroq as Presets_layerGroq,
  layerMistral as Presets_layerMistral,
  layerXai as Presets_layerXai,
  layerDeepseek as Presets_layerDeepseek,
  layerGoogleAiStudio as Presets_layerGoogleAiStudio,
  layerAzureOpenAi as Presets_layerAzureOpenAi,
  layerOllama as Presets_layerOllama,
} from "./catalog/presets.js"
export const Presets = {
  layerGroq: Presets_layerGroq,
  layerMistral: Presets_layerMistral,
  layerXai: Presets_layerXai,
  layerDeepseek: Presets_layerDeepseek,
  layerGoogleAiStudio: Presets_layerGoogleAiStudio,
  layerAzureOpenAi: Presets_layerAzureOpenAi,
  layerOllama: Presets_layerOllama,
}
export namespace Presets {
  export type layerGroq = typeof import("./catalog/presets.js").layerGroq
  export type layerMistral = typeof import("./catalog/presets.js").layerMistral
  export type layerXai = typeof import("./catalog/presets.js").layerXai
  export type layerDeepseek = typeof import("./catalog/presets.js").layerDeepseek
  export type layerGoogleAiStudio = typeof import("./catalog/presets.js").layerGoogleAiStudio
  export type layerAzureOpenAi = typeof import("./catalog/presets.js").layerAzureOpenAi
  export type layerOllama = typeof import("./catalog/presets.js").layerOllama
  export type AzureOpenAiInput = import("./catalog/presets.js").AzureOpenAiInput
  export type PresetInput = import("./catalog/presets.js").PresetInput
}
