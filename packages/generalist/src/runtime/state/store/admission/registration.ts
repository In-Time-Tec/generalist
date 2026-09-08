import { Effect } from "effect"
import { ExecutableRegistrationConflict } from "../../../errors.js"
import { digest as registrationDigest, type ExecutableRegistration } from "../../../executable/registration.js"
import type { RuntimeState } from "../../projection.js"

export const addRegistrations = ({
  state,
  registrations,
}: {
  readonly state: RuntimeState
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}) =>
  Effect.gen(function* () {
    const catalog = new Map(state.registrationCatalog)
    for (const registration of registrations) {
      const digest = registrationDigest(registration)
      const existing = catalog.get(registration.pin)
      if (existing !== undefined && existing.digest !== digest)
        return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
      catalog.set(registration.pin, { digest, value: registration })
    }
    return catalog
  })
