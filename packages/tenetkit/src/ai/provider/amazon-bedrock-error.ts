import { Function } from "effect"
import { AiError } from "effect/unstable/ai"
import type { ClientFailure } from "./amazon-bedrock-client.js"

interface Failure {
  readonly description: string
  readonly errorName?: string
  readonly errorCode?: string
  readonly httpStatus?: number
  readonly requestId?: string
}

const transientNames = new Set([
  "InternalServerException",
  "ModelErrorException",
  "ModelStreamErrorException",
  "ModelTimeoutException",
  "NetworkingError",
  "ServiceUnavailableException",
  "TimeoutError",
])

const transientCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
])

const metadata = (failure: Failure) => ({
  amazonBedrock: {
    errorName: failure.errorName ?? null,
    errorCode: failure.errorCode ?? null,
    httpStatus: failure.httpStatus ?? null,
    requestId: failure.requestId ?? null,
  },
})

const reason = (failure: Failure): AiError.AiErrorReason => {
  const providerMetadata = metadata(failure)
  if (failure.errorName === "ThrottlingException" || failure.errorName === "ModelNotReadyException") {
    return AiError.RateLimitError.make({ metadata: providerMetadata })
  }
  if (failure.errorName === "AccessDeniedException") {
    return AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata: providerMetadata })
  }
  if (failure.errorName === "ExpiredToken" || failure.errorName === "ExpiredTokenException") {
    return AiError.AuthenticationError.make({ kind: "ExpiredKey", metadata: providerMetadata })
  }
  if (failure.errorName === "UnrecognizedClientException") {
    return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata: providerMetadata })
  }
  if (failure.errorName === "CredentialProviderError") {
    return AiError.AuthenticationError.make({ kind: "MissingKey", metadata: providerMetadata })
  }
  if (failure.errorName === "ValidationException" || failure.errorName === "ResourceNotFoundException") {
    return AiError.InvalidRequestError.make({ description: failure.description, metadata: providerMetadata })
  }
  if (
    (failure.errorName !== undefined && transientNames.has(failure.errorName)) ||
    (failure.errorCode !== undefined && transientCodes.has(failure.errorCode)) ||
    failure.httpStatus === 408 ||
    failure.httpStatus === 424 ||
    (failure.httpStatus !== undefined && failure.httpStatus >= 500)
  ) {
    return AiError.InternalProviderError.make({ description: failure.description, metadata: providerMetadata })
  }
  if (failure.httpStatus === 429) return AiError.RateLimitError.make({ metadata: providerMetadata })
  if (failure.httpStatus === 401) {
    return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata: providerMetadata })
  }
  if (failure.httpStatus === 403) {
    return AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata: providerMetadata })
  }
  if (failure.httpStatus === 400 || failure.httpStatus === 404) {
    return AiError.InvalidRequestError.make({ description: failure.description, metadata: providerMetadata })
  }
  return AiError.UnknownError.make({ description: failure.description, metadata: providerMetadata })
}

/** @internal */
export const bedrockFailure: {
  (failure: Failure): (method: string) => AiError.AiError
  (method: string, failure: Failure): AiError.AiError
} = Function.dual(
  2,
  (method: string, failure: Failure): AiError.AiError =>
    AiError.make({ module: "AmazonBedrock", method, reason: reason(failure) }),
)

/** @internal */
export const clientFailure: {
  (failure: ClientFailure): (method: string) => AiError.AiError
  (method: string, failure: ClientFailure): AiError.AiError
} = Function.dual(
  2,
  (method: string, failure: ClientFailure): AiError.AiError =>
    bedrockFailure(method, {
      description: failure.description,
      ...(failure.awsErrorName === undefined ? {} : { errorName: failure.awsErrorName }),
      ...(failure.awsErrorCode === undefined ? {} : { errorCode: failure.awsErrorCode }),
      ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
      ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
    }),
)
