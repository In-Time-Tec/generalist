import { Schema } from "effect"
import { digest } from "./canonical-json.js"

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

/** @experimental Pin exact opaque model identity expressed as closed JSON. */
export const makeModel = (identity: unknown): ModelPin =>
  Schema.decodeUnknownSync(ModelPin)(`model-pin:v1:sha256:${digest(identity)}`)

/** @experimental Pin exact opaque capability identity expressed as closed JSON. */
export const makeCapability = (identity: unknown): CapabilityPin =>
  Schema.decodeUnknownSync(CapabilityPin)(`capability-pin:v1:sha256:${digest(identity)}`)

/** @experimental */
export const makeAgent = (identity: unknown): AgentPin =>
  Schema.decodeUnknownSync(AgentPin)(`agent-pin:v1:sha256:${digest(identity)}`)

/** @experimental */
export const makeProgram = (identity: unknown): ProgramPin =>
  Schema.decodeUnknownSync(ProgramPin)(`program-pin:v1:sha256:${digest(identity)}`)

/** @experimental */
export const makeExecutable = (identity: unknown): ExecutablePin =>
  Schema.decodeUnknownSync(ExecutablePin)(`executable-pin:v1:sha256:${digest(identity)}`)
