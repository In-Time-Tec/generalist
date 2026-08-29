import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type ConverseStreamCommandOutput,
  type BedrockRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-runtime"
import type { AwsCredentialIdentity } from "@smithy/types"
import { Context, Effect, Layer, Option, Redacted, Schema, Semaphore } from "effect"
import { defaultChain, type Credential, type Credentials } from "./credentials.js"

/** @experimental */
export class ClientFailure extends Schema.TaggedError<ClientFailure>()("tenetkit/ai/AmazonBedrockClientFailure", {
  operation: Schema.Literals(["converse", "converseStream"]),
  description: Schema.String,
  awsErrorName: Schema.optional(Schema.String),
  awsErrorCode: Schema.optional(Schema.String),
  httpStatus: Schema.optional(Schema.Finite),
  requestId: Schema.optional(Schema.String),
}) {}

/** @experimental */
export class RecoveryFailure extends Schema.TaggedError<RecoveryFailure>()("tenetkit/ai/AmazonBedrockRecoveryFailure", {
  description: Schema.String,
}) {}

/** @experimental */
export interface Service {
  readonly converse: (input: ConverseCommandInput) => Effect.Effect<ConverseCommandOutput, ClientFailure>
  readonly converseStream: (input: ConverseCommandInput) => Effect.Effect<ConverseStreamCommandOutput, ClientFailure>
}

/** @experimental */
export interface Recovery {
  readonly recover: (rejectedGeneration: string) => Effect.Effect<void, RecoveryFailure>
}

/** @experimental */
export class Client extends Context.Service<Client, Service>()("tenetkit/ai/provider/bedrock/client") {}

/** @experimental */
export interface ClientOptions {
  readonly region?: string
  readonly endpoint?: string
  readonly profile?: string
  readonly credentials?: Credentials
  readonly bearerToken?: Redacted.Redacted<string>
  readonly authMode?: "default" | "bearer"
  readonly client?: Service
  readonly recovery?: Recovery
  readonly requestHandler?: BedrockRuntimeClientConfig["requestHandler"]
}

const recoverable = new Set(["ExpiredToken", "ExpiredTokenException", "UnrecognizedClientException"])
const awsMetadata = Schema.Struct({
  httpStatusCode: Schema.optionalKey(Schema.Finite),
  requestId: Schema.optionalKey(Schema.String),
})

/** @experimental */
export const isRecoverableCredentialFailure = (failure: ClientFailure): boolean =>
  failure.awsErrorName !== undefined && recoverable.has(failure.awsErrorName)

const identity = (credential: Credential): AwsCredentialIdentity => {
  const required = {
    accessKeyId: credential.accessKeyId,
    secretAccessKey: Redacted.value(credential.secretAccessKey),
  }
  if (credential.sessionToken === undefined) {
    return credential.expiration === undefined ? required : { ...required, expiration: credential.expiration }
  }
  const withToken = { ...required, sessionToken: Redacted.value(credential.sessionToken) }
  return credential.expiration === undefined ? withToken : { ...withToken, expiration: credential.expiration }
}

const clientFailure = (operation: ClientFailure["operation"], cause: unknown) => {
  const value = cause instanceof Error ? cause : undefined
  const metadata =
    value !== undefined && "$metadata" in value
      ? Option.getOrUndefined(Schema.decodeUnknownOption(awsMetadata)(value.$metadata))
      : undefined
  const code =
    value !== undefined && "code" in value
      ? Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(value.code))?.slice(0, 256)
      : undefined
  return ClientFailure.make({
    operation,
    description: (value?.message ?? value?.name ?? "request failed").slice(0, 2_048),
    awsErrorName: value?.name,
    awsErrorCode: code,
    httpStatus: metadata?.httpStatusCode,
    requestId: metadata?.requestId?.slice(0, 256),
  })
}

const wrapStream = (output: ConverseStreamCommandOutput, client: BedrockRuntimeClient): ConverseStreamCommandOutput => {
  if (output.stream === undefined) {
    client.destroy()
    return output
  }
  const source = output.stream
  return {
    ...output,
    stream: {
      [Symbol.asyncIterator]() {
        const iterator = source[Symbol.asyncIterator]()
        return {
          next: () =>
            iterator.next().then(
              (result) => {
                if (result.done === true) client.destroy()
                return result
              },
              (error) => {
                client.destroy()
                throw error
              },
            ),
          return: () => {
            client.destroy()
            return iterator.return?.() ?? Promise.resolve({ done: true as const, value: undefined })
          },
        }
      },
    },
  }
}

/** @experimental */
export const layerClient = (options: ClientOptions = {}) => {
  if (options.client !== undefined) return Layer.succeed(Client, options.client)
  return Layer.effect(
    Client,
    Effect.gen(function* () {
      const recoveryLock = yield* Semaphore.make(1)
      const recovered = new Map<string, Credential>()
      const managedCredentials =
        options.authMode === "bearer" || options.bearerToken !== undefined
          ? undefined
          : (options.credentials ??
            (options.authMode === "default" || options.recovery !== undefined || options.profile !== undefined
              ? defaultChain(options.profile === undefined ? undefined : { profile: options.profile })
              : undefined))

      const makeClient = (credential?: Credential) => {
        const config: BedrockRuntimeClientConfig = {
          region: options.region ?? "us-east-1",
          maxAttempts: 1,
        }
        if (options.endpoint !== undefined) config.endpoint = options.endpoint
        if (options.requestHandler !== undefined) config.requestHandler = options.requestHandler
        if (credential !== undefined) config.credentials = identity(credential)
        if (options.bearerToken !== undefined) {
          const bearerToken = options.bearerToken
          config.token = () => Promise.resolve({ token: Redacted.value(bearerToken) })
        }
        if (options.authMode === "bearer" || options.bearerToken !== undefined) {
          config.authSchemePreference = ["httpBearerAuth"]
        }
        return new BedrockRuntimeClient(config)
      }

      const refresh = (credentials: Credentials, generation: string) =>
        recoveryLock.withPermit(
          Effect.suspend(() => {
            const current = recovered.get(generation)
            if (current !== undefined) return Effect.succeed(current)
            return (options.recovery?.recover(generation) ?? Effect.void).pipe(
              Effect.flatMap(() => credentials.refreshRejected(generation)),
              Effect.tap((credential) => Effect.sync(() => recovered.set(generation, credential))),
              Effect.mapError(() =>
                ClientFailure.make({
                  operation: "converse",
                  description: "AWS credential recovery failed",
                  awsErrorName: "CredentialProviderError",
                }),
              ),
            )
          }),
        )

      const sendConverse = (command: ConverseCommand, credential?: Credential) => {
        const client = makeClient(credential)
        return Effect.tryPromise({
          try: (signal) => client.send(command, { abortSignal: signal }),
          catch: (cause) => clientFailure("converse", cause),
        }).pipe(Effect.ensuring(Effect.sync(() => client.destroy())))
      }

      const sendStream = (command: ConverseStreamCommand, credential?: Credential) => {
        const client = makeClient(credential)
        let streamOwnsClient = false
        return Effect.tryPromise({
          try: (signal) => client.send(command, { abortSignal: signal }),
          catch: (cause) => clientFailure("converseStream", cause),
        }).pipe(
          Effect.map((output) => {
            streamOwnsClient = output.stream !== undefined
            return wrapStream(output, client)
          }),
          Effect.ensuring(
            Effect.sync(() => {
              if (!streamOwnsClient) client.destroy()
            }),
          ),
        )
      }

      const send = <A>(
        operation: ClientFailure["operation"],
        sendOnce: (credential?: Credential) => Effect.Effect<A, ClientFailure>,
      ): Effect.Effect<A, ClientFailure> => {
        if (managedCredentials === undefined) return sendOnce()
        return managedCredentials.acquire.pipe(
          Effect.mapError(() =>
            ClientFailure.make({
              operation,
              description: "AWS credential resolution failed",
              awsErrorName: "CredentialProviderError",
            }),
          ),
          Effect.flatMap((credential) =>
            sendOnce(credential).pipe(
              Effect.catch((error) =>
                isRecoverableCredentialFailure(error)
                  ? refresh(managedCredentials, credential.generation).pipe(
                      Effect.mapError((refreshError) =>
                        ClientFailure.make({
                          operation,
                          description: refreshError.description,
                          awsErrorName: refreshError.awsErrorName,
                          awsErrorCode: refreshError.awsErrorCode,
                          httpStatus: refreshError.httpStatus,
                          requestId: refreshError.requestId,
                        }),
                      ),
                      Effect.flatMap((refreshed) => sendOnce(refreshed)),
                    )
                  : Effect.fail(error),
              ),
            ),
          ),
        )
      }

      return Client.of({
        converse: (input) => send("converse", (credential) => sendConverse(new ConverseCommand(input), credential)),
        converseStream: (input) =>
          send("converseStream", (credential) => sendStream(new ConverseStreamCommand(input), credential)),
      })
    }),
  )
}
