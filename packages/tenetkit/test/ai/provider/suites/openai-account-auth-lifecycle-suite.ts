import { describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Crypto,
  Effect,
  Encoding,
  Exit,
  Fiber,
  Function,
  Latch,
  Layer,
  Option,
  Redacted,
  Schema,
  Scope,
  Semaphore,
} from "effect"
import { TestClock } from "effect/testing"
import {
  AuthError,
  credentialFormatVersion,
  deviceExchangeRedirect,
  deviceVerificationUrl,
  OpenAIAccountAuth,
  BrowserAuthorization,
  OAuthClient,
  CredentialStore,
  DeviceAuthorizationPresenter,
  StoreError,
  layer,
} from "../../../../src/ai/provider/openai-account-auth.js"

const digest = (_algorithm: string, data: Uint8Array) =>
  Effect.promise(() => globalThis.crypto.subtle.digest("SHA-256", data.slice()).then((x) => new Uint8Array(x)))
const deterministicCrypto = () => {
  let next = 0
  return Layer.succeed(
    Crypto.Crypto,
    Crypto.make({ randomBytes: (n) => Uint8Array.from({ length: n }, () => next++ & 255), digest }),
  )
}
const jwt = (account = "account-secret", user = "user-secret", exp = 2_000_000_000) =>
  `header.${Encoding.encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ exp, "https://api.openai.com/auth": { chatgpt_account_id: account, chatgpt_user_id: user } }),
    ),
  )}.signature`
const expiryJwt = (exp: number) =>
  `header.${Encoding.encodeBase64Url(new TextEncoder().encode(JSON.stringify({ exp })))}.signature`
const tokens = (account?: string, user?: string) => ({
  access_token: jwt(account, user),
  id_token: jwt(account, user),
  refresh_token: "refresh-secret",
  expires_in: 3600,
})
type Disk = Schema.Schema.Type<typeof import("../../../../src/ai/provider/openai-account-auth.js").CredentialDisk>
const fingerprint = (account = "account-secret", user = "user-secret") =>
  account === "account-secret" && user === "user-secret"
    ? "-tORTwymPrvcfDjuXFED-owRjtjXqgQTMZE3uLEz620"
    : "MCLlOcDYt7mY2jAKStiDz0r11P54VeCNOPMuxoxR8Zk"
const disk = (overrides: Partial<Disk> = {}): Disk => ({
  formatVersion: credentialFormatVersion,
  accessToken: jwt(),
  idToken: jwt(),
  refreshToken: "refresh-secret",
  accountId: "account-secret",
  fingerprint: fingerprint(),
  generation: `${fingerprint()}.generation-1`,
  expiresAt: 2_000_000_000_000,
  refreshedAt: 1,
  ...overrides,
})
const memoryStore = (initial: Option.Option<Disk> = Option.none()) => {
  let value = initial
  let serialized = 0
  return {
    layer: Layer.effect(
      CredentialStore,
      Effect.gen(function* () {
        const semaphore = yield* Semaphore.make(1)
        return CredentialStore.of({
          load: Effect.sync(() => value),
          save: (next) => Effect.sync(() => void (value = Option.some(next))),
          remove: Effect.sync(() => {
            const result = Option.isSome(value)
            value = Option.none()
            return result
          }),
          serialized: (effect) =>
            semaphore.withPermits(1)(Effect.sync(() => serialized++).pipe(Effect.andThen(effect))),
        })
      }),
    ),
    value: () => value,
    serialized: () => serialized,
  }
}
const unusedHttp = OAuthClient.of({
  exchange: () => Effect.die("unused"),
  refresh: () => Effect.die("unused"),
  deviceStart: Effect.die("unused"),
  devicePoll: () => Effect.die("unused"),
})
const dependencies = (
  store: Layer.Layer<CredentialStore>,
  http = unusedHttp,
  host: BrowserAuthorization["Service"] = BrowserAuthorization.of({ authorize: () => Effect.die("unused") }),
  presenter: DeviceAuthorizationPresenter["Service"] = DeviceAuthorizationPresenter.of({
    device: () => Effect.void,
  }),
  deviceTimeout = 5_000,
) =>
  layer({ deviceTimeout }).pipe(
    Layer.provide(
      Layer.mergeAll(
        store,
        deterministicCrypto(),
        Layer.succeed(OAuthClient, http),
        Layer.succeed(BrowserAuthorization, host),
        Layer.succeed(DeviceAuthorizationPresenter, presenter),
      ),
    ),
  )
const provideLayer: {
  <O, OE, IR>(
    provided: Layer.Layer<O, OE, IR>,
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | OE, Scope.Scope | IR | Exclude<R, O>>
  <A, E, R, O, OE, IR>(
    effect: Effect.Effect<A, E, R>,
    provided: Layer.Layer<O, OE, IR>,
  ): Effect.Effect<A, E | OE, Scope.Scope | IR | Exclude<R, O>>
} = Function.dual(2, <A, E, R, O, OE, IR>(effect: Effect.Effect<A, E, R>, provided: Layer.Layer<O, OE, IR>) =>
  Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context)))),
)
const challenge = (verifier: string) =>
  Effect.promise(() =>
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(verifier))
      .then((x) => Encoding.encodeBase64Url(new Uint8Array(x))),
  )

describe("OpenAI account authentication lifecycle", () => {
  it.effect("persists browser tokens, returns redacted credentials, and blocks mismatched callback state", () => {
    const store = memoryStore()
    let exchanges = 0
    const successHost = BrowserAuthorization.of({
      authorize: (_url, state) => Effect.succeed({ code: Redacted.make("code-secret"), state }),
    })
    const http = OAuthClient.of({
      ...unusedHttp,
      exchange: () =>
        Effect.sync(() => {
          exchanges++
          return tokens()
        }),
    })
    return Effect.gen(function* () {
      const credential = yield* (yield* OpenAIAccountAuth).loginBrowser()
      const saved = Option.getOrThrow(store.value())
      expect(saved.accessToken).toBe(jwt())
      expect(credential.generation).toBe(saved.generation)
      const encodedCredential = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(credential)
      expect(encodedCredential).not.toMatch(/refresh-secret|account-secret/)
      const mismatch = BrowserAuthorization.of({
        authorize: () => Effect.succeed({ code: Redacted.make("code-secret"), state: Redacted.make("wrong-secret") }),
      })
      const error = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginBrowser()
        }).pipe(provideLayer(dependencies(memoryStore().layer, http, mismatch))),
      )
      expect(error.kind).toBe("protocol")
      expect(exchanges).toBe(1)
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toMatch(
        /wrong-secret|code-secret|account-secret/,
      )
    }).pipe(provideLayer(dependencies(store.layer, http, successHost)))
  })

  it.effect("preserves host cancellation and timeout as typed failures", () =>
    Effect.gen(function* () {
      for (const kind of ["cancelled", "timeout"] as const) {
        const host = BrowserAuthorization.of({
          authorize: () => Effect.fail(AuthError.make({ kind, message: `safe ${kind}` })),
        })
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            return yield* (yield* OpenAIAccountAuth).loginBrowser()
          }).pipe(provideLayer(dependencies(memoryStore().layer, unusedHttp, host))),
        )
        expect(error).toMatchObject({ kind, message: `safe ${kind}` })
      }
    }),
  )

  it.effect("presents device warning, polls pending, validates PKCE, and uses the device redirect", () => {
    let polls = 0
    let prompt: unknown
    let redirect = ""
    const verifier = "verifier-secret"
    return Effect.gen(function* () {
      const codeChallenge = yield* challenge(verifier)
      const http = OAuthClient.of({
        ...unusedHttp,
        deviceStart: Effect.succeed({ device_auth_id: "device-secret", user_code: "ABCD", interval: "1" }),
        devicePoll: () =>
          Effect.sync(() =>
            ++polls < 3
              ? Option.none()
              : Option.some({
                  authorization_code: "code-secret",
                  code_challenge: codeChallenge,
                  code_verifier: verifier,
                }),
          ),
        exchange: (input) =>
          Effect.sync(() => {
            redirect = input.redirectUri
            return tokens()
          }),
      })
      const presenter = DeviceAuthorizationPresenter.of({
        device: (value) => Effect.sync(() => void (prompt = value)),
      })
      const fiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, http, undefined, presenter))),
      )
      yield* TestClock.adjust("3 seconds")
      yield* Fiber.join(fiber)
      expect(prompt).toEqual({
        verificationUrl: deviceVerificationUrl,
        userCode: "ABCD",
        warning:
          "Continue only if you started this OpenAI login. If a website or another person gave you this code, cancel.",
      })
      expect(polls).toBe(3)
      expect(redirect).toBe(deviceExchangeRedirect)
    })
  })

  it.effect("rejects invalid device intervals and verifier/challenge mismatches", () =>
    Effect.gen(function* () {
      for (const interval of ["0", "-1", "wat", "1.5", "9007199254740992"]) {
        const http = OAuthClient.of({
          ...unusedHttp,
          deviceStart: Effect.succeed({ device_auth_id: "id", user_code: "code", interval }),
        })
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            return yield* (yield* OpenAIAccountAuth).loginDevice
          }).pipe(provideLayer(dependencies(memoryStore().layer, http))),
        )
        expect(error.kind).toBe("protocol")
      }
      let exchanges = 0
      const mismatch = OAuthClient.of({
        ...unusedHttp,
        deviceStart: Effect.succeed({ device_auth_id: "id", user_code: "code", interval: "1" }),
        devicePoll: () =>
          Effect.succeed(
            Option.some({ authorization_code: "secret", code_challenge: "wrong", code_verifier: "verifier-secret" }),
          ),
        exchange: () =>
          Effect.sync(() => {
            exchanges++
            return tokens()
          }),
      })
      const fiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, mismatch))),
      )
      yield* TestClock.adjust("1 second")
      expect((yield* Effect.flip(Fiber.join(fiber))).kind).toBe("protocol")
      expect(exchanges).toBe(0)
    }),
  )

  it.effect("enforces a valid total device deadline even when the polling interval is longer", () => {
    let starts = 0
    let polls = 0
    const longInterval = OAuthClient.of({
      ...unusedHttp,
      deviceStart: Effect.sync(() => {
        starts++
        return { device_auth_id: "id", user_code: "code", interval: "60" }
      }),
      devicePoll: () =>
        Effect.sync(() => {
          polls++
          return Option.none()
        }),
    })
    return Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, longInterval))),
      )
      yield* TestClock.adjust("5 seconds")
      expect((yield* Effect.flip(Fiber.join(fiber))).kind).toBe("timeout")
      expect(starts).toBe(1)
      expect(polls).toBe(0)

      const invalid = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, longInterval, undefined, undefined, 0))),
      )
      expect(invalid.kind).toBe("protocol")
      expect(starts).toBe(1)
    })
  })

  it.effect("times device polling out, remains interruptible, and cannot exchange a late poll", () => {
    let exchanges = 0
    const pending = OAuthClient.of({
      ...unusedHttp,
      deviceStart: Effect.succeed({ device_auth_id: "id", user_code: "code", interval: "1" }),
      devicePoll: () => Effect.succeed(Option.none()),
    })
    return Effect.gen(function* () {
      const timed = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, pending))),
      )
      yield* TestClock.adjust("5 seconds")
      expect((yield* Effect.flip(Fiber.join(timed))).kind).toBe("timeout")
      const interrupted = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, pending))),
      )
      yield* Fiber.interrupt(interrupted)
      const exit = yield* Fiber.await(interrupted)
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      const verifier = "verifier"
      const late = OAuthClient.of({
        ...pending,
        devicePoll: () =>
          Effect.sleep("5 seconds").pipe(
            Effect.andThen(challenge(verifier)),
            Effect.map((code_challenge) =>
              Option.some({ authorization_code: "code", code_challenge, code_verifier: verifier }),
            ),
          ),
        exchange: () =>
          Effect.sync(() => {
            exchanges++
            return tokens()
          }),
      })
      const lateFiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginDevice
        }).pipe(provideLayer(dependencies(memoryStore().layer, late))),
      )
      yield* TestClock.adjust("6 seconds")
      expect((yield* Effect.flip(Fiber.join(lateFiber))).kind).toBe("timeout")
      expect(exchanges).toBe(0)
    })
  })

  it.effect("reports every status and preserves unsafe store failures", () => {
    const status = (load: CredentialStore["Service"]["load"]) =>
      Effect.gen(function* () {
        return yield* (yield* OpenAIAccountAuth).status
      }).pipe(
        provideLayer(
          dependencies(
            Layer.succeed(
              CredentialStore,
              CredentialStore.of({
                load,
                save: () => Effect.void,
                remove: Effect.succeed(false),
                serialized: (x) => x,
              }),
            ),
          ),
        ),
      )
    return Effect.gen(function* () {
      expect((yield* status(Effect.succeed(Option.none())))._tag).toBe("Unauthenticated")
      expect((yield* status(Effect.succeed(Option.some(disk({ expiresAt: Number.MAX_SAFE_INTEGER })))))._tag).toBe(
        "Present",
      )
      expect((yield* status(Effect.succeed(Option.some(disk({ expiresAt: 0 })))))._tag).toBe("RefreshRequired")
      expect((yield* status(Effect.fail(StoreError.make({ kind: "corrupt", message: "safe" }))))._tag).toBe("Corrupt")
      const unsafe = yield* Effect.flip(status(Effect.fail(StoreError.make({ kind: "unsafe", message: "safe" }))))
      expect(Schema.is(StoreError)(unsafe)).toBe(true)
      expect(unsafe.kind).toBe("unsafe")
    })
  })

  it.effect("serializes logout and explicitly declares no revocation", () => {
    const store = memoryStore(Option.some(disk()))
    return Effect.gen(function* () {
      expect(yield* (yield* OpenAIAccountAuth).logout).toEqual({ removed: true, revocationSupported: false })
      expect(store.serialized()).toBe(1)
    }).pipe(provideLayer(dependencies(store.layer)))
  })

  it.effect("coalesces concurrent rejected-generation refreshes and returns one generation", () => {
    const original = disk()
    const store = memoryStore(Option.some(original))
    let refreshes = 0
    const http = OAuthClient.of({
      ...unusedHttp,
      refresh: () =>
        Effect.sync(() => {
          refreshes++
          return tokens()
        }),
    })
    return Effect.gen(function* () {
      const service = yield* OpenAIAccountAuth
      const values = yield* Effect.all(
        Array.from({ length: 3 }, () => service.refreshRejected(original.generation)),
        { concurrency: "unbounded" },
      )
      expect(refreshes).toBe(1)
      expect(new Set(values.map((x) => x.generation)).size).toBe(1)
    }).pipe(provideLayer(dependencies(store.layer, http)))
  })

  it.effect("keeps remote refresh interruptible but commits a rotated token uninterruptibly", () =>
    Effect.gen(function* () {
      const original = disk()
      const networkStarted = yield* Latch.make()
      const networkInterrupted = yield* Latch.make()
      let networkSaved = false
      const networkStore = Layer.succeed(
        CredentialStore,
        CredentialStore.of({
          load: Effect.succeed(Option.some(original)),
          save: () => Effect.sync(() => void (networkSaved = true)),
          remove: Effect.succeed(false),
          serialized: (effect) => effect,
        }),
      )
      const blockedHttp = OAuthClient.of({
        ...unusedHttp,
        refresh: () =>
          networkStarted.open.pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => networkInterrupted.open),
          ),
      })
      const networkFiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).refreshRejected(original.generation)
        }).pipe(provideLayer(dependencies(networkStore, blockedHttp))),
      )
      yield* networkStarted.await
      yield* Fiber.interrupt(networkFiber)
      yield* networkInterrupted.await
      expect(networkSaved).toBe(false)

      const saveStarted = yield* Latch.make()
      const releaseSave = yield* Latch.make()
      let committed: Disk | undefined
      const commitStore = Layer.succeed(
        CredentialStore,
        CredentialStore.of({
          load: Effect.succeed(Option.some(original)),
          save: (value) =>
            saveStarted.open.pipe(
              Effect.andThen(releaseSave.await),
              Effect.andThen(Effect.sync(() => void (committed = value))),
            ),
          remove: Effect.succeed(false),
          serialized: (effect) => effect,
        }),
      )
      const commitHttp = OAuthClient.of({
        ...unusedHttp,
        refresh: () => Effect.succeed({ ...tokens(), refresh_token: "rotated-refresh-secret" }),
      })
      const commitFiber = yield* Effect.forkChild(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).refreshRejected(original.generation)
        }).pipe(provideLayer(dependencies(commitStore, commitHttp))),
      )
      yield* saveStarted.await
      const interruptFiber = yield* Effect.forkChild(Fiber.interrupt(commitFiber))
      yield* Effect.yieldNow
      expect(committed).toBeUndefined()
      yield* releaseSave.open
      yield* Fiber.join(interruptFiber)
      expect(committed?.refreshToken).toBe("rotated-refresh-secret")
      expect(committed?.generation).not.toBe(original.generation)
    }),
  )

  it.effect("rejects refreshed and stale generations belonging to another account without overwrite", () => {
    const original = disk()
    const store = memoryStore(Option.some(original))
    const http = OAuthClient.of({
      ...unusedHttp,
      refresh: () => Effect.succeed(tokens("other-account", "other-user")),
    })
    return Effect.gen(function* () {
      const error = yield* Effect.flip((yield* OpenAIAccountAuth).refreshRejected(original.generation))
      expect(error.kind).toBe("account-mismatch")
      expect(Option.getOrThrow(store.value())).toEqual(original)
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toMatch(
        /other-account|other-user/,
      )
      const other = disk({
        accountId: "other-account",
        fingerprint: fingerprint("other-account", "other-user"),
        generation: `${fingerprint("other-account", "other-user")}.next`,
      })
      const changed = memoryStore(Option.some(other))
      const stale = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).refreshRejected(original.generation)
        }).pipe(provideLayer(dependencies(changed.layer))),
      )
      expect(stale.kind).toBe("account-mismatch")
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(stale)).not.toContain("other-account")
    }).pipe(provideLayer(dependencies(store.layer, http)))
  })

  it.effect("acquire refreshes within five minutes but not fresh entries", () => {
    const run = (expiresAt: number) => {
      const store = memoryStore(Option.some(disk({ expiresAt })))
      let refreshes = 0
      return Effect.gen(function* () {
        const value = yield* (yield* OpenAIAccountAuth).acquire
        return { value, refreshes }
      }).pipe(
        provideLayer(
          dependencies(
            store.layer,
            OAuthClient.of({
              ...unusedHttp,
              refresh: () =>
                Effect.sync(() => {
                  refreshes++
                  return tokens()
                }),
            }),
          ),
        ),
      )
    }
    return Effect.gen(function* () {
      expect((yield* run(300_000)).refreshes).toBe(1)
      expect((yield* run(300_001)).refreshes).toBe(0)
    })
  })

  it.effect("partial refresh inherits tokens, rotates generation, and initial incomplete exchange fails", () => {
    const original = disk()
    const store = memoryStore(Option.some(original))
    const partial = OAuthClient.of({
      ...unusedHttp,
      refresh: () => Effect.succeed({ access_token: expiryJwt(1_900_000_000) }),
    })
    return Effect.gen(function* () {
      const refreshed = yield* (yield* OpenAIAccountAuth).refreshRejected(original.generation)
      const saved = Option.getOrThrow(store.value())
      expect(saved.idToken).toBe(original.idToken)
      expect(saved.refreshToken).toBe(original.refreshToken)
      expect(refreshed.generation).not.toBe(original.generation)
      const host = BrowserAuthorization.of({
        authorize: (_url, state) => Effect.succeed({ code: Redacted.make("code"), state }),
      })
      const incomplete = OAuthClient.of({
        ...unusedHttp,
        exchange: () => Effect.succeed({ access_token: jwt() }),
      })
      const error = yield* Effect.flip(
        Effect.gen(function* () {
          return yield* (yield* OpenAIAccountAuth).loginBrowser()
        }).pipe(provideLayer(dependencies(memoryStore().layer, incomplete, host))),
      )
      expect(error.kind).toBe("protocol")
    }).pipe(provideLayer(dependencies(store.layer, partial)))
  })

  it.effect("decodes access expiry independently and never exposes secrets or account IDs", () => {
    const store = memoryStore()
    const host = BrowserAuthorization.of({
      authorize: (_url, state) => Effect.succeed({ code: Redacted.make("authorization-secret"), state }),
    })
    const http = OAuthClient.of({
      ...unusedHttp,
      exchange: () =>
        Effect.succeed({ access_token: expiryJwt(1_900_000_000), id_token: jwt(), refresh_token: "refresh-secret" }),
    })
    return Effect.gen(function* () {
      const credential = yield* (yield* OpenAIAccountAuth).loginBrowser()
      expect(credential.expiresAt).toBe(1_900_000_000_000)
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(credential)).not.toMatch(
        /authorization-secret|refresh-secret|account-secret|user-secret/,
      )
      const error = AuthError.make({ kind: "protocol", message: "safe protocol failure" })
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(error)).not.toMatch(
        /authorization-secret|refresh-secret|account-secret|user-secret/,
      )
    }).pipe(provideLayer(dependencies(store.layer, http, host)))
  })
})
