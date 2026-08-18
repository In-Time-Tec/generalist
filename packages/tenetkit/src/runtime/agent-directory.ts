import { Effect, Function, Schema } from "effect"
import { Address } from "./address.js"
import { RunStatus } from "./run.js"

/** @experimental Host-assigned friendly name for one addressable agent. */
export const AgentName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]{0,63}$/)).pipe(
  Schema.brand("tenetkit/runtime/AgentName"),
)
/** @experimental */
export type AgentName = typeof AgentName.Type

/** @experimental */
export const makeName = (value: string): AgentName => Schema.decodeSync(AgentName)(value)

const RUN = "run:"
const SESSION = "session:"
const NAME = "name:"

/** @experimental Address of one exact durable execution. */
export const runAddress = (runId: string): Address => Schema.decodeSync(Address)(`${RUN}${encodeURIComponent(runId)}`)

/** @experimental Address of one durable agent identity across its successive Runs. */
export const sessionAddress = (sessionId: string): Address =>
  Schema.decodeSync(Address)(`${SESSION}${encodeURIComponent(sessionId)}`)

/** @experimental Address of one host-assigned name inside the scope that owns it. */
export const nameAddress = (input: { readonly scope: string; readonly name: AgentName }): Address =>
  Schema.decodeSync(Address)(`${NAME}${encodeURIComponent(input.scope)}:${encodeURIComponent(input.name)}`)

/** @experimental Naming scope for one Run: its parent Run, or its own root when it has no parent. */
export const nameScope = (input: { readonly runId: string; readonly parentRunId?: string | undefined }): string =>
  input.parentRunId ?? `root:${input.runId}`

/** @experimental What an Address names before authoritative resolution. */
export type AddressTarget =
  | { readonly _tag: "Run"; readonly runId: string }
  | { readonly _tag: "Session"; readonly sessionId: string }
  | { readonly _tag: "Name"; readonly scope: string; readonly name: string }

export class AddressInvalid extends Schema.TaggedErrorClass<AddressInvalid>()("tenetkit/runtime/AddressInvalid", {
  address: Address,
  message: Schema.String,
}) {}

const decodeSegment = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

/**
 * @experimental Read the shape of an Address.
 *
 * This states which directory table to look in. It never establishes identity, parentage, session
 * membership, or authority: every one of those facts is read from the durable Run record the
 * directory resolves to.
 */
export const parseAddress = (address: Address): Effect.Effect<AddressTarget, AddressInvalid> => {
  const invalid = (message: string) => AddressInvalid.make({ address, message })
  if (address.startsWith(RUN)) {
    const runId = decodeSegment(address.slice(RUN.length))
    if (runId === undefined || runId.length === 0) return invalid("run address requires a Run id")
    return Effect.succeed({ _tag: "Run", runId })
  }
  if (address.startsWith(SESSION)) {
    const sessionId = decodeSegment(address.slice(SESSION.length))
    if (sessionId === undefined || sessionId.length === 0) return invalid("session address requires a session id")
    return Effect.succeed({ _tag: "Session", sessionId })
  }
  if (address.startsWith(NAME)) {
    const rest = address.slice(NAME.length)
    const separator = rest.lastIndexOf(":")
    if (separator <= 0) return invalid("name address requires a scope and a name")
    const scope = decodeSegment(rest.slice(0, separator))
    const name = decodeSegment(rest.slice(separator + 1))
    if (scope === undefined || name === undefined || scope.length === 0 || name.length === 0) {
      return invalid("name address requires a scope and a name")
    }
    return Effect.succeed({ _tag: "Name", scope, name })
  }
  return invalid("address must be a run, session, or name address")
}

/** @experimental One resolved, authoritative directory record. */
export interface DirectoryEntry {
  readonly address: Address
  readonly runId: string
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly sessionId: string
  readonly status: RunStatus
  readonly name?: AgentName
}

interface DirectoryEntryEncoded extends Omit<DirectoryEntry, "address" | "name"> {
  readonly address: string
  readonly name?: string
}

/** @experimental */
export const DirectoryEntry: Schema.Codec<DirectoryEntry, DirectoryEntryEncoded> = Schema.Struct({
  address: Address,
  runId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  sessionId: Schema.String,
  status: RunStatus,
  name: Schema.optionalKey(AgentName),
})

/** @experimental Relationship TenetKit derives from authoritative Run records, never from Address text. */
export const Relationship = Schema.Literals(["self", "parent", "child", "sibling"])
/** @experimental */
export type Relationship = typeof Relationship.Type

/**
 * @experimental Classify one sender against one target using only durable parentage.
 *
 * Returns undefined when no built-in relationship holds. Whether an unrelated pair may address each
 * other is a host policy decision, not a derived fact.
 */
export const relationship: {
  (target: DirectoryEntry): (sender: DirectoryEntry) => Relationship | undefined
  (sender: DirectoryEntry, target: DirectoryEntry): Relationship | undefined
} = Function.dual(2, (sender: DirectoryEntry, target: DirectoryEntry): Relationship | undefined => {
  if (sender.runId === target.runId) return "self"
  if (sender.parentRunId !== undefined && sender.parentRunId === target.runId) return "parent"
  if (target.parentRunId !== undefined && target.parentRunId === sender.runId) return "child"
  if (
    sender.parentRunId !== undefined &&
    target.parentRunId !== undefined &&
    sender.parentRunId === target.parentRunId
  ) {
    return "sibling"
  }
  return undefined
})
