import { Function, Schema } from "effect"
export { digest } from "./canonical-json.js"
import { digest } from "./canonical-json.js"

const decodeIdentity = Schema.decodeUnknownSync(Schema.Json)

const sha256 = "[0-9a-f]{64}"

const pinSchema = <Kind extends string>(kind: Kind) =>
  Schema.String.pipe(
    Schema.check(Schema.isPattern(new RegExp(`^${kind}:v1:sha256:${sha256}$`))),
    Schema.brand(`generalist/${kind}`),
  )

/** @experimental Exact identity of one closed Agent manifest. */
export const AgentPin = pinSchema("agent-pin")
/** @experimental */
export type AgentPin = typeof AgentPin.Type

/** @experimental Exact identity of one closed Agent Program manifest. */
export const ProgramPin = pinSchema("program-pin")
/** @experimental */
export type ProgramPin = typeof ProgramPin.Type

/** @experimental Exact opaque identity of a model implementation and configuration. */
export const ModelPin = pinSchema("model-pin")
/** @experimental */
export type ModelPin = typeof ModelPin.Type

/** @experimental Exact opaque identity of a tool, skill, service, or policy capability. */
export const CapabilityPin = pinSchema("capability-pin")
/** @experimental */
export type CapabilityPin = typeof CapabilityPin.Type

/** @experimental Exact identity of one complete executable closure. */
export const ExecutablePin = pinSchema("executable-pin")
/** @experimental */
export type ExecutablePin = typeof ExecutablePin.Type

/** @experimental Construct the exact identity of a model implementation and configuration. */
export const makeModel = Function.flow(decodeIdentity, (identity) =>
  Schema.decodeSync(ModelPin)(`model-pin:v1:sha256:${digest(identity)}`),
)

/** @experimental Construct the exact identity of a tool, skill, service, or policy capability. */
export const makeCapability = Function.flow(decodeIdentity, (identity) =>
  Schema.decodeSync(CapabilityPin)(`capability-pin:v1:sha256:${digest(identity)}`),
)

/** @experimental Construct the exact identity of one closed Agent Program manifest. */
export const makeProgram = Function.flow(decodeIdentity, (identity) =>
  Schema.decodeSync(ProgramPin)(`program-pin:v1:sha256:${digest(identity)}`),
)
