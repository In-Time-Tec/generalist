import type { Metadata } from "../../core/model/registry.js"

/** @experimental */
export interface RegistrationOptions {
  readonly registrationKey?: string
  readonly metadata?: Metadata
}
