import { describe, expect, it } from "@effect/vitest"
import { AiError } from "effect/unstable/ai"
import { ContextOverflow } from "generalist"

const nestedResponsesEvent = {
  type: "error",
  error: {
    type: "invalid_request_error",
    code: "context_length_exceeded",
    message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
    param: "input",
  },
  sequence_number: 2,
}

const decodeFailure = AiError.make({
  module: "OpenAiClient",
  method: "createResponseStream",
  reason: AiError.InvalidOutputError.make({
    description: `Invalid output: Missing key\n  at [0]["data"]["code"]\nExpected UnknownResponseStreamEvent, got ${JSON.stringify(nestedResponsesEvent)}\n  at [0]["data"]`,
  }),
})

describe("ContextOverflow public owner", () => {
  it("classifies a stream-decode failure that carries the provider overflow evidence", () => {
    expect(ContextOverflow.classify(decodeFailure)).toBe("context-overflow")
  })

  it("classifies raw error events with flat and nested codes", () => {
    expect(ContextOverflow.classify(nestedResponsesEvent)).toBe("context-overflow")
    expect(ContextOverflow.classify({ type: "error", code: "context_window_exceeded" })).toBe("context-overflow")
  })

  it("classifies provider phrasings across vendors", () => {
    const description = (text: string) =>
      AiError.make({
        module: "Client",
        method: "stream",
        reason: AiError.InvalidRequestError.make({ description: text }),
      })
    expect(ContextOverflow.classify(description("prompt is too long: 250000 tokens > 200000 maximum"))).toBe(
      "context-overflow",
    )
    expect(ContextOverflow.classify(description("Input is too long for requested model."))).toBe("context-overflow")
    expect(
      ContextOverflow.classify(description("The input token count exceeds the maximum number of tokens allowed")),
    ).toBe("context-overflow")
    expect(ContextOverflow.classify(description("This model's maximum context length is 128000 tokens"))).toBe(
      "context-overflow",
    )
  })

  it("classifies metadata error codes regardless of provider key", () => {
    const withMetadata = AiError.make({
      module: "Client",
      method: "stream",
      reason: AiError.UnknownError.make({
        metadata: { someProvider: { errorCode: "input_too_long", errorType: null, requestId: null } },
      }),
    })
    expect(ContextOverflow.classify(withMetadata)).toBe("context-overflow")
  })

  it("classifies overflow evidence wrapped in a cause chain", () => {
    const wrapped = {
      _tag: "SomeWrapper",
      message: "model call failed",
      cause: { message: "context_length_exceeded", name: "ProviderError" },
    }
    expect(ContextOverflow.classify(wrapped)).toBe("context-overflow")
  })

  it("stays conservative for non-overflow failures", () => {
    expect(ContextOverflow.classify(undefined)).toBe("other")
    expect(ContextOverflow.classify("network reset")).toBe("other")
    expect(
      ContextOverflow.classify(
        AiError.make({
          module: "Client",
          method: "stream",
          reason: AiError.InvalidRequestError.make({ description: "maximum output token length exceeded" }),
        }),
      ),
    ).toBe("other")
    expect(
      ContextOverflow.classify(
        AiError.make({
          module: "Client",
          method: "stream",
          reason: AiError.RateLimitError.make({
            metadata: {
              openai: {
                errorCode: "context_length_exceeded",
                errorType: "rate_limit_error",
                requestId: null,
                limit: null,
                remaining: null,
                resetRequests: null,
                resetTokens: null,
              },
            },
          }),
        }),
      ),
    ).toBe("other")
    expect(
      ContextOverflow.classify(
        AiError.make({
          module: "Client",
          method: "stream",
          reason: AiError.UnknownError.make({ description: "request body exceeds maximum allowed bytes" }),
        }),
      ),
    ).toBe("other")
  })
})
