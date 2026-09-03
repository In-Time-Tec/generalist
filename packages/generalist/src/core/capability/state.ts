import { Equal, Schema } from "effect"

const NonEmptyString = Schema.String.check(Schema.isNonEmpty())

/** Opaque identity issued by the capability framework. */
export const CapabilityId = NonEmptyString.pipe(Schema.brand("generalist/capability/CapabilityId"))
export type CapabilityId = typeof CapabilityId.Type

/** Declarative resource dimensions constrained by one capability. */
export const Scope = Schema.Record(NonEmptyString, Schema.Array(NonEmptyString).check(Schema.isMinLength(1))).check(
  Schema.makeFilter((scope) => Object.keys(scope).length > 0 || "Capability scope must have at least one dimension"),
)
export type Scope = typeof Scope.Type

/** One capability-protected tool result that may have influenced model output. */
export const Source = Schema.Struct({
  capabilityId: CapabilityId,
  tool: NonEmptyString,
  toolCallId: NonEmptyString,
})
export type Source = typeof Source.Type

export const Grant = Schema.TaggedStruct("Grant", {
  id: CapabilityId,
  tool: NonEmptyString,
  scope: Scope,
  issuedAt: Schema.Finite,
  expiresAt: Schema.Finite,
})
export type Grant = typeof Grant.Type

export const Attenuation = Schema.TaggedStruct("Attenuation", {
  id: CapabilityId,
  parentId: CapabilityId,
  tool: NonEmptyString,
  scope: Scope,
  expiresAt: Schema.Finite,
})
export type Attenuation = typeof Attenuation.Type

export const Authority = Schema.Union([Grant, Attenuation])
export type Authority = typeof Authority.Type

/** Serializable authority carried only across framework-owned journal boundaries. */
export const Descriptor = Schema.Struct({
  id: CapabilityId,
  tool: NonEmptyString,
  scope: Scope,
  expiresAt: Schema.Finite,
  lineage: Schema.Array(Authority).check(Schema.isMinLength(1)),
})
export type Descriptor = typeof Descriptor.Type

export const DenialReason = Schema.Literals(["expired", "invalid-scope", "missing", "revoked", "tainted"])
export type DenialReason = typeof DenialReason.Type

export const Use = Schema.TaggedStruct("Use", {
  key: NonEmptyString,
  id: Schema.optionalKey(CapabilityId),
  tool: NonEmptyString,
  toolCallId: NonEmptyString,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  decision: Schema.Literals(["allow", "deny"]),
  reason: Schema.optionalKey(DenialReason),
  argumentTaint: Schema.Array(Source),
  source: Schema.optionalKey(Source),
})
export type Use = typeof Use.Type

export const Revocation = Schema.TaggedStruct("Revocation", {
  id: CapabilityId,
  revokedAt: Schema.Finite,
})
export type Revocation = typeof Revocation.Type

export const TaintCleared = Schema.TaggedStruct("TaintCleared", {
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  compaction: NonEmptyString,
})
export type TaintCleared = typeof TaintCleared.Type

export const Event = Schema.Union([Grant, Attenuation, Use, Revocation, TaintCleared])
export type Event = typeof Event.Type

/** Capability graph, audit events, and coarse taint accumulator in one Run checkpoint. */
export const Checkpoint = Schema.Struct({
  events: Schema.Array(Event),
  taint: Schema.Array(Source),
})
export type Checkpoint = typeof Checkpoint.Type

export const empty: Checkpoint = { events: [], taint: [] }

const appendUnique = (events: ReadonlyArray<Event>, event: Event): ReadonlyArray<Event> => {
  if (event._tag === "Use" && events.some((candidate) => candidate._tag === "Use" && candidate.key === event.key)) {
    return events
  }
  if (
    (event._tag === "Grant" || event._tag === "Attenuation") &&
    events.some(
      (candidate) => (candidate._tag === "Grant" || candidate._tag === "Attenuation") && candidate.id === event.id,
    )
  ) {
    return events
  }
  if (
    event._tag === "Revocation" &&
    events.some((candidate) => candidate._tag === "Revocation" && candidate.id === event.id)
  ) {
    return events
  }
  if (
    event._tag === "TaintCleared" &&
    events.some((candidate) => candidate._tag === "TaintCleared" && candidate.compaction === event.compaction)
  ) {
    return events
  }
  return [...events, event]
}

/** @internal Add framework-issued grant lineages without duplicating replayed facts. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal state transition with two required direct-style arguments.
export const initialize = (checkpoint: Checkpoint | undefined, descriptors: ReadonlyArray<Descriptor>): Checkpoint => {
  let events = checkpoint?.events ?? []
  for (const descriptor of descriptors) {
    for (const authority of descriptor.lineage) events = appendUnique(events, authority)
  }
  return { events, taint: checkpoint?.taint ?? [] }
}

/** @internal Append one capability audit fact idempotently. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal state transition with two required direct-style arguments.
export const append = (checkpoint: Checkpoint | undefined, event: Event): Checkpoint => {
  const current = checkpoint ?? empty
  return { ...current, events: appendUnique(current.events, event) }
}

/** @internal Accumulate labels without duplicating a source on replay. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal state transition with two required direct-style arguments.
export const accumulate = (checkpoint: Checkpoint | undefined, sources: ReadonlyArray<Source>): Checkpoint => {
  const current = checkpoint ?? empty
  const taint = [...current.taint]
  for (const source of sources) {
    if (!taint.some((candidate) => Equal.equals(candidate, source))) taint.push(source)
  }
  return { ...current, taint }
}

/** @internal Reset the conservative model-context taint at a committed compaction boundary. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal state transition with two required direct-style arguments.
export const clear = (checkpoint: Checkpoint | undefined, event: TaintCleared): Checkpoint => ({
  events: append(checkpoint, event).events,
  taint: [],
})
