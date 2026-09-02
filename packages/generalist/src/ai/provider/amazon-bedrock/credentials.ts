import { defaultProvider } from "@aws-sdk/credential-provider-node"
import type { AwsCredentialIdentity } from "@smithy/types"
import { Effect, Redacted, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"
export interface Credential {
  readonly accessKeyId: string
  readonly secretAccessKey: Redacted.Redacted<string>
  readonly sessionToken?: Redacted.Redacted<string>
  readonly expiration?: Date
  readonly generation: string
}

type CredentialBuilder = { -readonly [Key in keyof Credential]: Credential[Key] }
export class CredentialFailure extends ActionableTaggedError<CredentialFailure>()(
  "generalist/ai/AmazonBedrockCredentialFailure",
  {
    operation: Schema.Literals(["acquire", "refreshRejected"]),
    hint: errorHint("Check AWS credential configuration and permissions, then reacquire credentials."),
  },
) {}
export interface Credentials {
  readonly acquire: Effect.Effect<Credential, CredentialFailure>
  readonly refreshRejected: (generation: string) => Effect.Effect<Credential, CredentialFailure>
}

const fromIdentity = (identity: AwsCredentialIdentity, generation: string): Credential => {
  const credential: CredentialBuilder = {
    accessKeyId: identity.accessKeyId,
    secretAccessKey: Redacted.make(identity.secretAccessKey),
    generation,
  }
  if (identity.sessionToken !== undefined) credential.sessionToken = Redacted.make(identity.sessionToken)
  if (identity.expiration !== undefined) credential.expiration = identity.expiration
  return credential
}

const sameIdentity = (credential: Credential, identity: AwsCredentialIdentity): boolean =>
  credential.accessKeyId === identity.accessKeyId &&
  Redacted.value(credential.secretAccessKey) === identity.secretAccessKey &&
  (credential.sessionToken === undefined ? undefined : Redacted.value(credential.sessionToken)) ===
    identity.sessionToken &&
  credential.expiration?.getTime() === identity.expiration?.getTime()

/**
 * AWS SDK v3's Node default chain. It supports environment variables, shared
 * profiles (including SSO, roles, credential_process and CLI login), web
 * identity, ECS and EC2 instance metadata. Values are resolved for every call.
 */
export const defaultChain = (options?: Parameters<typeof defaultProvider>[0]): Credentials => {
  const provider = defaultProvider(options)
  let current: Credential | undefined
  let generation = 0
  const load = (operation: CredentialFailure["operation"], force = false) =>
    Effect.tryPromise({
      try: () =>
        provider(force ? { forceRefresh: true } : undefined).then((identity) => {
          if (!force && current !== undefined && sameIdentity(current, identity)) return current
          current = fromIdentity(identity, `credential-generation-${++generation}`)
          return current
        }),
      catch: () => CredentialFailure.make({ operation }),
    })
  return {
    acquire: Effect.suspend(() => load("acquire")),
    refreshRejected: (rejectedGeneration) =>
      Effect.suspend(() =>
        current !== undefined && current.generation !== rejectedGeneration
          ? Effect.succeed(current)
          : load("refreshRejected", true),
      ),
  }
}
