import { Function, Schema } from "effect"
import { digest } from "./canonical-json.js"
import { AgentPin, ExecutablePin } from "./pin.js"

const decodeIdentity = Schema.decodeUnknownSync(Schema.Json)

/** @internal Construct the exact identity of one closed Agent manifest. */
export const makeAgent = Function.flow(decodeIdentity, (identity) =>
  Schema.decodeSync(AgentPin)(`agent-pin:v1:sha256:${digest(identity)}`),
)

/** @internal Construct the exact identity of one complete executable closure. */
export const makeExecutable = Function.flow(decodeIdentity, (identity) =>
  Schema.decodeSync(ExecutablePin)(`executable-pin:v1:sha256:${digest(identity)}`),
)
