import { OpenAiLanguageModel as OpenAILanguageModel } from "@effect/ai-openai"
import { Option, Schema } from "effect"
import { AiError } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, layerModelFailures } from "../model/failure.js"

export interface Options {
  readonly model: (string & {}) | OpenAILanguageModel.Model
  readonly config?: Config
}

export type Config = Omit<typeof OpenAILanguageModel.Config.Service, "model">

const serverFailureCodes = new Set([
  "internal_server_error",
  "server_error",
  "server_is_overloaded",
  "service_unavailable",
  "service_unavailable_error",
  "vector_store_timeout",
])
const rateLimitCodes = new Set(["rate_limit_error", "rate_limit_exceeded", "requests_limit_exceeded"])
const quotaCodes = new Set(["billing_hard_limit_reached", "insufficient_quota", "quota_exceeded"])
const authenticationCodes = new Set(["authentication_error", "invalid_api_key", "invalid_api_key_error"])
const permissionCodes = new Set(["insufficient_permissions", "permission_denied", "permission_error"])
const contentPolicyCodes = new Set(["content_filter", "content_policy_violation", "image_content_policy_violation"])
const invalidRequestCodes = new Set([
  "empty_image_file",
  "failed_to_download_image",
  "image_file_not_found",
  "image_file_too_large",
  "image_parse_error",
  "image_too_large",
  "image_too_small",
  "invalid_base64_image",
  "invalid_image",
  "invalid_image_format",
  "invalid_image_mode",
  "invalid_image_url",
  "invalid_prompt",
  "invalid_request_error",
  "unsupported_image_media_type",
])

const NullableString = Schema.NullOr(Schema.String)

export const ErrorPayload = Schema.Struct({
  code: Schema.optionalKey(NullableString),
  message: Schema.optionalKey(Schema.String),
  param: Schema.optionalKey(NullableString),
  type: Schema.optionalKey(NullableString),
})

export type ErrorPayload = typeof ErrorPayload.Type

const decodeError = Schema.decodeUnknownOption(ErrorPayload)

export const boundedDescription = (value: string | undefined, fallback: string): string =>
  value !== undefined && value.length > 0 ? value.slice(0, 2_048) : fallback

export const boundedMetadata = (value: string | null | undefined): string | null => value?.slice(0, 256) ?? null

const requestIdFrom = (metadata: FailureInput["metadata"]): string | null => {
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ requestId: Schema.optionalKey(Schema.String) }))(
    metadata.openai,
  )
  return Option.isSome(decoded) ? boundedMetadata(decoded.value.requestId) : null
}

const reasonForCode = (
  code: string,
  message: string,
  parameter: string | null,
  metadata: {
    readonly openai: {
      readonly errorCode: string
      readonly errorType: string | null
      readonly requestId: string | null
    }
  },
): AiError.AiErrorReason | undefined => {
  if (serverFailureCodes.has(code)) return AiError.InternalProviderError.make({ description: message, metadata })
  if (rateLimitCodes.has(code)) {
    return AiError.RateLimitError.make({
      metadata: {
        openai: { ...metadata.openai, limit: null, remaining: null, resetRequests: null, resetTokens: null },
      },
    })
  }
  if (quotaCodes.has(code)) return AiError.QuotaExhaustedError.make({ metadata })
  if (authenticationCodes.has(code)) return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata })
  if (permissionCodes.has(code)) {
    return AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata })
  }
  if (contentPolicyCodes.has(code)) return AiError.ContentPolicyError.make({ description: message, metadata })
  if (code === "context_length_exceeded" || invalidRequestCodes.has(code)) {
    return AiError.InvalidRequestError.make(
      parameter === null ? { description: message, metadata } : { description: message, parameter, metadata },
    )
  }
  return undefined
}

export const failureReason = ({
  error,
  requestId,
}: {
  readonly error: FailureInput["error"]
  readonly requestId: string | null
}): AiError.AiErrorReason => {
  const decoded = decodeError(error)
  const event: ErrorPayload = Option.isSome(decoded) ? decoded.value : {}
  const code = boundedMetadata(event.code)
  const message = boundedDescription(event.message, "OpenAI response failed")
  const parameter = boundedMetadata(event.param)
  const metadata = {
    openai: {
      errorCode: code,
      errorType: event.type === "error" ? null : boundedMetadata(event.type),
      requestId,
    },
  }
  if (code !== null) {
    const classifiedMetadata = { openai: { ...metadata.openai, errorCode: code } }
    return (
      reasonForCode(code, message, parameter, classifiedMetadata) ??
      AiError.UnknownError.make({ description: message, metadata: classifiedMetadata })
    )
  }
  return AiError.UnknownError.make({ description: message, metadata })
}

const resolveFailure = ({ error, metadata, method }: FailureInput): AiError.AiError =>
  AiError.isAiError(error)
    ? error
    : AiError.make({
        module: "OpenAILanguageModel",
        method,
        reason: failureReason({ error, requestId: requestIdFrom(metadata) }),
      })

export const layerLanguageModel = (input: Options) =>
  layerModelFailures(
    layerImageSources(
      OpenAILanguageModel.layer(
        input.config === undefined ? { model: input.model } : { model: input.model, config: input.config },
      ),
    ),
    resolveFailure,
  )
