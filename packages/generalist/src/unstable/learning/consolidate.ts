import { Clock, DateTime, Duration, Effect, Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../core/agent/service.js"
import {
  type Item,
  type Key,
  Memory,
  type MemoryError,
  type OperationRef,
  type Service as MemoryService,
} from "../../core/context/memory.js"
import { make as makeBudget, type Input as BudgetInput } from "../../core/durable/run-budget.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import type { ModelSelection, Registration as ModelRegistration } from "../../core/model/registry.js"
import { AddContext, onRunStart, type Declaration } from "../../hooks/index.js"
import type { RunInspection } from "../../runtime/run.js"
import type { Service as RuntimeService } from "../../runtime/service.js"
import {
  Trajectory,
  fromJournal,
  type FromJournalError,
  type Trajectory as TrajectoryValue,
} from "../../trajectory/index.js"
import { Forget, type Proposal, RefineInstruction, Remember } from "./proposal.js"

const agentName = "generalist-learning-consolidation"
const tenant = "learning"
const memoryKey: Key = { agent: tenant, subject: tenant }
const listLimit = 10_000
const ConsolidationProposals = Schema.Array(Schema.Union([Remember, Forget, RefineInstruction]))
const ConsolidationProposerTypeId = Symbol.for("generalist/learning/ConsolidationProposer")
const MemoryKey = Schema.Struct({ agent: Schema.String, subject: Schema.String })
const CurrentMemory = Schema.Array(Schema.Struct({ id: Schema.String, text: Schema.String, metadata: Schema.Json }))

/** @experimental Scheduled consolidation proposer recognized by `Learning.layer`. */
export interface ConsolidationProposer {
  readonly [ConsolidationProposerTypeId]: true
  (
    trajectory: TrajectoryValue,
  ): Effect.Effect<ReadonlyArray<Proposal>, Schema.SchemaError | ConsolidationInvalid | MemoryError, Memory>
}

/** A consolidation model returned a memory rewrite that could not preserve version history. */
export class ConsolidationInvalid extends ActionableTaggedError<ConsolidationInvalid>()(
  "generalist/learning/ConsolidationInvalid",
  {
    message: Schema.String,
    hint: errorHint(
      "Return paired Forget and Remember proposals for contradictions, using one existing entry id and version.",
    ),
  },
) {}

/** @experimental Scheduled semantic-memory consolidation configuration. */
export interface ConsolidateOptions {
  readonly schedule: string
  readonly window: Duration.Input
  readonly model: ModelSelection | string
  readonly maxProposals: number
  readonly budget?: BudgetInput
}

/** @internal */
export interface Configuration {
  readonly schedule: string
  readonly windowMillis: number
  readonly model: ModelSelection | string
  readonly maxProposals: number
  readonly budget: ReturnType<typeof makeBudget>
  readonly Output: Schema.Codec<{ readonly proposals: ReadonlyArray<Proposal> }, unknown>
}

type ProposeFunction = (trajectory: TrajectoryValue) => object
const configurations = new WeakMap<ProposeFunction, Configuration>()

const activeAgent = (inspection: RunInspection): string | undefined => {
  const active = inspection.executableRef.active
  const entry = inspection.executableManifest.entries.find((candidate) => candidate.pin === active)
  return entry?._tag === "Agent" ? entry.manifest.name : undefined
}

const recentTrajectories = (
  runtime: RuntimeService,
  windowMillis: number,
): Effect.Effect<ReadonlyArray<TrajectoryValue>, FromJournalError> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const cutoff = now - windowMillis
    const candidates = yield* runtime.list({ status: "succeeded", limit: listLimit })
    const recent: Array<TrajectoryValue> = []
    for (const candidate of candidates) {
      if (activeAgent(candidate) === agentName) continue
      const snapshot = yield* runtime.snapshot(candidate.runId)
      const occurredAt =
        snapshot.outcome === undefined
          ? undefined
          : Option.map(DateTime.make(snapshot.outcome.occurredAt), DateTime.toEpochMillis).pipe(Option.getOrUndefined)
      if (occurredAt === undefined || occurredAt < cutoff || activeAgent(snapshot.run) === undefined) continue
      recent.push(yield* fromJournal(runtime, candidate.runId))
    }
    return recent
  })

const textFromItem = (item: Item): string =>
  item.content
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const consolidationPrompt = (
  runtime: RuntimeService,
  memory: MemoryService,
  configuration: Configuration,
): Effect.Effect<Prompt.Prompt, FromJournalError | MemoryError | Schema.SchemaError> =>
  Effect.gen(function* () {
    const trajectories = yield* recentTrajectories(runtime, configuration.windowMillis)
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(Trajectory)))(trajectories)
    const recalled = yield* memory.recall({ key: memoryKey, turn: 0, prompt: Prompt.make(encoded) })
    const current = yield* Effect.forEach(recalled, (item) =>
      Schema.decodeUnknownEffect(Schema.Json)(item.metadata ?? {}).pipe(
        Effect.map((metadata) => ({ id: item.id, text: textFromItem(item), metadata })),
      ),
    )
    const encodedKey = yield* Schema.encodeEffect(Schema.fromJsonString(MemoryKey))(memoryKey)
    const encodedCurrent = yield* Schema.encodeEffect(Schema.fromJsonString(CurrentMemory))(current)
    return Prompt.make(
      [
        "Rewrite semantic memory only when the journal evidence justifies a durable fact or instruction.",
        `Return at most ${configuration.maxProposals} proposals and use memory key ${encodedKey}.`,
        "Every evidence item must name an exact journal runId and zero-based turn from the episodes below.",
        "For a contradiction, return adjacent Forget and Remember proposals for the same entry id. The Remember must name entryId and supersedes, and both proposals must carry the contradicting evidence.",
        "Do not silently overwrite an entry. Return an empty proposal list when no rewrite is justified.",
        `Current semantic memory:\n${encodedCurrent}`,
        `Recent journal episodes:\n${encoded}`,
      ].join("\n\n"),
    )
  })

const sameKey = (left: Key, right: Key): boolean => left.agent === right.agent && left.subject === right.subject
const evidenceKey = (evidence: OperationRef): string => `${evidence.runId}:${evidence.turn}`
const mergeEvidence = (...sets: ReadonlyArray<ReadonlyArray<OperationRef>>): ReadonlyArray<OperationRef> => {
  const merged = new Map<string, OperationRef>()
  for (const set of sets) for (const evidence of set) merged.set(evidenceKey(evidence), evidence)
  return [...merged.values()]
}

interface Contradiction {
  readonly evidence: ReadonlyArray<OperationRef>
}

const contradictions = (
  memory: MemoryService,
  proposals: ReadonlyArray<Proposal>,
): Effect.Effect<ReadonlyMap<string, Contradiction>, ConsolidationInvalid | MemoryError> =>
  Effect.gen(function* () {
    const pairs = new Map<string, Contradiction>()
    for (const [index, proposal] of proposals.entries()) {
      if (proposal._tag !== "Remember" || proposal.memory.supersedes === undefined) continue
      const entryId = proposal.memory.entryId
      if (entryId === undefined || !sameKey(proposal.memory.key, memoryKey)) {
        return yield* ConsolidationInvalid.make({
          message: "A superseding Remember must target the learning memory key",
        })
      }
      const forget = proposals[index - 1]
      if (forget?._tag !== "Forget" || forget.memory.id !== entryId || !sameKey(forget.memory.key, memoryKey)) {
        return yield* ConsolidationInvalid.make({
          message: `Superseding Remember for ${entryId} must immediately follow its matching Forget proposal`,
        })
      }
      if (pairs.has(entryId)) {
        return yield* ConsolidationInvalid.make({ message: `Memory entry ${entryId} is superseded more than once` })
      }
      const history = yield* memory.history(entryId)
      const superseded = history.find((entry) => entry.version === proposal.memory.supersedes)
      if (superseded === undefined) {
        return yield* ConsolidationInvalid.make({
          message: `Memory entry ${entryId} has no version ${proposal.memory.supersedes}`,
        })
      }
      pairs.set(entryId, {
        evidence: mergeEvidence(superseded.evidence, forget.evidence, proposal.evidence),
      })
    }
    return pairs
  })

const normalize = (
  memory: MemoryService,
  proposals: ReadonlyArray<Proposal>,
): Effect.Effect<ReadonlyArray<Proposal>, ConsolidationInvalid | MemoryError> =>
  Effect.gen(function* () {
    const pairs = yield* contradictions(memory, proposals)
    return yield* Effect.forEach(proposals, (proposal): Effect.Effect<Proposal, ConsolidationInvalid> => {
      if (proposal._tag !== "Remember" && proposal._tag !== "Forget") return Effect.succeed(proposal)
      if (!sameKey(proposal.memory.key, memoryKey)) {
        return Effect.fail(ConsolidationInvalid.make({ message: `${proposal._tag} targets a non-learning memory key` }))
      }
      const entryId = proposal._tag === "Remember" ? proposal.memory.entryId : proposal.memory.id
      const pair = entryId === undefined ? undefined : pairs.get(entryId)
      return Effect.succeed(pair === undefined ? proposal : { ...proposal, evidence: pair.evidence })
    })
  })

/** @internal */
export const configurationOf = (propose: ProposeFunction): Configuration | undefined => configurations.get(propose)

/** @internal */
export const isConsolidationAgent = (name: string): boolean => name === agentName

/** @internal */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal cross-file integration, not a public combinator.
export const agent = (configuration: Configuration, model: ModelSelection) =>
  makeAgent({
    name: agentName,
    model,
    output: configuration.Output,
    instructions: "Consolidate recent journal episodes into reviewable semantic-memory and instruction proposals.",
    budget: configuration.budget.allocation,
  })

/** @internal */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal cross-file integration, not a public combinator.
export const resolveModel = (
  configured: ModelSelection | string,
  registrations: ReadonlyArray<ModelRegistration>,
): Effect.Effect<ModelSelection, ConsolidationInvalid> => {
  if (!Schema.is(Schema.String)(configured)) return Effect.succeed(configured)
  const matches = registrations.filter(
    (registration) =>
      registration.model === configured || `${registration.provider}/${registration.model}` === configured,
  )
  if (matches.length !== 1) {
    return Effect.fail(
      ConsolidationInvalid.make({
        message: `Consolidation model ${configured} matched ${matches.length} registered models; use an exact ModelSelection`,
      }),
    )
  }
  const selected = matches[0]!
  return Effect.succeed(
    selected.registrationKey === undefined
      ? { provider: selected.provider, model: selected.model }
      : { provider: selected.provider, model: selected.model, registrationKey: selected.registrationKey },
  )
}

/** @internal */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Internal cross-file integration, not a public combinator.
export const runStartDeclaration = (
  runtime: RuntimeService,
  memory: MemoryService,
  configuration: Configuration,
): Declaration =>
  onRunStart((input) =>
    input.agentName === agentName
      ? consolidationPrompt(runtime, memory, configuration).pipe(Effect.map(AddContext))
      : Effect.void,
  )

/** @experimental Build the scheduled journal-backed consolidation proposer used by `Learning.layer`. */
export const consolidate = (options: ConsolidateOptions): ConsolidationProposer => {
  const window = Duration.fromInputUnsafe(options.window)
  if (!Duration.isFinite(window) || Duration.toMillis(window) <= 0) {
    throw new TypeError("window must be a positive finite duration")
  }
  if (!Number.isSafeInteger(options.maxProposals) || options.maxProposals < 0) {
    throw new TypeError("maxProposals must be a non-negative safe integer")
  }
  const Output = Schema.Struct({ proposals: ConsolidationProposals.check(Schema.isMaxLength(options.maxProposals)) })
  const configuration: Configuration = {
    schedule: options.schedule,
    windowMillis: Duration.toMillis(window),
    model: options.model,
    maxProposals: options.maxProposals,
    budget: makeBudget(options.budget ?? {}),
    Output,
  }
  const propose: ConsolidationProposer = Object.assign(
    (trajectory: TrajectoryValue) =>
      trajectory.agent !== agentName
        ? Effect.succeed([])
        : Effect.gen(function* () {
            const memory = yield* Memory
            const output = yield* Schema.decodeUnknownEffect(Output)(trajectory.output)
            return yield* normalize(memory, output.proposals)
          }),
    { [ConsolidationProposerTypeId]: true as const },
  )
  configurations.set(propose, configuration)
  return propose
}
