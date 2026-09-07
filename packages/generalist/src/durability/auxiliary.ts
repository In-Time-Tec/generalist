import { Clock, Crypto, Effect, Layer, Option, Schema } from "effect"
import { digest } from "../core/durable/canonical-json.js"
import { MemoError, Store, type LayerOptions as MemoLayerOptions } from "../core/memo/service.js"
import { PermissionError, RuleSchema, RuleStore } from "../core/policy/rule-store.js"
import { DurabilityFailure } from "./errors.js"
import { ObjectStore } from "./object-store.js"
import * as Journal from "./internal/journal.js"
import * as Protocol from "./internal/protocol.js"

/**
 * An explicitly named auxiliary partition, separate from every Runtime partition.
 * Memo and remembered rules may share this partition and its canonical journal.
 * @experimental
 */
export interface Options extends Journal.Options {}

/** Optional durable memo reuse; model reuse still requires explicit enablement. @experimental */
export interface MemoOptions extends Options, MemoLayerOptions {}

/** Remembered rules are isolated by scope within the auxiliary partition. @experimental */
export interface RuleStoreOptions extends Options {
  readonly scope?: string
}

const Entry = Schema.Struct({
  value: Schema.Json,
  fromRun: Schema.String,
  fromOperation: Schema.String,
  expiresAtMillis: Schema.Number.check(Schema.isFinite()),
})
const Rules = Schema.Array(RuleSchema)
const marker = "generalist/auxiliary/version"

const verifyPartition = (state: Journal.State): Effect.Effect<void, DurabilityFailure> => {
  if (Object.keys(state).length === 0) return Effect.void
  if (!Object.hasOwn(state, marker)) {
    return Effect.fail(new DurabilityFailure({
      reason: "configuration",
      message: "Auxiliary stores require their own explicitly named partition, separate from Runtime state",
    }))
  }
  if (state[marker] !== 1) {
    return Effect.fail(new DurabilityFailure({
      reason: "unsupported-version",
      message: "Unsupported auxiliary state version",
    }))
  }
  return Effect.void
}

/**
 * Persist opt-in memo entries through the same engine as Runtime. Memo hits are
 * journaled by the caller's operation driver; this store is never replay authority.
 * Values must satisfy Schema.Json, with typed errors rather than lossy serialization.
 * @experimental
 */
export const layerMemo = (
  options: MemoOptions,
): Layer.Layer<Store, DurabilityFailure, ObjectStore | Crypto.Crypto> => Layer.effect(
  Store,
  Effect.gen(function* () {
    const journal = yield* Journal.make(options)
    yield* journal.read.pipe(Effect.flatMap((head) => verifyPartition(head.state)))
    return Store.of({
      modelsEnabled: options.models?.enabled === true,
      get: (key) => Effect.gen(function* () {
        const { state } = yield* journal.read
        yield* verifyPartition(state)
        const stateKey = `memo:${key}`
        if (!Object.hasOwn(state, stateKey)) return Option.none()
        const entry = yield* Protocol.decode(Entry, state[stateKey], "corruption", stateKey)
        const now = yield* Clock.currentTimeMillis
        return entry.expiresAtMillis > now ? Option.some(entry) : Option.none()
      }).pipe(Effect.mapError((cause) => MemoError.make({
        operation: "get", key, message: `Memo read failed: ${cause.message}`, cause,
      }))),
      put: (key, entry) => Effect.gen(function* () {
        const encoded = yield* Protocol.decode(Entry, entry, "encoding", `memo:${key}`)
        const input = { key, entry: encoded }
        // Provenance identifies this memo publication; differing bytes cannot replace its receipt.
        const id = `memo:${digest({ key, run: encoded.fromRun, operation: encoded.fromOperation })}`
        yield* journal.commit({ id, input }, (state) => verifyPartition(state).pipe(Effect.as({
          patches: [
            { op: "set", path: [marker], value: 1 },
            { op: "set", path: [`memo:${key}`], value: encoded },
          ],
          receipt: null,
        })))
      }).pipe(Effect.mapError((cause) => MemoError.make({
        operation: "put", key, message: `Memo write failed: ${cause.message}`, cause,
      }))),
    })
  }),
)

/**
 * Durable remembered-rule overlay. Replacing a pattern moves it to the end;
 * the last matching rule wins, while an explicit base denial still takes priority.
 * @experimental
 */
export const layerRuleStore = (
  options: RuleStoreOptions,
): Layer.Layer<RuleStore, DurabilityFailure, ObjectStore | Crypto.Crypto> => Layer.effect(
  RuleStore,
  Effect.gen(function* () {
    const journal = yield* Journal.make(options)
    const crypto = yield* Crypto.Crypto
    const scope = options.scope ?? "global"
    const key = `rules:${scope}`
    yield* journal.read.pipe(Effect.flatMap((head) => verifyPartition(head.state)))
    return RuleStore.of({
      rules: Effect.gen(function* () {
        const { state } = yield* journal.read
        yield* verifyPartition(state)
        return Object.hasOwn(state, key) ? yield* Protocol.decode(Rules, state[key], "corruption", key) : []
      }).pipe(Effect.mapError((cause) => PermissionError.make({
        message: `Permission rule read failed: ${cause.message}`, cause,
      }))),
      remember: (rule) => Effect.gen(function* () {
        const encoded = yield* Protocol.decode(RuleSchema, rule, "encoding", key)
        const id = yield* crypto.randomUUIDv4
        yield* journal.commit({ id: `rule:${id}`, input: { scope, rule: encoded } }, (state) => Effect.gen(function* () {
          yield* verifyPartition(state)
          const rules = Object.hasOwn(state, key) ? yield* Protocol.decode(Rules, state[key], "corruption", key) : []
          return {
            patches: [
              { op: "set" as const, path: [marker], value: 1 },
              { op: "set" as const, path: [key], value: [...rules.filter((existing) => existing.pattern !== encoded.pattern), encoded] },
            ],
            receipt: null,
          }
        }))
      }).pipe(Effect.mapError((cause) => PermissionError.make({
        message: `Permission rule write failed: ${cause.message}`, cause,
      }))),
    })
  }),
)
