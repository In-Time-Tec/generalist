import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Option, Redacted, Schema } from "effect"
import { OAuth } from "../src/index"

describe("OAuth", () => {
  layer(OAuth.tokenStoreMemoryLayer)((methods) => {
    methods.effect("stores, loads, and removes redacted tokens in memory", () =>
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
      }),
    )
  })

  it("exposes typed denied, expired, pending, and provider errors", () => {
    expect(OAuth.OAuthDeniedError.make({ reason: "access_denied" })._tag).toBe("OAuthDeniedError")
    expect(OAuth.OAuthExpiredError.make({ server: "server" })._tag).toBe("OAuthExpiredError")
    expect(OAuth.OAuthPendingError.make({ authorizationUrl: "https://auth.example" })._tag).toBe("OAuthPendingError")
    const provider = OAuth.OAuthProviderError.make({ server: "server", operation: "refresh", message: "failed" })
    expect(provider._tag).toBe("OAuthProviderError")
    expect(Schema.encodeSync(Schema.UnknownFromJsonString)(provider)).not.toContain("access_token")
  })
})
