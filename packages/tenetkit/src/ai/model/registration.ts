import { ModelRegistry } from "../../core/model/public/registry.js"

/** @experimental */
export interface RegistrationOptions {
  readonly registrationKey?: string
  readonly metadata?: ModelRegistry.Metadata
}
