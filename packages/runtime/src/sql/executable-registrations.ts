import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExecutableRegistration, digest, encodeJson } from "../executable-registration.js"
import { ExecutableRegistrationConflict, RuntimeUnavailable } from "../errors.js"

interface RegistrationRow {
  readonly pin: string
  readonly codec: string
  readonly version: string
  readonly payload_json: string
  readonly registration_digest: string
}

export const persistRegistrations = (registrations: ReadonlyArray<ExecutableRegistration>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const storedDigest = (pin: string) =>
      sql<RegistrationRow>`
        SELECT pin, codec, version, payload_json, registration_digest
        FROM baton_executable_registrations WHERE pin = ${pin}
      `.pipe(Effect.map((rows) => rows[0]?.registration_digest))

    for (const registration of registrations) {
      const registrationDigest = digest(registration)
      const existing = yield* storedDigest(registration.pin)
      if (existing !== undefined) {
        if (existing !== registrationDigest) {
          return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
        }
        continue
      }
      const inserted = yield* Effect.exit(sql`
        INSERT INTO baton_executable_registrations (pin, codec, version, payload_json, registration_digest)
        VALUES (${registration.pin}, ${registration.codec}, ${registration.version}, ${encodeJson(registration)}, ${registrationDigest})
      `)
      if (inserted._tag === "Success") continue
      const raced = yield* storedDigest(registration.pin)
      if (raced === undefined) return yield* inserted
      if (raced !== registrationDigest) {
        return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
      }
    }
    return
  })

export const associateRegistrations = (runId: string, registrations: ReadonlyArray<ExecutableRegistration>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const registration of registrations) {
      yield* sql`INSERT INTO baton_run_registrations (run_id, pin) VALUES (${runId}, ${registration.pin})`
    }
  })

export const loadRegistrations = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RegistrationRow>`
      SELECT registration.pin, registration.codec, registration.version,
        registration.payload_json, registration.registration_digest
      FROM baton_runs run
      JOIN baton_run_registrations link ON link.run_id = run.run_id
      JOIN baton_executable_registrations registration ON registration.pin = link.pin
      WHERE run.run_id = ${runId}
      ORDER BY registration.pin
    `
    return yield* Effect.forEach(rows, (row) =>
      Effect.try({
        try: () => {
          const registration = Schema.decodeUnknownSync(Schema.fromJsonString(ExecutableRegistration), {
            onExcessProperty: "error",
          })(row.payload_json)
          if (digest(registration) !== row.registration_digest)
            throw new TypeError(`registration digest mismatch: ${row.pin}`)
          return registration
        },
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      }),
    )
  })
