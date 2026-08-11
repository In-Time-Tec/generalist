import {
  ActiveModelResponse as ActiveModelResponse_Service,
  make as ActiveModelResponse_make,
} from "./active-model-response.js"

export const ActiveModelResponse = {
  ActiveModelResponse: ActiveModelResponse_Service,
  make: ActiveModelResponse_make,
} as const
export namespace ActiveModelResponse {
  export type AttemptIdentity = import("./active-model-response.js").AttemptIdentity
  export type Snapshot = import("./active-model-response.js").Snapshot
  export type Interface = import("./active-model-response.js").Interface
}
