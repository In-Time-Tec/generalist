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
  export type Options = import("./provider/anthropic.js").Options
  export type Config = import("./provider/anthropic.js").Config
  export type ClientOptions = import("./provider/anthropic.js").ClientOptions
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
  export type Options = import("./provider/bedrock/service.js").Options
  export type Service = import("./provider/bedrock/service.js").Service
  export type ClientOptions = import("./provider/bedrock/service.js").ClientOptions
  export type Recovery = import("./provider/bedrock/service.js").Recovery
}
import {
  ModelMetadataNotFound as ModelCatalog_ModelMetadataNotFound,
  ModelCatalog as ModelCatalog_ModelCatalog,
  bundled as ModelCatalog_bundled,
  layer as ModelCatalog_layer,
  layerTest as ModelCatalog_layerTest,
  lookup as ModelCatalog_lookup,
  require as ModelCatalog_require,
  all as ModelCatalog_all,
} from "./catalog/service.js"
export const ModelCatalog = {
  ModelMetadataNotFound: ModelCatalog_ModelMetadataNotFound,
  ModelCatalog: ModelCatalog_ModelCatalog,
  bundled: ModelCatalog_bundled,
  layer: ModelCatalog_layer,
  layerTest: ModelCatalog_layerTest,
  lookup: ModelCatalog_lookup,
  require: ModelCatalog_require,
  all: ModelCatalog_all,
}
export namespace ModelCatalog {
  export type ModelMetadataNotFound = import("./catalog/service.js").ModelMetadataNotFound
  export type ModelCatalog = import("./catalog/service.js").ModelCatalog
  export type bundled = typeof import("./catalog/service.js").bundled
  export type layer = typeof import("./catalog/service.js").layer
  export type layerTest = typeof import("./catalog/service.js").layerTest
  export type lookup = typeof import("./catalog/service.js").lookup
  export type require = typeof import("./catalog/service.js").require
  export type all = typeof import("./catalog/service.js").all
  export type Service = import("./catalog/service.js").Service
  export type ModelMetadata = import("./catalog/service.js").ModelMetadata
}
import {
  registration as Deterministic_registration,
  layer as Deterministic_layer,
  layerOpenAI as Deterministic_layerOpenAI,
} from "./provider/deterministic.js"
export const Deterministic = {
  registration: Deterministic_registration,
  layer: Deterministic_layer,
  layerOpenAI: Deterministic_layerOpenAI,
}
export namespace Deterministic {
  export type registration = typeof import("./provider/deterministic.js").registration
  export type layer = typeof import("./provider/deterministic.js").layer
  export type layerOpenAI = typeof import("./provider/deterministic.js").layerOpenAI
  export type Options = import("./provider/deterministic.js").Options
  export type OpenAIFallbackOptions = import("./provider/deterministic.js").OpenAIFallbackOptions
}
import { layer as Embedding_layer, layerCompatible as Embedding_layerCompatible } from "./model/embedding.js"
export const Embedding = {
  layer: Embedding_layer,
  layerCompatible: Embedding_layerCompatible,
}
export namespace Embedding {
  export type layer = typeof import("./model/embedding.js").layer
  export type layerCompatible = typeof import("./model/embedding.js").layerCompatible
  export type OpenAICompatibleOptions = import("./model/embedding.js").OpenAICompatibleOptions
  export type OpenAIOptions = import("./model/embedding.js").OpenAIOptions
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
  classifyFailure as OpenAI_classifyFailure,
  decodeConfig as OpenAI_decodeConfig,
  toolJsonSchemaCompiler as OpenAI_toolJsonSchemaCompiler,
  layer as OpenAI_layer,
  registration as OpenAI_registration,
  normalizeResponsesSse as OpenAI_normalizeResponsesSse,
  layerConfig as OpenAI_layerConfig,
} from "./provider/openai.js"
import {
  OpenAIAccountCredentialError as OpenAI_OpenAIAccountCredentialError,
  credentialsFromAccountAuth as OpenAI_credentialsFromAccountAuth,
  registrationAccount as OpenAI_registrationAccount,
  layerAccount as OpenAI_layerAccount,
  layerAccountClient as OpenAI_layerAccountClient,
} from "./provider/openai-account.js"
export const OpenAI = {
  classifyFailure: OpenAI_classifyFailure,
  decodeConfig: OpenAI_decodeConfig,
  toolJsonSchemaCompiler: OpenAI_toolJsonSchemaCompiler,
  layer: OpenAI_layer,
  registration: OpenAI_registration,
  normalizeResponsesSse: OpenAI_normalizeResponsesSse,
  layerConfig: OpenAI_layerConfig,
  OpenAIAccountCredentialError: OpenAI_OpenAIAccountCredentialError,
  credentialsFromAccountAuth: OpenAI_credentialsFromAccountAuth,
  registrationAccount: OpenAI_registrationAccount,
  layerAccount: OpenAI_layerAccount,
  layerAccountClient: OpenAI_layerAccountClient,
}
export namespace OpenAI {
  export type classifyFailure = typeof import("./provider/openai.js").classifyFailure
  export type decodeConfig = typeof import("./provider/openai.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai.js").layer
  export type registration = typeof import("./provider/openai.js").registration
  export type normalizeResponsesSse = typeof import("./provider/openai.js").normalizeResponsesSse
  export type layerConfig = typeof import("./provider/openai.js").layerConfig
  export type OpenAIAccountCredentialError = import("./provider/openai-account.js").OpenAIAccountCredentialError
  export type credentialsFromAccountAuth = typeof import("./provider/openai-account.js").credentialsFromAccountAuth
  export type registrationAccount = typeof import("./provider/openai-account.js").registrationAccount
  export type layerAccount = typeof import("./provider/openai-account.js").layerAccount
  export type layerAccountClient = typeof import("./provider/openai-account.js").layerAccountClient
  export type ClientOptions = import("./provider/openai.js").ClientOptions
  export type Config = import("./provider/openai.js").Config
  export type OpenAIAccountCredential = import("./provider/openai-account.js").OpenAIAccountCredential
  export type OpenAIAccountCredentials = import("./provider/openai-account.js").OpenAIAccountCredentials
  export type AccountOptions = import("./provider/openai-account.js").AccountOptions
  export type Options = import("./provider/openai.js").Options
  export type RegistrationOptions = import("./provider/openai.js").RegistrationOptions
}
import {
  issuer as OpenAIAccountAuth_issuer,
  clientId as OpenAIAccountAuth_clientId,
  redirectUri as OpenAIAccountAuth_redirectUri,
  scopes as OpenAIAccountAuth_scopes,
  originator as OpenAIAccountAuth_originator,
  deviceVerificationUrl as OpenAIAccountAuth_deviceVerificationUrl,
  deviceExchangeRedirect as OpenAIAccountAuth_deviceExchangeRedirect,
  credentialFormatVersion as OpenAIAccountAuth_credentialFormatVersion,
  AuthError as OpenAIAccountAuth_AuthError,
  StoreError as OpenAIAccountAuth_StoreError,
  OpenAIAccountAuthHost as OpenAIAccountAuth_OpenAIAccountAuthHost,
  OpenAIAccountDevicePresenter as OpenAIAccountAuth_OpenAIAccountDevicePresenter,
  TokenResponse as OpenAIAccountAuth_TokenResponse,
  DeviceStartResponse as OpenAIAccountAuth_DeviceStartResponse,
  DevicePollResponse as OpenAIAccountAuth_DevicePollResponse,
  OpenAIAccountAuthHttp as OpenAIAccountAuth_OpenAIAccountAuthHttp,
  CredentialDisk as OpenAIAccountAuth_CredentialDisk,
  OpenAIAccountCredentialStore as OpenAIAccountAuth_OpenAIAccountCredentialStore,
  authorizationUrl as OpenAIAccountAuth_authorizationUrl,
  OpenAIAccountAuth as OpenAIAccountAuth_OpenAIAccountAuth,
  layer as OpenAIAccountAuth_layer,
  layerHostTest as OpenAIAccountAuth_layerHostTest,
  layerPresenterTest as OpenAIAccountAuth_layerPresenterTest,
  layerHttpTest as OpenAIAccountAuth_layerHttpTest,
  layerStoreTest as OpenAIAccountAuth_layerStoreTest,
  generatePkce as OpenAIAccountAuth_generatePkce,
} from "./provider/openai-account-auth.js"
export const OpenAIAccountAuth = {
  issuer: OpenAIAccountAuth_issuer,
  clientId: OpenAIAccountAuth_clientId,
  redirectUri: OpenAIAccountAuth_redirectUri,
  scopes: OpenAIAccountAuth_scopes,
  originator: OpenAIAccountAuth_originator,
  deviceVerificationUrl: OpenAIAccountAuth_deviceVerificationUrl,
  deviceExchangeRedirect: OpenAIAccountAuth_deviceExchangeRedirect,
  credentialFormatVersion: OpenAIAccountAuth_credentialFormatVersion,
  AuthError: OpenAIAccountAuth_AuthError,
  StoreError: OpenAIAccountAuth_StoreError,
  OpenAIAccountAuthHost: OpenAIAccountAuth_OpenAIAccountAuthHost,
  OpenAIAccountDevicePresenter: OpenAIAccountAuth_OpenAIAccountDevicePresenter,
  TokenResponse: OpenAIAccountAuth_TokenResponse,
  DeviceStartResponse: OpenAIAccountAuth_DeviceStartResponse,
  DevicePollResponse: OpenAIAccountAuth_DevicePollResponse,
  OpenAIAccountAuthHttp: OpenAIAccountAuth_OpenAIAccountAuthHttp,
  CredentialDisk: OpenAIAccountAuth_CredentialDisk,
  OpenAIAccountCredentialStore: OpenAIAccountAuth_OpenAIAccountCredentialStore,
  generatePkce: OpenAIAccountAuth_generatePkce,
  authorizationUrl: OpenAIAccountAuth_authorizationUrl,
  OpenAIAccountAuth: OpenAIAccountAuth_OpenAIAccountAuth,
  layer: OpenAIAccountAuth_layer,
  layerHostTest: OpenAIAccountAuth_layerHostTest,
  layerPresenterTest: OpenAIAccountAuth_layerPresenterTest,
  layerHttpTest: OpenAIAccountAuth_layerHttpTest,
  layerStoreTest: OpenAIAccountAuth_layerStoreTest,
}
export namespace OpenAIAccountAuth {
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
  export type OpenAIAccountAuthHost = import("./provider/openai-account-auth.js").OpenAIAccountAuthHost
  export type OpenAIAccountDevicePresenter = import("./provider/openai-account-auth.js").OpenAIAccountDevicePresenter
  export type TokenResponse = import("./provider/openai-account-auth.js").TokenResponse
  export type DeviceStartResponse = typeof import("./provider/openai-account-auth.js").DeviceStartResponse
  export type DevicePollResponse = typeof import("./provider/openai-account-auth.js").DevicePollResponse
  export type OpenAIAccountAuthHttp = import("./provider/openai-account-auth.js").OpenAIAccountAuthHttp
  export type CredentialDisk = typeof import("./provider/openai-account-auth.js").CredentialDisk
  export type OpenAIAccountCredentialStore = import("./provider/openai-account-auth.js").OpenAIAccountCredentialStore
  export type generatePkce = typeof import("./provider/openai-account-auth.js").generatePkce
  export type authorizationUrl = typeof import("./provider/openai-account-auth.js").authorizationUrl
  export type OpenAIAccountAuth = import("./provider/openai-account-auth.js").OpenAIAccountAuth
  export type layer = typeof import("./provider/openai-account-auth.js").layer
  export type layerHostTest = typeof import("./provider/openai-account-auth.js").layerHostTest
  export type layerPresenterTest = typeof import("./provider/openai-account-auth.js").layerPresenterTest
  export type layerHttpTest = typeof import("./provider/openai-account-auth.js").layerHttpTest
  export type layerStoreTest = typeof import("./provider/openai-account-auth.js").layerStoreTest
  export type AuthorizationResult = import("./provider/openai-account-auth.js").AuthorizationResult
  export type Credential = import("./provider/openai-account-auth.js").Credential
  export type DevicePrompt = import("./provider/openai-account-auth.js").DevicePrompt
  export type Error = import("./provider/openai-account-auth.js").Error
  export type HostService = import("./provider/openai-account-auth.js").HostService
  export type HttpService = import("./provider/openai-account-auth.js").HttpService
  export type PresenterService = import("./provider/openai-account-auth.js").PresenterService
  export type AuthService = import("./provider/openai-account-auth.js").AuthService
  export type Status = import("./provider/openai-account-auth.js").Status
  export type StoreService = import("./provider/openai-account-auth.js").StoreService
  export type TimingOptions = import("./provider/openai-account-auth.js").TimingOptions
}
import { layer as OpenAIAccountAuthHttp_layer } from "./provider/openai-account-auth-http.js"
export const OpenAIAccountAuthHttp = {
  layer: OpenAIAccountAuthHttp_layer,
}
export namespace OpenAIAccountAuthHttp {
  export type layer = typeof import("./provider/openai-account-auth-http.js").layer
}
import {
  decodeConfig as OpenAIChatCompletions_decodeConfig,
  toolJsonSchemaCompiler as OpenAIChatCompletions_toolJsonSchemaCompiler,
  layer as OpenAIChatCompletions_layer,
  layerConfig as OpenAIChatCompletions_layerConfig,
} from "./provider/openai-chat-completions.js"
export const OpenAIChatCompletions = {
  decodeConfig: OpenAIChatCompletions_decodeConfig,
  toolJsonSchemaCompiler: OpenAIChatCompletions_toolJsonSchemaCompiler,
  layer: OpenAIChatCompletions_layer,
  layerConfig: OpenAIChatCompletions_layerConfig,
}
export namespace OpenAIChatCompletions {
  export type decodeConfig = typeof import("./provider/openai-chat-completions.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai-chat-completions.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai-chat-completions.js").layer
  export type layerConfig = typeof import("./provider/openai-chat-completions.js").layerConfig
  export type Config = import("./provider/openai-chat-completions.js").Config
  export type ClientOptions = import("./provider/openai-chat-completions.js").ClientOptions
  export type Options = import("./provider/openai-chat-completions.js").Options
}
import {
  decodeConfig as OpenAIResponses_decodeConfig,
  toolJsonSchemaCompiler as OpenAIResponses_toolJsonSchemaCompiler,
  layer as OpenAIResponses_layer,
  layerConfig as OpenAIResponses_layerConfig,
} from "./provider/openai-responses.js"
export const OpenAIResponses = {
  decodeConfig: OpenAIResponses_decodeConfig,
  toolJsonSchemaCompiler: OpenAIResponses_toolJsonSchemaCompiler,
  layer: OpenAIResponses_layer,
  layerConfig: OpenAIResponses_layerConfig,
}
export namespace OpenAIResponses {
  export type decodeConfig = typeof import("./provider/openai-responses.js").decodeConfig
  export type toolJsonSchemaCompiler = typeof import("./provider/openai-responses.js").toolJsonSchemaCompiler
  export type layer = typeof import("./provider/openai-responses.js").layer
  export type layerConfig = typeof import("./provider/openai-responses.js").layerConfig
  export type ClientOptions = import("./provider/openai-responses.js").ClientOptions
  export type Options = import("./provider/openai-responses.js").Options
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
  export type ClientOptions = import("./provider/openrouter.js").ClientOptions
  export type Options = import("./provider/openrouter.js").Options
}
import {
  layerGroq as OpenAICompatible_layerGroq,
  layerMistral as OpenAICompatible_layerMistral,
  layerXai as OpenAICompatible_layerXai,
  layerDeepseek as OpenAICompatible_layerDeepseek,
  layerGoogleAiStudio as OpenAICompatible_layerGoogleAiStudio,
  layerAzureOpenAI as OpenAICompatible_layerAzureOpenAI,
  layerOllama as OpenAICompatible_layerOllama,
} from "./catalog/presets.js"
export const OpenAICompatible = {
  layerGroq: OpenAICompatible_layerGroq,
  layerMistral: OpenAICompatible_layerMistral,
  layerXai: OpenAICompatible_layerXai,
  layerDeepseek: OpenAICompatible_layerDeepseek,
  layerGoogleAiStudio: OpenAICompatible_layerGoogleAiStudio,
  layerAzureOpenAI: OpenAICompatible_layerAzureOpenAI,
  layerOllama: OpenAICompatible_layerOllama,
}
export namespace OpenAICompatible {
  export type layerGroq = typeof import("./catalog/presets.js").layerGroq
  export type layerMistral = typeof import("./catalog/presets.js").layerMistral
  export type layerXai = typeof import("./catalog/presets.js").layerXai
  export type layerDeepseek = typeof import("./catalog/presets.js").layerDeepseek
  export type layerGoogleAiStudio = typeof import("./catalog/presets.js").layerGoogleAiStudio
  export type layerAzureOpenAI = typeof import("./catalog/presets.js").layerAzureOpenAI
  export type layerOllama = typeof import("./catalog/presets.js").layerOllama
  export type AzureOptions = import("./catalog/presets.js").AzureOptions
  export type Options = import("./catalog/presets.js").Options
}
