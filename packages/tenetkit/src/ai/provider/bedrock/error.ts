import { Function } from "effect"
import { AiError } from "effect/unstable/ai"
import type { ClientFailure } from "./client.js"

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

const reasonFromName = (
  failure: Failure,
  providerMetadata: ReturnType<typeof metadata>,
): AiError.AiErrorReason | undefined => {
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
  return undefined
}

const isTransient = (failure: Failure): boolean =>
  (failure.errorName !== undefined && transientNames.has(failure.errorName)) ||
  (failure.errorCode !== undefined && transientCodes.has(failure.errorCode)) ||
  failure.httpStatus === 408 ||
  failure.httpStatus === 424 ||
  (failure.httpStatus !== undefined && failure.httpStatus >= 500)

const reasonFromStatus = (failure: Failure, providerMetadata: ReturnType<typeof metadata>): AiError.AiErrorReason => {
  if (isTransient(failure)) {
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

const reason = (failure: Failure): AiError.AiErrorReason => {
  const providerMetadata = metadata(failure)
  return reasonFromName(failure, providerMetadata) ?? reasonFromStatus(failure, providerMetadata)
}

const failureFromClient = (failure: ClientFailure): Failure => {
  const base: Failure = { description: failure.description }
  const withName: Failure = failure.awsErrorName === undefined ? base : { ...base, errorName: failure.awsErrorName }
  const withCode: Failure =
    failure.awsErrorCode === undefined ? withName : { ...withName, errorCode: failure.awsErrorCode }
  const withStatus: Failure =
    failure.httpStatus === undefined ? withCode : { ...withCode, httpStatus: failure.httpStatus }
  return failure.requestId === undefined ? withStatus : { ...withStatus, requestId: failure.requestId }
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
  (method: string, failure: ClientFailure): AiError.AiError => bedrockFailure(method, failureFromClient(failure)),
)
