import { Effect, Function } from "effect"
import { ObjectStoreFailure, type Service } from "../object-store.js"

/**
 * Diagnoses obvious violations before canonical mutation; this is not a proof of
 * provider consistency. The isolated sentinel is deliberately identical across
 * clients so simultaneous probes cannot mistake each other for corruption.
 */
export const probe = Function.dual<
  (prefix: string) => (store: Service) => Effect.Effect<void, ObjectStoreFailure>,
  (store: Service, prefix: string) => Effect.Effect<void, ObjectStoreFailure>
>(
  2,
  (store: Service, prefix: string): Effect.Effect<void, ObjectStoreFailure> =>
    Effect.gen(function* () {
      const key = `${prefix}/provider-probe`
      const first = Uint8Array.of(71, 76, 80, 1)
      const second = Uint8Array.of(71, 76, 80, 2)
      yield* store.create(key, first)
      const initial = yield* store.read(key, { maxBytes: first.byteLength })
      if (
        initial === undefined ||
        initial.bytes.length !== first.length ||
        !first.every((byte, index) => initial.bytes[index] === byte)
      ) {
        return yield* ObjectStoreFailure.make({
          operation: "probe",
          key,
          reason: "invalid-response",
          message: "Object provider did not expose complete acknowledged bytes through a direct read",
        })
      }
      const result = yield* store.create(key, second)
      const retained = yield* store.read(key, { maxBytes: first.byteLength })
      if (
        result !== "conflict" ||
        retained === undefined ||
        retained.bytes.length !== first.length ||
        !first.every((byte, index) => retained.bytes[index] === byte)
      ) {
        return yield* ObjectStoreFailure.make({
          operation: "probe",
          key,
          reason: "invalid-response",
          message: "Object provider did not preserve the existing object after a conditional-create conflict",
        })
      }
    }),
)
