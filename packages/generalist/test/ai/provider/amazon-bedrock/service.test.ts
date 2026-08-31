import { describe, expect, it } from "@effect/vitest"
import {
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type ConverseStreamCommandOutput,
  type ConverseStreamOutput,
  InternalServerException,
  ModelStreamErrorException,
  ServiceUnavailableException,
  ThrottlingException,
  ValidationException,
} from "@aws-sdk/client-bedrock-runtime"
import type { HttpHandlerOptions, HttpRequest } from "@smithy/types"
import { ModelRegistry } from "generalist"
import {
  Client,
  ClientFailure,
  classifyFailure,
  decodeConfig,
  layerClient,
  layer,
  make,
  type Credential,
  type Credentials,
  type Service,
  type ClientOptions,
} from "generalist/ai/amazon-bedrock"
import { Deferred, Effect, Fiber, Layer, Redacted, Ref, Schema, Stream } from "effect"
import { AiError, Tool, Toolkit } from "effect/unstable/ai"

const output: ConverseCommandOutput = {
  output: {
    message: {
      role: "assistant",
      content: [
        { reasoningContent: { reasoningText: { text: "thinking", signature: "signed" } } },
        { text: "answer" },
        { toolUse: { toolUseId: "call-1", name: "lookup", input: { value: "x" } } },
      ],
    },
  },
  stopReason: "tool_use",
  usage: {
    inputTokens: 12,
    outputTokens: 4,
    totalTokens: 16,
    cacheReadInputTokens: 3,
    cacheWriteInputTokens: 2,
  },
  metrics: { latencyMs: 9 },
  trace: { promptRouter: { invokedModelId: "routed" } },
  additionalModelResponseFields: { field: true },
  $metadata: { requestId: "complete-request" },
}

const expectFileRequest = (request: ConverseCommandInput | undefined): void => {
  expect(request?.system).toEqual([{ text: "rules" }, { cachePoint: { type: "default" } }])
  expectFileMessages(request?.messages)
}

const expectFileMessages = (messages: ConverseCommandInput["messages"]): void => {
  expect(messages?.[0]?.content?.slice(0, 4)).toEqual([
    { text: "before" },
    { image: { format: "png", source: { bytes: new TextEncoder().encode("image") } } },
    { image: { format: "png", source: { bytes: new TextEncoder().encode("image") } } },
    { image: { format: "png", source: { bytes: new TextEncoder().encode("image") } } },
  ])
  expect(messages?.[0]?.content?.[4]).toMatchObject({ document: { format: "pdf", name: "report-pdf" } })
  expect(messages?.[0]?.content?.[5]).toEqual({ text: "after" })
  expect(messages?.[1]?.content).toEqual([{ text: "unsigned prior reasoning" }, { text: "prefill" }])
}

const iterable = (events: ReadonlyArray<ConverseStreamOutput>): AsyncIterable<ConverseStreamOutput> => ({
  [Symbol.asyncIterator]() {
    let index = 0
    return {
      next: () =>
        Promise.resolve(
          index < events.length
            ? { done: false as const, value: events[index++]! }
            : { done: true as const, value: undefined },
        ),
    }
  },
})

const credential = (generation: string): Credential => ({
  accessKeyId: "test-access-key",
  secretAccessKey: Redacted.make("test-secret-key"),
  sessionToken: Redacted.make("test-session-token"),
  generation,
})

const responseBody = JSON.stringify({
  output: { message: { role: "assistant", content: [{ text: "ok" }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  metrics: { latencyMs: 1 },
})

const httpResponse = (statusCode: number, body: string, headers: Record<string, string> = {}) => ({
  response: {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    body: new TextEncoder().encode(body),
  },
})

const runClient = <A, E>(options: ClientOptions, effect: Effect.Effect<A, E, Client>) =>
  Effect.scoped(Effect.flatMap(Layer.build(layerClient(options)), (context) => Effect.provide(effect, context)))

const authorization = (headers: Record<string, string> | undefined) =>
  Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "authorization")?.[1]

const fakeClient = (options?: {
  readonly output?: ConverseCommandOutput
  readonly events?: ReadonlyArray<ConverseStreamOutput>
  readonly requestId?: string
  readonly capture?: (input: ConverseCommandInput) => void
}): Service => ({
  converse: (input) =>
    Effect.sync(() => {
      options?.capture?.(input)
      return options?.output ?? output
    }),
  converseStream: (input) =>
    Effect.sync((): ConverseStreamCommandOutput => {
      options?.capture?.(input)
      return {
        stream: iterable(options?.events ?? []),
        $metadata: options?.requestId === undefined ? {} : { requestId: options.requestId },
      }
    }),
})

describe("Amazon Bedrock", () => {
  it.effect("decodes only canonical persisted adapter options", () =>
    Effect.gen(function* () {
      expect(
        yield* decodeConfig({
          maxTokens: 8_192,
          temperature: 0.2,
          stopSequences: ["stop"],
          additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: 2_048 } },
        }),
      ).toEqual({
        maxTokens: 8_192,
        temperature: 0.2,
        stopSequences: ["stop"],
        additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: 2_048 } },
      })
      const failures = yield* Effect.all([
        Effect.flip(decodeConfig({ max_output_tokens: 8_192 })),
        Effect.flip(decodeConfig({ max_tokens: 8_192 })),
        Effect.flip(decodeConfig({ output_config: { effort: "high" } })),
        Effect.flip(decodeConfig({ maxTokens: 0 })),
        Effect.flip(decodeConfig({ additionalModelRequestFields: { invalid: undefined } })),
        Effect.flip(decodeConfig({ performanceConfig: { latency: "fast" } })),
        Effect.flip(decodeConfig({ guardrailConfig: { guardrailIdentifier: "guardrail" } })),
      ])
      expect(failures.every(Schema.isSchemaError)).toBe(true)
    }),
  )

  it.effect("keeps the explicit public runtime surface", () =>
    Effect.gen(function* () {
      const module = yield* Effect.promise(() => import("generalist/ai/amazon-bedrock"))
      expect(Object.keys(module).toSorted()).toEqual([
        "Client",
        "ClientFailure",
        "CredentialFailure",
        "RecoveryFailure",
        "classifyFailure",
        "decodeConfig",
        "defaultChain",
        "isRecoverableCredentialFailure",
        "layer",
        "layerClient",
        "layerLanguageModel",
        "layerModel",
        "make",
        "toolJsonSchemaCompiler",
      ])
    }),
  )
  it.effect("maps complete text, tools, reasoning, usage, and provider metadata", () =>
    Effect.gen(function* () {
      const model = yield* make({ model: "profile/us.test" }).pipe(Effect.provideService(Client, fakeClient()))
      const lookup = Tool.make("lookup", {
        parameters: Schema.Struct({ value: Schema.String }),
        success: Schema.String,
      })
      const response = yield* model.generateText({
        prompt: "hello",
        toolkit: Toolkit.make(lookup),
        disableToolCallResolution: true,
      })

      expect(response.text).toBe("answer")
      expect(response.reasoningText).toBe("thinking")
      expect(response.toolCalls[0]).toMatchObject({ id: "call-1", name: "lookup", params: { value: "x" } })
      expect(response.finishReason).toBe("tool-calls")
      expect(response.usage.inputTokens).toMatchObject({ total: 12, uncached: 9, cacheRead: 3, cacheWrite: 2 })
      expect(response.usage.outputTokens.reasoning).toBeUndefined()
      const reasoning = response.content.find((part) => part.type === "reasoning")
      expect(reasoning?.metadata.amazonBedrock).toEqual({ signature: "signed" })
      const finish = response.content.find((part) => part.type === "finish")
      expect(finish?.metadata.amazonBedrock).toMatchObject({
        requestId: "complete-request",
        stopReason: "tool_use",
        totalTokens: 16,
        metrics: { latencyMs: 9 },
        additionalModelResponseFields: { field: true },
      })
    }),
  )

  it.effect("sends a raw dynamic tool JSON Schema instead of the permissive runtime schema", () => {
    let request: ConverseCommandInput | undefined
    const rawSchema = {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    } as const
    return Effect.gen(function* () {
      const model = yield* make({ model: "dynamic-tool-model" }).pipe(
        Effect.provideService(
          Client,
          fakeClient({
            output: {
              ...output,
              output: { message: { role: "assistant", content: [{ text: "ok" }] } },
              stopReason: "end_turn",
            },
            capture: (value) => (request = value),
          }),
        ),
      )
      const dynamic = Tool.dynamic("search", { parameters: rawSchema })
      yield* model.generateText({
        prompt: "search",
        toolkit: Toolkit.make(dynamic),
        disableToolCallResolution: true,
      })

      expect(request?.toolConfig?.tools?.[0]?.toolSpec?.inputSchema?.json).toEqual(rawSchema)
    })
  })

  it.effect("forces the schema tool for structured output and removes only thinking", () => {
    let request: ConverseCommandInput | undefined
    const structured: ConverseCommandOutput = {
      output: {
        message: {
          role: "assistant",
          content: [{ toolUse: { toolUseId: "json-1", name: "result", input: { value: "ok" } } }],
        },
      },
      stopReason: "tool_use",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      metrics: { latencyMs: 1 },
      $metadata: {},
    }
    return Effect.gen(function* () {
      const model = yield* make({
        model: "arn:aws:bedrock:region:account:inference-profile/test",
        config: { additionalModelRequestFields: { thinking: { type: "enabled" }, keep: true } },
      }).pipe(Effect.provideService(Client, fakeClient({ output: structured, capture: (value) => (request = value) })))
      const response = yield* model.generateObject({
        prompt: "extract",
        objectName: "result",
        schema: Schema.Struct({ value: Schema.String }),
      })

      expect(response.value).toEqual({ value: "ok" })
      expect(request?.toolConfig?.tools).toHaveLength(1)
      expect(request?.toolConfig?.toolChoice).toEqual({ tool: { name: "result" } })
      expect(request?.additionalModelRequestFields).toEqual({ keep: true })
    })
  })

  it.effect("maps system cache points, images, documents, and assistant prefill", () => {
    let request: ConverseCommandInput | undefined
    return Effect.gen(function* () {
      const model = yield* make({ model: "files-model" }).pipe(
        Effect.provideService(
          Client,
          fakeClient({
            output: {
              ...output,
              output: { message: { role: "assistant", content: [{ text: "ok" }] } },
              stopReason: "end_turn",
            },
            capture: (value) => (request = value),
          }),
        ),
      )
      yield* model.generateText({
        prompt: [
          { role: "system", content: "rules", options: { amazonBedrock: { cachePoint: true } } },
          {
            role: "user",
            content: [
              { type: "text", text: "before" },
              { type: "file", mediaType: "image/png", data: new TextEncoder().encode("image") },
              { type: "file", mediaType: "image/png", data: "aW1hZ2U=" },
              { type: "file", mediaType: "image/png", data: "data:image/png;base64,aW1hZ2U=" },
              { type: "file", mediaType: "application/pdf", fileName: "report.pdf", data: "ZG9j" },
              { type: "text", text: "after" },
            ],
          },
          {
            role: "assistant",
            content: [
              { type: "reasoning", text: "unsigned prior reasoning" },
              { type: "text", text: "prefill   " },
            ],
          },
        ],
      })

      expectFileRequest(request)
    })
  })

  it.effect("rejects invalid messages and unsupported image sources before transport", () =>
    Effect.gen(function* () {
      let requests = 0
      const model = yield* make({ model: "validation-model" }).pipe(
        Effect.provideService(Client, fakeClient({ capture: () => requests++ })),
      )
      const lateSystem = yield* model
        .generateText({
          prompt: [
            { role: "user", content: "hello" },
            { role: "system", content: "late" },
          ],
        })
        .pipe(Effect.flip)
      const urlFile = yield* model
        .generateText({
          prompt: [
            {
              role: "user",
              content: [{ type: "file", mediaType: "image/png", data: new URL("https://example.com/image.png") }],
            },
          ],
        })
        .pipe(Effect.flip)
      const malformedImage = yield* model
        .generateText({
          prompt: [
            {
              role: "user",
              content: [{ type: "file", mediaType: "image/png", data: "not base64" }],
            },
          ],
        })
        .pipe(Effect.flip)
      const unsupportedImage = yield* model
        .generateText({
          prompt: [
            {
              role: "user",
              content: [{ type: "file", mediaType: "image/svg+xml", data: new Uint8Array([1]) }],
            },
          ],
        })
        .pipe(Effect.flip)
      const assistantDocument = yield* model
        .generateText({
          prompt: [
            {
              role: "assistant",
              content: [{ type: "file", mediaType: "application/pdf", data: new Uint8Array([1]) }],
            },
          ],
        })
        .pipe(Effect.flip)

      expect(AiError.isAiError(lateSystem)).toBe(true)
      expect(AiError.isAiError(urlFile)).toBe(true)
      expect(AiError.isAiError(malformedImage)).toBe(true)
      expect(AiError.isAiError(unsupportedImage)).toBe(true)
      expect(AiError.isAiError(assistantDocument)).toBe(true)
      expect(requests).toBe(0)
    }),
  )

  it.effect("maps stream blocks and emits finish only after final metadata", () => {
    const events: ReadonlyArray<ConverseStreamOutput> = [
      { messageStart: { role: "assistant" } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "hel" } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "lo" } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { reasoningContent: { text: "why" } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { reasoningContent: { signature: "sig" } } } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { contentBlockStart: { contentBlockIndex: 2, start: { toolUse: { toolUseId: "tool-1", name: "lookup" } } } },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { toolUse: { input: '{"value":' } } } },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { toolUse: { input: '"x"}' } } } },
      { contentBlockStop: { contentBlockIndex: 2 } },
      { messageStop: { stopReason: "tool_use", additionalModelResponseFields: { stop: true } } },
      {
        metadata: {
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadInputTokens: 2 },
          metrics: { latencyMs: 12 },
          trace: { promptRouter: { invokedModelId: "routed" } },
        },
      },
    ]
    return Effect.gen(function* () {
      const model = yield* make({ model: "stream-model" }).pipe(
        Effect.provideService(Client, fakeClient({ events, requestId: "stream-request" })),
      )
      const lookup = Tool.make("lookup", {
        parameters: Schema.Struct({ value: Schema.String }),
        success: Schema.String,
      })
      const parts = yield* model
        .streamText({
          prompt: "hello",
          toolkit: Toolkit.make(lookup),
          disableToolCallResolution: true,
        })
        .pipe(Stream.runCollect)
      const values = Array.from(parts)

      expect(values.map((part) => part.type)).toEqual([
        "response-metadata",
        "text-start",
        "text-delta",
        "text-delta",
        "text-end",
        "reasoning-start",
        "reasoning-delta",
        "reasoning-delta",
        "reasoning-end",
        "tool-params-start",
        "tool-params-delta",
        "tool-params-delta",
        "tool-params-end",
        "tool-call",
        "finish",
      ])
      expect(values.find((part) => part.type === "tool-call")).toMatchObject({ params: { value: "x" } })
      const finish = values.at(-1)
      expect(finish).toMatchObject({
        type: "finish",
        reason: "tool-calls",
        usage: { inputTokens: { total: 10, cacheRead: 2 }, outputTokens: { total: 5 } },
        metadata: {
          amazonBedrock: {
            requestId: "stream-request",
            stopReason: "tool_use",
            totalTokens: 15,
            additionalModelResponseFields: { stop: true },
          },
        },
      })
    })
  })

  it.effect("fails every modeled stream exception with retry-aware AI semantics", () => {
    const failures: ReadonlyArray<readonly [ConverseStreamOutput, AiError.AiErrorReason["_tag"]]> = [
      [
        {
          internalServerException: new InternalServerException({
            message: "internal",
            $metadata: { requestId: "internal-request" },
          }),
        },
        "InternalProviderError",
      ],
      [
        {
          modelStreamErrorException: new ModelStreamErrorException({
            message: "stream",
            originalMessage: "upstream stream failed",
            originalStatusCode: 502,
            $metadata: {},
          }),
        },
        "InternalProviderError",
      ],
      [
        { serviceUnavailableException: new ServiceUnavailableException({ message: "unavailable", $metadata: {} }) },
        "InternalProviderError",
      ],
      [{ throttlingException: new ThrottlingException({ message: "slow down", $metadata: {} }) }, "RateLimitError"],
      [{ validationException: new ValidationException({ message: "invalid", $metadata: {} }) }, "InvalidRequestError"],
    ]
    return Effect.forEach(
      failures,
      ([event, expected]) =>
        Effect.gen(function* () {
          const model = yield* make({ model: "stream-model" }).pipe(
            Effect.provideService(
              Client,
              fakeClient({ events: [{ messageStart: { role: "assistant" } }, event], requestId: "initial-request" }),
            ),
          )
          const failure = yield* model.streamText({ prompt: "hello" }).pipe(Stream.runDrain, Effect.flip)
          expect(AiError.isAiError(failure)).toBe(true)
          if (AiError.isAiError(failure)) expect(failure.reason._tag).toBe(expected)
        }),
      { discard: true },
    )
  })

  it.effect("classifies Bedrock request failures with retry-aware AI semantics", () => {
    const failures: ReadonlyArray<readonly [ClientFailure, AiError.AiErrorReason["_tag"]]> = [
      [
        ClientFailure.make({
          operation: "converse",
          description: "denied",
          awsErrorName: "AccessDeniedException",
          requestId: "denied-request",
        }),
        "AuthenticationError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "credentials missing",
          awsErrorName: "CredentialProviderError",
        }),
        "AuthenticationError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "expired",
          awsErrorName: "ExpiredTokenException",
        }),
        "AuthenticationError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "throttled",
          awsErrorName: "ThrottlingException",
        }),
        "RateLimitError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "bad model",
          awsErrorName: "ResourceNotFoundException",
        }),
        "InvalidRequestError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "timed out",
          awsErrorName: "ModelTimeoutException",
        }),
        "InternalProviderError",
      ],
      [
        ClientFailure.make({ operation: "converse", description: "unavailable", httpStatus: 503 }),
        "InternalProviderError",
      ],
      [
        ClientFailure.make({
          operation: "converse",
          description: "DNS lookup failed",
          awsErrorName: "Error",
          awsErrorCode: "ENOTFOUND",
        }),
        "InternalProviderError",
      ],
    ]
    return Effect.forEach(
      failures,
      ([failure, expected]) =>
        Effect.gen(function* () {
          const client: Service = {
            ...fakeClient(),
            converse: () => Effect.fail(failure),
          }
          const model = yield* make({ model: "failure-model" }).pipe(Effect.provideService(Client, client))
          const actual = yield* model.generateText({ prompt: "hello" }).pipe(Effect.flip)
          expect(AiError.isAiError(actual)).toBe(true)
          if (AiError.isAiError(actual)) {
            expect(actual.reason._tag).toBe(expected)
            if (failure.requestId !== undefined) {
              expect("metadata" in actual.reason).toBe(true)
              if ("metadata" in actual.reason) {
                expect(actual.reason.metadata).toMatchObject({ amazonBedrock: { requestId: failure.requestId } })
              }
            }
          }
        }),
      { discard: true },
    )
  })

  it.effect("rejects malformed stream lifecycles instead of accepting partial output", () => {
    const metadata: ConverseStreamOutput = {
      metadata: {
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        metrics: { latencyMs: 1 },
      },
    }
    const invalid: ReadonlyArray<ReadonlyArray<ConverseStreamOutput>> = [
      [{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "early" } } }],
      [{ messageStart: { role: "assistant" } }, { messageStart: { role: "assistant" } }],
      [
        { messageStart: { role: "assistant" } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "first" } } },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { text: "interleaved" } } },
      ],
      [
        { messageStart: { role: "assistant" } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "first" } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "restarted" } } },
      ],
      [
        { messageStart: { role: "assistant" } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "open" } } },
        { messageStop: { stopReason: "end_turn" } },
      ],
      [
        { messageStart: { role: "assistant" } },
        { messageStop: { stopReason: "end_turn" } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "late" } } },
      ],
      [{ messageStart: { role: "assistant" } }, metadata],
      [
        { messageStart: { role: "assistant" } },
        { messageStop: { stopReason: "end_turn" } },
        metadata,
        { messageStart: { role: "assistant" } },
      ],
    ]
    return Effect.forEach(
      invalid,
      (events) =>
        Effect.gen(function* () {
          const model = yield* make({ model: "stream-model" }).pipe(
            Effect.provideService(Client, fakeClient({ events })),
          )
          const failure = yield* model.streamText({ prompt: "hello" }).pipe(Stream.runDrain, Effect.flip)
          expect(AiError.isAiError(failure)).toBe(true)
          if (AiError.isAiError(failure)) expect(failure.reason._tag).toBe("InvalidOutputError")
        }),
      { discard: true },
    )
  })

  it.effect("ignores future stream union members while preserving known lifecycle events", () => {
    const events: ReadonlyArray<ConverseStreamOutput> = [
      { $unknown: ["futureTopLevel", {}] },
      { messageStart: { role: "assistant" } },
      { contentBlockStart: { contentBlockIndex: 0, start: { $unknown: ["futureBlock", {}] } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { $unknown: ["futureDelta", {}] } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "end_turn" } },
      {
        metadata: {
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          metrics: { latencyMs: 1 },
        },
      },
    ]
    return Effect.gen(function* () {
      const model = yield* make({ model: "future-model" }).pipe(Effect.provideService(Client, fakeClient({ events })))
      const parts = yield* model.streamText({ prompt: "hello" }).pipe(Stream.runCollect)
      expect(Array.from(parts, (part) => part.type)).toEqual(["response-metadata", "finish"])
    })
  })

  it.effect("fails truncated streams and unsafe tool arguments as typed AI output errors", () =>
    Effect.gen(function* () {
      const truncated = yield* make({ model: "stream-model" }).pipe(
        Effect.provideService(
          Client,
          fakeClient({
            events: [{ messageStart: { role: "assistant" } }, { messageStop: { stopReason: "end_turn" } }],
          }),
        ),
      )
      const failure = yield* truncated.streamText({ prompt: "hello" }).pipe(Stream.runDrain, Effect.flip)
      expect(AiError.isAiError(failure)).toBe(true)
      if (AiError.isAiError(failure)) expect(failure.reason._tag).toBe("InvalidOutputError")
    }),
  )

  it.effect("constructs SigV4 and explicit bearer requests without exposing secrets", () => {
    const signedHeaders: Array<Record<string, string>> = []
    const handler: NonNullable<ClientOptions["requestHandler"]> = {
      handle: (request: HttpRequest) => {
        signedHeaders.push(request.headers)
        return Promise.resolve(httpResponse(200, responseBody))
      },
    }
    const input: ConverseCommandInput = { modelId: "test", messages: [{ role: "user", content: [{ text: "hi" }] }] }
    return Effect.gen(function* () {
      yield* runClient(
        {
          credentials: {
            acquire: Effect.succeed(credential("one")),
            refreshRejected: () => Effect.succeed(credential("two")),
          },
          requestHandler: handler,
        },
        Effect.flatMap(Client, (client) => client.converse(input)),
      )
      yield* runClient(
        {
          authMode: "bearer",
          bearerToken: Redacted.make("test-bedrock-token"),
          requestHandler: handler,
        },
        Effect.flatMap(Client, (client) => client.converse(input)),
      )

      expect(authorization(signedHeaders[0])).toMatch(/^AWS4-HMAC-SHA256 /)
      expect(signedHeaders[0]?.["x-amz-security-token"]).toBeDefined()
      expect(authorization(signedHeaders[1])).toMatch(/^Bearer /)
      expect(Object.values(signedHeaders[0] ?? {})).not.toContain("test-secret-key")
    })
  })

  it.effect("coalesces one eligible recovery and retries each rejected request once", () => {
    let requests = 0
    let refreshes = 0
    let recoveries = 0
    const handler: NonNullable<ClientOptions["requestHandler"]> = {
      handle: () => {
        requests++
        return Promise.resolve(
          requests <= 2
            ? httpResponse(403, JSON.stringify({ message: "expired" }), {
                "x-amzn-errortype": "ExpiredTokenException",
              })
            : httpResponse(200, responseBody),
        )
      },
    }
    const credentials: Credentials = {
      acquire: Effect.succeed(credential("rejected")),
      refreshRejected: () =>
        Effect.sync(() => {
          refreshes++
          return credential("refreshed")
        }),
    }
    const input: ConverseCommandInput = { modelId: "test", messages: [{ role: "user", content: [{ text: "hi" }] }] }
    return runClient(
      {
        credentials,
        recovery: {
          recover: () =>
            Effect.sync(() => {
              recoveries++
            }),
        },
        requestHandler: handler,
      },
      Effect.flatMap(Client, (client) =>
        Effect.all([client.converse(input), client.converse(input)], { concurrency: 2 }),
      ),
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(requests).toBe(4)
          expect(recoveries).toBe(1)
          expect(refreshes).toBe(1)
        }),
      ),
    )
  })

  it.effect("resolves credentials for each request and observes credential interruption", () => {
    let acquires = 0
    const handler: NonNullable<ClientOptions["requestHandler"]> = {
      handle: () => Promise.resolve(httpResponse(200, responseBody)),
    }
    const input: ConverseCommandInput = { modelId: "test", messages: [{ role: "user", content: [{ text: "hi" }] }] }
    return Effect.gen(function* () {
      yield* runClient(
        {
          credentials: {
            acquire: Effect.sync(() => credential(`request-${++acquires}`)),
            refreshRejected: () => Effect.succeed(credential("refresh")),
          },
          requestHandler: handler,
        },
        Effect.flatMap(Client, (client) => Effect.all([client.converse(input), client.converse(input)])),
      )
      expect(acquires).toBe(2)

      const interrupted = yield* Ref.make(false)
      const started = yield* Deferred.make<void>()
      yield* runClient(
        {
          credentials: {
            acquire: Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Ref.set(interrupted, true)),
            ),
            refreshRejected: () => Effect.succeed(credential("refresh")),
          },
          requestHandler: handler,
        },
        Effect.gen(function* () {
          const client = yield* Client
          const fiber = yield* Effect.forkChild(client.converse(input))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(fiber)
        }),
      )
      expect(yield* Ref.get(interrupted)).toBe(true)
    })
  })

  it.effect("aborts and destroys an in-flight client when the request is interrupted", () => {
    const started = Promise.withResolvers<void>()
    const pending = Promise.withResolvers<ReturnType<typeof httpResponse>>()
    let requestSignal: { readonly aborted: boolean } | undefined
    let destroys = 0
    const handler: NonNullable<ClientOptions["requestHandler"]> = {
      handle: (_request: HttpRequest, options?: HttpHandlerOptions) => {
        requestSignal = options?.abortSignal
        started.resolve()
        return pending.promise
      },
      destroy: () => {
        destroys++
      },
    }
    const input: ConverseCommandInput = { modelId: "test", messages: [{ role: "user", content: [{ text: "hi" }] }] }
    return Effect.gen(function* () {
      const fiber = yield* runClient(
        {
          authMode: "bearer",
          bearerToken: Redacted.make("test-bedrock-token"),
          requestHandler: handler,
        },
        Effect.flatMap(Client, (client) => client.converse(input)),
      ).pipe(Effect.forkChild)
      yield* Effect.promise(() => started.promise)
      yield* Fiber.interrupt(fiber)

      expect(requestSignal?.aborted).toBe(true)
      expect(destroys).toBe(1)
    })
  })

  it.effect("does not recover access denial or arbitrary forbidden responses", () => {
    let recoveries = 0
    const handler: NonNullable<ClientOptions["requestHandler"]> = {
      handle: () =>
        Promise.resolve(
          httpResponse(403, JSON.stringify({ message: "denied" }), {
            "x-amzn-errortype": "AccessDeniedException",
          }),
        ),
    }
    const input: ConverseCommandInput = { modelId: "test", messages: [{ role: "user", content: [{ text: "hi" }] }] }
    return runClient(
      {
        credentials: {
          acquire: Effect.succeed(credential("denied")),
          refreshRejected: () => Effect.succeed(credential("unexpected")),
        },
        recovery: {
          recover: () =>
            Effect.sync(() => {
              recoveries++
            }),
        },
        requestHandler: handler,
      },
      Effect.flatMap(Client, (client) => Effect.flip(client.converse(input))),
    ).pipe(
      Effect.tap((failure) =>
        Effect.sync(() => {
          expect(failure.awsErrorName).toBe("AccessDeniedException")
          expect(recoveries).toBe(0)
        }),
      ),
    )
  })

  it.effect("registers arbitrary IDs and classifies only narrow validation overflows", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(
          layer({
            model: "arn:aws:bedrock:us-east-1:123:inference-profile/test",
            registrationKey: "primary",
            metadata: { contextWindow: 200_000 },
            client: { client: fakeClient() },
          }),
        )
        const registrations = yield* ModelRegistry.registrations().pipe(Effect.provide(context))
        expect(registrations[0]).toMatchObject({
          provider: "amazon-bedrock",
          registrationKey: "primary",
          metadata: { contextWindow: 200_000 },
        })

        const overflow = AiError.AiError.make({
          module: "AmazonBedrock",
          method: "converse",
          reason: AiError.InvalidRequestError.make({ description: "input is too long for this model" }),
        })
        const denied = AiError.AiError.make({
          module: "AmazonBedrock",
          method: "converse",
          reason: AiError.InvalidRequestError.make({ description: "contextual grounding guardrail denied access" }),
        })
        expect(classifyFailure(overflow)).toBe("context-overflow")
        expect(classifyFailure(denied)).toBe("other")
        expect(
          classifyFailure(
            ClientFailure.make({
              operation: "converse",
              description: "forbidden",
              awsErrorName: "AccessDeniedException",
            }),
          ),
        ).toBe("other")
      }),
    ),
  )
})
