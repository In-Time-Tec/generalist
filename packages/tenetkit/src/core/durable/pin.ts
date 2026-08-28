import { Function, Schema } from "effect"
import { digest } from "./canonical-json.js"

/** @experimental Closed JSON identity accepted by durable pin constructors. */
export type PinIdentity = Schema.Json

const decodeIdentity = Schema.decodeUnknownSync(Schema.Json)

const sha256 = "[0-9a-f]{64}"

const pinSchema = <Kind extends string>(kind: Kind) =>
  Schema.String.pipe(
    Schema.check(Schema.isPattern(new RegExp(`^${kind}:v1:sha256:${sha256}$`))),
    Schema.brand(`tenetkit/${kind}`),
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

/** @experimental Constructors for every durable pin identity. */
export const Pin = {
  makeModel: Function.flow(decodeIdentity, (identity) =>
    Schema.decodeSync(ModelPin)(`model-pin:v1:sha256:${digest(identity)}`),
  ),
  makeCapability: Function.flow(decodeIdentity, (identity) =>
    Schema.decodeSync(CapabilityPin)(`capability-pin:v1:sha256:${digest(identity)}`),
  ),
  makeAgent: Function.flow(decodeIdentity, (identity) =>
    Schema.decodeSync(AgentPin)(`agent-pin:v1:sha256:${digest(identity)}`),
  ),
  makeProgram: Function.flow(decodeIdentity, (identity) =>
    Schema.decodeSync(ProgramPin)(`program-pin:v1:sha256:${digest(identity)}`),
  ),
  makeExecutable: Function.flow(decodeIdentity, (identity) =>
    Schema.decodeSync(ExecutablePin)(`executable-pin:v1:sha256:${digest(identity)}`),
  ),
}
