import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { AgentDirectory, Errors, Messaging, Runtime } from "../../../../src/runtime/index.js"
import { textPrompt } from "../../execution/fixtures.js"
import { messagingBackend, type MessagingBackend } from "../scenario.js"

/** A host that opts into one exact cross-session direction, the way a product wires Threads together. */
const pairPolicy = (allowed: { readonly from: string; readonly to: string }): Messaging.Service => ({
  allow: (input) => Effect.succeed(input.sender.sessionId === allowed.from && input.target.sessionId === allowed.to),
  discover: () => Effect.succeed([]),
})

export const messagingPolicySuite = <StoreError, Extra = never>(backend: MessagingBackend<StoreError, Extra>) => {
  const { provide, strangerFor } = messagingBackend(backend)
  const describeBackend = backend.skip === true ? describe.skip : describe
  const session = (label: string) => `thread:policy:${backend.name}:${label}`
  const left = session("left")
  const right = session("right")
  const elsewhere = session("elsewhere")
  const peerSession = session("discovery-peer")
  const opened = provide({ messagingPolicy: pairPolicy({ from: left, to: right }) })

  describeBackend(`cross-session addressing under host policy (${backend.name})`, () => {
    it.live("allows exactly the pair the host opted into, in that direction only", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sender = yield* strangerFor(left)
        const target = yield* strangerFor(right)

        const allowed = yield* runtime.sendMessage({
          fromRunId: sender.runId,
          to: target.address,
          idempotencyKey: "across-threads",
          prompt: textPrompt("hello other thread"),
        })
        expect(allowed.duplicate).toBe(false)
        expect(yield* runtime.messages({ runId: target.runId, limit: 10 })).toHaveLength(1)

        // Policy is directional: the reverse direction was never granted.
        const reverse = yield* runtime
          .sendMessage({
            fromRunId: target.runId,
            to: sender.address,
            idempotencyKey: "reverse",
            prompt: textPrompt("reply"),
          })
          .pipe(Effect.flip)
        expect(reverse).toBeInstanceOf(Errors.MessagingUnauthorized)
        expect(yield* runtime.messages({ runId: sender.runId, limit: 10 })).toEqual([])
      }).pipe(opened),
    )

    it.live("still refuses a session the policy does not name", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sender = yield* strangerFor(left)
        const other = yield* strangerFor(elsewhere)

        const error = yield* runtime
          .sendMessage({
            fromRunId: sender.runId,
            to: other.address,
            idempotencyKey: "unnamed",
            prompt: textPrompt("hello"),
          })
          .pipe(Effect.flip)

        expect(error).toBeInstanceOf(Errors.MessagingUnauthorized)
      }).pipe(opened),
    )

    it.live("never lists the sender itself even when policy announces it", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const solo = yield* strangerFor(session("self-discovery"))
        expect(yield* runtime.directory(solo.runId)).toEqual([])
      }).pipe(
        provide({
          messagingPolicy: {
            allow: () => Effect.succeed(true),
            discover: (sender) => Effect.succeed([sender.address]),
          },
        }),
      ),
    )

    it.live("lists a policy-announced cross-session peer that policy also authorizes", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sender = yield* strangerFor(session("discovery-source"))
        const peer = yield* strangerFor(peerSession)

        // Discovery announces an Address; the reachable list still resolves it to an authoritative Run.
        const reachable = yield* runtime.directory(sender.runId)
        expect(reachable.map((entry) => entry.runId)).toEqual([peer.runId])
      }).pipe(
        provide({
          messagingPolicy: {
            allow: (input) => Effect.succeed(input.target.sessionId === peerSession),
            discover: () => Effect.succeed([AgentDirectory.sessionAddress(peerSession)]),
          },
        }),
      ),
    )

    it.live("omits an announced address the policy refuses to authorize", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sender = yield* strangerFor(session("announced-but-denied-source"))
        yield* strangerFor(peerSession)

        // Announcing an Address is not granting it: authorization is asked again for every entry.
        expect(yield* runtime.directory(sender.runId)).toEqual([])
      }).pipe(
        provide({
          messagingPolicy: {
            allow: () => Effect.succeed(false),
            discover: () => Effect.succeed([AgentDirectory.sessionAddress(peerSession)]),
          },
        }),
      ),
    )
  })
}
