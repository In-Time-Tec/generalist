import {
  ActiveModelResponse as ActiveModelResponse_Service,
  make as ActiveModelResponse_make,
} from "../result/active-model-response.js"

export const ActiveModelResponse = {
  ActiveModelResponse: ActiveModelResponse_Service,
  make: ActiveModelResponse_make,
} as const
export namespace ActiveModelResponse {
  export type AttemptIdentity = import("../result/active-model-response.js").AttemptIdentity
  export type Snapshot = import("../result/active-model-response.js").Snapshot
  export type Interface = import("../result/active-model-response.js").Interface
}
