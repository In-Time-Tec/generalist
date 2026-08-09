import {
  AddressNotFound as Errors_AddressNotFound,
  ExecutablePinMissing as Errors_ExecutablePinMissing,
  ExecutableRegistrationInvalid as Errors_ExecutableRegistrationInvalid,
  ExecutableRegistrationConflict as Errors_ExecutableRegistrationConflict,
  ExecutableRegistrationMissing as Errors_ExecutableRegistrationMissing,
  ExecutableIdentityMismatch as Errors_ExecutableIdentityMismatch,
  AgentExecutionFailure as Errors_AgentExecutionFailure,
  IdempotencyConflict as Errors_IdempotencyConflict,
  RunIdConflict as Errors_RunIdConflict,
  RunNotFound as Errors_RunNotFound,
  RunTerminal as Errors_RunTerminal,
  SteeringConflict as Errors_SteeringConflict,
  WaitNotOpen as Errors_WaitNotOpen,
  ResponseConflict as Errors_ResponseConflict,
  ApprovalStale as Errors_ApprovalStale,
  ApprovalMismatch as Errors_ApprovalMismatch,
  CursorExpired as Errors_CursorExpired,
  TreeCursorInvalid as Errors_TreeCursorInvalid,
  TreeCursorExpired as Errors_TreeCursorExpired,
  SubscriberLagged as Errors_SubscriberLagged,
  RuntimeUnavailable as Errors_RuntimeUnavailable,
  FanOutConflict as Errors_FanOutConflict,
  FanOutNotFound as Errors_FanOutNotFound,
  FanOutInvalid as Errors_FanOutInvalid,
  FanOutRemainderUnsupported as Errors_FanOutRemainderUnsupported,
  ChildSelectionMissing as Errors_ChildSelectionMissing,
  StartInvalid as Errors_StartInvalid,
  OperationResolutionConflict as Errors_OperationResolutionConflict,
  StructuredAgentFailure as Errors_StructuredAgentFailure,
  MessagingUnauthorized as Errors_MessagingUnauthorized,
  MailboxFull as Errors_MailboxFull,
  MailboxRateLimited as Errors_MailboxRateLimited,
  MessageConflict as Errors_MessageConflict,
  AgentNameConflict as Errors_AgentNameConflict,
} from "../errors.js"
import {
  SchemaDirty as Errors_SchemaDirty,
  SchemaChecksumMismatch as Errors_SchemaChecksumMismatch,
  SchemaVersionUnsupported as Errors_SchemaVersionUnsupported,
  SchemaUpgradeRequired as Errors_SchemaUpgradeRequired,
  MultiWorkerUnsupported as Errors_MultiWorkerUnsupported,
  SchemaMigrationFailed as Errors_SchemaMigrationFailed,
  StaleClaim as Errors_StaleClaim,
} from "../sql/errors.js"
export const Errors = {
  AddressNotFound: Errors_AddressNotFound,
  ExecutablePinMissing: Errors_ExecutablePinMissing,
  ExecutableRegistrationInvalid: Errors_ExecutableRegistrationInvalid,
  ExecutableRegistrationConflict: Errors_ExecutableRegistrationConflict,
  ExecutableRegistrationMissing: Errors_ExecutableRegistrationMissing,
  ExecutableIdentityMismatch: Errors_ExecutableIdentityMismatch,
  AgentExecutionFailure: Errors_AgentExecutionFailure,
  IdempotencyConflict: Errors_IdempotencyConflict,
  RunIdConflict: Errors_RunIdConflict,
  RunNotFound: Errors_RunNotFound,
  RunTerminal: Errors_RunTerminal,
  SteeringConflict: Errors_SteeringConflict,
  WaitNotOpen: Errors_WaitNotOpen,
  ResponseConflict: Errors_ResponseConflict,
  ApprovalStale: Errors_ApprovalStale,
  ApprovalMismatch: Errors_ApprovalMismatch,
  CursorExpired: Errors_CursorExpired,
  TreeCursorInvalid: Errors_TreeCursorInvalid,
  TreeCursorExpired: Errors_TreeCursorExpired,
  SubscriberLagged: Errors_SubscriberLagged,
  RuntimeUnavailable: Errors_RuntimeUnavailable,
  FanOutConflict: Errors_FanOutConflict,
  FanOutNotFound: Errors_FanOutNotFound,
  FanOutInvalid: Errors_FanOutInvalid,
  FanOutRemainderUnsupported: Errors_FanOutRemainderUnsupported,
  ChildSelectionMissing: Errors_ChildSelectionMissing,
  StartInvalid: Errors_StartInvalid,
  OperationResolutionConflict: Errors_OperationResolutionConflict,
  StructuredAgentFailure: Errors_StructuredAgentFailure,
  MessagingUnauthorized: Errors_MessagingUnauthorized,
  MailboxFull: Errors_MailboxFull,
  MailboxRateLimited: Errors_MailboxRateLimited,
  MessageConflict: Errors_MessageConflict,
  AgentNameConflict: Errors_AgentNameConflict,
  SchemaDirty: Errors_SchemaDirty,
  SchemaChecksumMismatch: Errors_SchemaChecksumMismatch,
  SchemaVersionUnsupported: Errors_SchemaVersionUnsupported,
  SchemaUpgradeRequired: Errors_SchemaUpgradeRequired,
  MultiWorkerUnsupported: Errors_MultiWorkerUnsupported,
  SchemaMigrationFailed: Errors_SchemaMigrationFailed,
  StaleClaim: Errors_StaleClaim,
} as typeof import("../errors.js") & typeof import("../sql/errors.js")
export namespace Errors {
  export type AddressNotFound = import("../errors.js").AddressNotFound
  export type ExecutablePinMissing = import("../errors.js").ExecutablePinMissing
  export type ExecutableRegistrationInvalid = import("../errors.js").ExecutableRegistrationInvalid
  export type ExecutableRegistrationConflict = import("../errors.js").ExecutableRegistrationConflict
  export type ExecutableRegistrationMissing = import("../errors.js").ExecutableRegistrationMissing
  export type ExecutableIdentityMismatch = import("../errors.js").ExecutableIdentityMismatch
  export type AgentExecutionFailure = import("../errors.js").AgentExecutionFailure
  export type IdempotencyConflict = import("../errors.js").IdempotencyConflict
  export type RunIdConflict = import("../errors.js").RunIdConflict
  export type RunNotFound = import("../errors.js").RunNotFound
  export type RunTerminal = import("../errors.js").RunTerminal
  export type SteeringConflict = import("../errors.js").SteeringConflict
  export type WaitNotOpen = import("../errors.js").WaitNotOpen
  export type ResponseConflict = import("../errors.js").ResponseConflict
  export type ApprovalStale = import("../errors.js").ApprovalStale
  export type ApprovalMismatch = import("../errors.js").ApprovalMismatch
  export type CursorExpired = import("../errors.js").CursorExpired
  export type TreeCursorInvalid = import("../errors.js").TreeCursorInvalid
  export type TreeCursorExpired = import("../errors.js").TreeCursorExpired
  export type SubscriberLagged = import("../errors.js").SubscriberLagged
  export type RuntimeUnavailable = import("../errors.js").RuntimeUnavailable
  export type FanOutConflict = import("../errors.js").FanOutConflict
  export type FanOutNotFound = import("../errors.js").FanOutNotFound
  export type FanOutInvalid = import("../errors.js").FanOutInvalid
  export type FanOutRemainderUnsupported = import("../errors.js").FanOutRemainderUnsupported
  export type ChildSelectionMissing = import("../errors.js").ChildSelectionMissing
  export type StartInvalid = import("../errors.js").StartInvalid
  export type OperationResolutionConflict = import("../errors.js").OperationResolutionConflict
  export type StructuredAgentFailure = import("../errors.js").StructuredAgentFailure
  export type MessagingUnauthorized = import("../errors.js").MessagingUnauthorized
  export type MailboxFull = import("../errors.js").MailboxFull
  export type MailboxRateLimited = import("../errors.js").MailboxRateLimited
  export type MessageConflict = import("../errors.js").MessageConflict
  export type AgentNameConflict = import("../errors.js").AgentNameConflict
  export type SchemaDirty = import("../sql/errors.js").SchemaDirty
  export type SchemaChecksumMismatch = import("../sql/errors.js").SchemaChecksumMismatch
  export type SchemaVersionUnsupported = import("../sql/errors.js").SchemaVersionUnsupported
  export type SchemaUpgradeRequired = import("../sql/errors.js").SchemaUpgradeRequired
  export type MultiWorkerUnsupported = import("../sql/errors.js").MultiWorkerUnsupported
  export type SchemaMigrationFailed = import("../sql/errors.js").SchemaMigrationFailed
  export type StaleClaim = import("../sql/errors.js").StaleClaim
}
