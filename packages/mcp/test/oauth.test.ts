import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Redacted } from "effect"
import { OAuth } from "../src/index"

describe("OAuth", () => {
  it.effect("stores, loads, and removes redacted tokens in memory", () =>
    Effect.gen(function* () {
      const store = yield* OAuth.TokenStore
      const tokens = Redacted.make('{"access_token":"secret"}')
      yield* store.save("https://mcp.example", tokens)
      const loaded = yield* store.load("https://mcp.example")
      expect(Option.isSome(loaded)).toBe(true)
      expect(String(Option.getOrThrow(loaded))).not.toContain("secret")
      expect(Redacted.value(Option.getOrThrow(loaded))).toContain("secret")
      yield* store.remove("https://mcp.example")
      expect(Option.isNone(yield* store.load("https://mcp.example"))).toBe(true)
    }).pipe(Effect.provide(OAuth.tokenStoreMemoryLayer)),
  )

  it.effect("exposes typed denied, expired, pending, and provider errors", () =>
    Effect.sync(() => {
      expect(new OAuth.OAuthDeniedError({ reason: "access_denied" })._tag).toBe("OAuthDeniedError")
      expect(new OAuth.OAuthExpiredError({ server: "server" })._tag).toBe("OAuthExpiredError")
      expect(new OAuth.OAuthPendingError({ authorizationUrl: "https://auth.example" })._tag).toBe("OAuthPendingError")
      const provider = new OAuth.OAuthProviderError({ server: "server", operation: "refresh", message: "failed" })
      expect(provider._tag).toBe("OAuthProviderError")
      expect(JSON.stringify(provider)).not.toContain("access_token")
    }),
  )
})
