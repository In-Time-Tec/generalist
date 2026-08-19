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
import { Context, Effect, Layer, Redacted, Schema, Semaphore } from "effect"
import { defaultChain, type Credential, type Credentials } from "./amazon-bedrock-credentials.js"

/** @experimental */
export class ClientFailure extends Schema.TaggedError<ClientFailure>()("tenetkit/ai/AmazonBedrockClientFailure", {
  operation: Schema.Literals(["converse", "converseStream"]),
  description: Schema.String,
  awsErrorName: Schema.optional(Schema.String),
  httpStatus: Schema.optional(Schema.Finite),
}) {}

/** @experimental */
export class RecoveryFailure extends Schema.TaggedError<RecoveryFailure>()("tenetkit/ai/AmazonBedrockRecoveryFailure", {
  description: Schema.String,
}) {}

/** @experimental */
export interface Interface {
  readonly converse: (input: ConverseCommandInput) => Effect.Effect<ConverseCommandOutput, ClientFailure>
  readonly converseStream: (input: ConverseCommandInput) => Effect.Effect<ConverseStreamCommandOutput, ClientFailure>
}

/** @experimental */
export interface Recovery {
  readonly recover: (rejectedGeneration: string) => Effect.Effect<void, RecoveryFailure>
}

/** @experimental */
export class Client extends Context.Service<Client, Interface>()("tenetkit/ai/provider/amazon-bedrock-client/Client") {}

/** @experimental */
export interface Options {
  readonly region?: string
  readonly endpoint?: string
  readonly profile?: string
  readonly credentials?: Credentials
  readonly bearerToken?: Redacted.Redacted<string>
  readonly authMode?: "default" | "bearer"
  readonly client?: Interface
  readonly recovery?: Recovery
  readonly requestHandler?: BedrockRuntimeClientConfig["requestHandler"]
}

const recoverable = new Set(["ExpiredToken", "ExpiredTokenException", "UnrecognizedClientException"])

/** @experimental */
export const isRecoverableCredentialFailure = (failure: ClientFailure): boolean =>
  failure.awsErrorName !== undefined && recoverable.has(failure.awsErrorName)

const identity = (credential: Credential): AwsCredentialIdentity => ({
  accessKeyId: credential.accessKeyId,
  secretAccessKey: Redacted.value(credential.secretAccessKey),
  ...(credential.sessionToken === undefined ? {} : { sessionToken: Redacted.value(credential.sessionToken) }),
  ...(credential.expiration === undefined ? {} : { expiration: credential.expiration }),
})

const clientFailure = (operation: ClientFailure["operation"], cause: unknown) => {
  const value = cause instanceof Error ? cause : undefined
  const metadata =
    value !== undefined && "$metadata" in value && typeof value.$metadata === "object" && value.$metadata !== null
      ? value.$metadata
      : undefined
  const status =
    metadata !== undefined && "httpStatusCode" in metadata && typeof metadata.httpStatusCode === "number"
      ? metadata.httpStatusCode
      : undefined
  return ClientFailure.make({
    operation,
    description: value?.message ?? value?.name ?? "request failed",
    ...(value === undefined ? {} : { awsErrorName: value.name }),
    ...(status === undefined ? {} : { httpStatus: status }),
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
            iterator.next().then((result) => {
              if (result.done === true) client.destroy()
              return result
            }),
          return: (value?: unknown) => {
            client.destroy()
            return iterator.return?.(value) ?? Promise.resolve({ done: true as const, value })
          },
        }
      },
    },
  }
}

/** @experimental */
export const layerClient = (options: Options = {}) => {
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

      const makeClient = (credential?: Credential) =>
        new BedrockRuntimeClient({
          region: options.region ?? "us-east-1",
          ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
          ...(options.requestHandler === undefined ? {} : { requestHandler: options.requestHandler }),
          ...(credential === undefined ? {} : { credentials: identity(credential) }),
          ...(options.bearerToken === undefined
            ? {}
            : {
                token: () => Promise.resolve({ token: Redacted.value(options.bearerToken!) }),
              }),
          ...(options.authMode === "bearer" || options.bearerToken !== undefined
            ? { authSchemePreference: ["httpBearerAuth"] }
            : {}),
          maxAttempts: 1,
        })

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
                }),
              ),
            )
          }),
        )

      const sendOnce = <A>(
        operation: ClientFailure["operation"],
        command: ConverseCommand | ConverseStreamCommand,
        credential?: Credential,
      ) => {
        const client = makeClient(credential)
        return Effect.tryPromise({
          try: (signal) => client.send(command as ConverseCommand, { abortSignal: signal }) as Promise<A>,
          catch: (cause) => clientFailure(operation, cause),
        }).pipe(
          Effect.tapError(() => Effect.sync(() => client.destroy())),
          Effect.flatMap((output) =>
            operation === "converseStream"
              ? Effect.succeed(wrapStream(output as ConverseStreamCommandOutput, client) as A)
              : Effect.sync(() => {
                  client.destroy()
                  return output
                }),
          ),
        )
      }

      const send = <A>(
        operation: ClientFailure["operation"],
        makeCommand: () => ConverseCommand | ConverseStreamCommand,
      ): Effect.Effect<A, ClientFailure> => {
        if (managedCredentials === undefined) return sendOnce(operation, makeCommand())
        return managedCredentials.acquire.pipe(
          Effect.mapError(() => ClientFailure.make({ operation, description: "AWS credential resolution failed" })),
          Effect.flatMap((credential) =>
            sendOnce<A>(operation, makeCommand(), credential).pipe(
              Effect.catch((error) =>
                isRecoverableCredentialFailure(error)
                  ? refresh(managedCredentials, credential.generation).pipe(
                      Effect.mapError((refreshError) =>
                        ClientFailure.make({
                          operation,
                          description: refreshError.description,
                        }),
                      ),
                      Effect.flatMap((refreshed) => sendOnce<A>(operation, makeCommand(), refreshed)),
                    )
                  : Effect.fail(error),
              ),
            ),
          ),
        )
      }

      return Client.of({
        converse: (input) => send("converse", () => new ConverseCommand(input)),
        converseStream: (input) => send("converseStream", () => new ConverseStreamCommand(input)),
      })
    }),
  )
}
