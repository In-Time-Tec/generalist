import {
  PermissionDenied as ToolAuthorization_PermissionDenied,
  AuthorizationError as ToolAuthorization_AuthorizationError,
  ToolAuthorizerService as ToolAuthorization_ToolAuthorizerService,
  make as ToolAuthorization_make,
  layerTest as ToolAuthorization_layerTest,
} from "../tool-authorization.js"
export const ToolAuthorization = {
  PermissionDenied: ToolAuthorization_PermissionDenied,
  AuthorizationError: ToolAuthorization_AuthorizationError,
  Service: ToolAuthorization_ToolAuthorizerService,
  make: ToolAuthorization_make,
  layerTest: ToolAuthorization_layerTest,
}
export namespace ToolAuthorization {
  export type PermissionDenied = import("../tool-authorization.js").PermissionDenied
  export type AuthorizationError = import("../tool-authorization.js").AuthorizationError
  export type Service = import("../tool-authorization.js").ToolAuthorizerService
  export type make = typeof import("../tool-authorization.js").make
  export type layerTest = typeof import("../tool-authorization.js").layerTest
  export type AccessRequest = import("../tool-authorization.js").AccessRequest
  export type Deny = import("../tool-authorization.js").Deny
  export type Execute = import("../tool-authorization.js").Execute
  export type Options = import("../tool-authorization.js").Options
  export type Request = import("../tool-authorization.js").Request
  export type Suspend = import("../tool-authorization.js").Suspend
  export type Decision = import("../tool-authorization.js").ToolAuthorization
  export type Authorizer<R = never> = import("../tool-authorization.js").ToolAuthorizer<R>
}
