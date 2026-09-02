import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { Triggers } from "generalist"
import { provideScoped } from "../scoped-provide.js"

const source = Triggers.source({
  source: "github",
  payload: Schema.Struct({ action: Schema.String, number: Schema.Int }),
  signature: Triggers.github(Redacted.make("secret")),
})
const body = '{"action":"opened","number":349}'

it.effect("verifies a raw GitHub body and validates the source payload", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const ingested = yield* Triggers.ingestWebhook({
        source,
        body,
        headers: {
          "X-Hub-Signature-256": "sha256=1dec3e4852372e6b39611731549664168cbe413abc636ce673ca051d1707bfac",
          "X-GitHub-Delivery": "delivery-349",
        },
      })
      expect(ingested.payload).toEqual({ action: "opened", number: 349 })
      expect(ingested.event).toMatchObject({
        _tag: "Webhook",
        dedupeKey: "delivery-349",
        source: "github",
        payload: { action: "opened", number: 349 },
      })
    }),
  ),
)

it.effect("verifies Slack and configurable HMAC-SHA256 signatures", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const slack = yield* Triggers.ingestWebhook({
        source: { ...source, signature: Triggers.slack(Redacted.make("secret"), Number.MAX_SAFE_INTEGER) },
        body,
        headers: {
          "x-slack-request-timestamp": "0",
          "x-slack-signature": "v0=f3c335267e395ecac5ca38231758cfe4ee2d99dd334db4f5fbbc0bba6d00c81a",
        },
      })
      expect(slack.event.dedupeKey).toBe("v0=f3c335267e395ecac5ca38231758cfe4ee2d99dd334db4f5fbbc0bba6d00c81a")

      const generic = yield* Triggers.ingestWebhook({
        source: {
          ...source,
          signature: Triggers.hmacSha256(Redacted.make("secret"), { header: "x-signature" }),
        },
        body,
        headers: { "x-signature": "1dec3e4852372e6b39611731549664168cbe413abc636ce673ca051d1707bfac" },
      })
      expect(generic.event.dedupeKey).toBe("1dec3e4852372e6b39611731549664168cbe413abc636ce673ca051d1707bfac")
    }),
  ),
)

it.effect("rejects changed raw bodies and excess payload fields", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const signatureFailure = yield* Triggers.ingestWebhook({
        source,
        body: `${body} `,
        headers: {
          "x-hub-signature-256": "sha256=1dec3e4852372e6b39611731549664168cbe413abc636ce673ca051d1707bfac",
          "x-github-delivery": "delivery-349",
        },
      }).pipe(Effect.flip)
      expect(signatureFailure._tag).toBe("generalist/runtime/WebhookRejected")
      if (signatureFailure._tag === "generalist/runtime/WebhookRejected") {
        expect(signatureFailure.reason).toBe("invalid-signature")
      }

      const payloadFailure = yield* Triggers.ingestWebhook({
        source: { ...source, signature: Triggers.unsigned },
        body: '{"action":"opened","number":349,"extra":true}',
        headers: {},
        dedupeKey: "unsigned-349",
      }).pipe(Effect.flip)
      expect(payloadFailure._tag).toBe("generalist/runtime/WebhookRejected")
      if (payloadFailure._tag === "generalist/runtime/WebhookRejected") {
        expect(payloadFailure.reason).toBe("invalid-payload")
      }
    }),
  ),
)
