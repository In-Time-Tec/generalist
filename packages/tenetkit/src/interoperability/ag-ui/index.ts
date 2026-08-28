import { AgUi as AgUi_AgUi, layer as AgUi_layer } from "./service.js"

/** @experimental */
export const AgUi = {
  AgUi: AgUi_AgUi,
  layer: AgUi_layer,
}

/** @experimental */
export namespace AgUi {
  export type AgUi = import("./service.js").AgUi
  export type Interface = import("./service.js").Interface
  export type LayerOptions = import("./service.js").LayerOptions
  export type RunError = import("./service.js").RunError
  export type layer = typeof import("./service.js").layer
}

import {
  EventInvalid as Errors_EventInvalid,
  InputMalformed as Errors_InputMalformed,
  InputRejected as Errors_InputRejected,
  ResumeMismatch as Errors_ResumeMismatch,
  ValueNotSerializable as Errors_ValueNotSerializable,
} from "./errors.js"

/** @experimental */
export const Errors = {
  EventInvalid: Errors_EventInvalid,
  InputMalformed: Errors_InputMalformed,
  InputRejected: Errors_InputRejected,
  ResumeMismatch: Errors_ResumeMismatch,
  ValueNotSerializable: Errors_ValueNotSerializable,
}

/** @experimental */
export namespace Errors {
  export type EventInvalid = import("./errors.js").EventInvalid
  export type InputMalformed = import("./errors.js").InputMalformed
  export type InputRejected = import("./errors.js").InputRejected
  export type ResumeMismatch = import("./errors.js").ResumeMismatch
  export type ValueNotSerializable = import("./errors.js").ValueNotSerializable
}
