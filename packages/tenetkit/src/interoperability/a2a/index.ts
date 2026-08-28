import { make as A2A_makeHandler, type Deployment as A2A_Deployment } from "./handler.js"
import { A2A as A2A_A2A, type Interface as A2A_Interface, layer as A2A_layer } from "./service.js"
export const A2A = {
  A2A: A2A_A2A,
  layer: A2A_layer,
  makeHandler: A2A_makeHandler,
}
export namespace A2A {
  export type A2A = A2A_A2A
  export type Interface = A2A_Interface
  export type Deployment = A2A_Deployment
  export type layer = typeof A2A_layer
  export type makeHandler = typeof A2A_makeHandler
}

import { decode as Content_decode } from "./content.js"
export const Content = { decode: Content_decode }
export namespace Content {
  export type decode = typeof Content_decode
}

import {
  artifactFromEvent as Projection_artifactFromEvent,
  fromRuntime as Projection_fromRuntime,
  stateFromRun as Projection_stateFromRun,
  statusFromEvent as Projection_statusFromEvent,
} from "./projection.js"
export const Projection = {
  artifactFromEvent: Projection_artifactFromEvent,
  fromRuntime: Projection_fromRuntime,
  stateFromRun: Projection_stateFromRun,
  statusFromEvent: Projection_statusFromEvent,
}

import {
  MessageRejected as Errors_MessageRejected,
  TaskProjectionFailed as Errors_TaskProjectionFailed,
} from "./errors.js"
export const Errors = {
  MessageRejected: Errors_MessageRejected,
  TaskProjectionFailed: Errors_TaskProjectionFailed,
}
export namespace Errors {
  export type MessageRejected = import("./errors.js").MessageRejected
  export type TaskProjectionFailed = import("./errors.js").TaskProjectionFailed
}
