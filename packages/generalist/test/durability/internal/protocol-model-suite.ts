import { BunCrypto } from "@effect/platform-bun"
/* oxlint-disable effecttsgo/strict-effect-provide -- Each durability test owns its scoped BunCrypto test-host Layer. */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Option, Schema } from "effect"
import { make as makeJournal, type Journal, type Json, type State } from "../../../src/durability/internal/journal.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { make as makeSimulator, type Client } from "../../../src/testing/durability/index.js"

/**
 * Independent specification model, not a translation of journal/protocol.ts.
 * Its input digest is an injective encoding of this finite command alphabet, NOT
 * a claim about cryptographic collision resistance or production byte encoding.
 * The oracle folds command inputs, never production patches, hashes or replay.
 *
 * Assumptions: one partition, two trusted deterministic writers, atomic complete
 * create-if-absent, strong direct reads/discovery, immutable available payloads,
 * initial generation 0, no normal deletion, no external effects. Publication is
 * the linearization point. Sent requests may outlive timeout/cancellation; no
 * fairness or termination is assumed. Reading and deciding is one local step;
 * publication is a separate independently scheduled provider step.
 *
 * Exhaustive cases: one command per writer, generations 0..1, two attempts per
 * command, all enabled interleavings through 18 actions, exact-state BFS merging.
 * Seeded cases: two commands per writer, input generations 0..2 (accepted
 * generation at most 3), at most four accepted slots and eight sent requests,
 * 64 scheduler actions. Only the modeled add/takeover/retry/fault lifecycle is
 * covered, not Runtime/extension/host conformance.
 * Each run prints actual state/action/frontier counts; failures include a replay
 * trace. No snapshots, payload failures, byte corruption, reclamation protocol,
 * lease clocks, real provider behavior, or external dispatch is proved here.
 */
type Command = {
  readonly id: string
  readonly kind: "add" | "takeover"
  readonly generation: number
  readonly amount: number
}
type Receipt = {
  readonly commandId: string
  readonly inputDigest: string
  readonly slot: number
  readonly generation: number
  readonly total: number
}
type Proposal = {
  readonly token: string
  readonly command: Command
  readonly slot: number
  readonly parent: number
  readonly beforeGeneration: number
  readonly beforeTotal: number
  readonly receipt: Receipt
}
type Phase = "read" | "prepared" | "waiting" | "unknown" | "retry" | "confirmed"
type Writer = {
  at: number
  attempts: number
  phase: Phase
  draft: Proposal | null
  evidence: Proposal | null
  checkedMissing: boolean
}
type Request = { readonly writer: number; readonly at: number; readonly draft: Proposal; pending: boolean }
type Acknowledgement = { readonly command: Command; readonly receipt: Receipt; readonly evidence: Proposal | null }
type Model = {
  writers: Array<Writer>
  requests: Array<Request>
  slots: Array<Proposal | null>
  accepted: Array<Proposal>
  acknowledgements: Array<Acknowledgement>
  rejected: Array<{ readonly command: Command; readonly reason: "fenced" | "input-conflict" }>
  deletionRequested: boolean
}
type Program = readonly [ReadonlyArray<Command>, ReadonlyArray<Command>]
type ActionKind =
  | "decide"
  | "send"
  | "publish"
  | "publish-lost"
  | "timeout"
  | "cancel"
  | "reconcile"
  | "retry"
  | "ack"
  | "request-delete"
type Action = { readonly kind: ActionKind; readonly actor: number }
type Mutation =
  | "none"
  | "overwrite"
  | "gap"
  | "stale-rebase"
  | "ignore-fence"
  | "identity-only"
  | "bad-digest"
  | "premature-ack"
  | "delete"
const bounds = { depth: 18, attempts: 2, states: 250_000 } as const
const inputDigest = (command: Command) => JSON.stringify([command.kind, command.generation, command.amount])
const add = (id: string, amount = 1, generation = 0): Command => ({ id, kind: "add", amount, generation })
const takeover = (id: string, generation = 0): Command => ({ id, kind: "takeover", generation, amount: 0 })
const initial = (): Model => ({
  writers: Array.from(
    { length: 2 },
    (): Writer => ({ at: 0, attempts: 0, phase: "read", draft: null, evidence: null, checkedMissing: false }),
  ),
  requests: [],
  slots: [],
  accepted: [],
  acknowledgements: [],
  rejected: [],
  deletionRequested: false,
})
const finish = (writer: Writer) => {
  writer.at += 1
  writer.attempts = 0
  writer.phase = "read"
  writer.draft = null
  writer.evidence = null
  writer.checkedMissing = false
}
const enabled = (model: Model, program: Program): Array<Action> => {
  const actions: Array<Action> = []
  model.writers.forEach((writer, actor) => {
    if (writer.at >= program[actor]!.length) return
    const command = program[actor]![writer.at]!
    switch (writer.phase) {
      case "read":
      case "retry":
        // Resolving an already accepted receipt does not consume a create attempt.
        if (writer.attempts < bounds.attempts || model.slots.some((slot) => slot?.command.id === command.id))
          actions.push({ kind: "decide", actor })
        break
      case "prepared":
        actions.push({ kind: "send", actor })
        break
      case "waiting":
        actions.push({ kind: "timeout", actor }, { kind: "cancel", actor })
        break
      case "unknown":
        if (!writer.checkedMissing || model.slots[writer.draft!.slot] != null)
          actions.push({ kind: "reconcile", actor })
        if (writer.checkedMissing && writer.attempts < bounds.attempts) actions.push({ kind: "retry", actor })
        break
      case "confirmed":
        actions.push({ kind: "ack", actor })
        break
    }
  })
  model.requests.forEach((request, actor) => {
    if (request.pending) actions.push({ kind: "publish", actor }, { kind: "publish-lost", actor })
  })
  if (!model.deletionRequested && model.slots.some((slot) => slot !== null))
    actions.push({ kind: "request-delete", actor: 0 })
  return actions
}

// The transition system under test. Each negative control changes one plausible rule.
// oxlint-disable-next-line complexity -- The exhaustive finite-state transition intentionally enumerates every protocol action and negative control in one oracle.
const step = (previous: Model, program: Program, action: Action, mutation: Mutation = "none"): Model => {
  const model: Model = {
    ...previous,
    writers: previous.writers.map((writer) => ({ ...writer })),
    requests: previous.requests.map((request) => ({ ...request })),
    slots: previous.slots.slice(),
    accepted: previous.accepted.slice(),
    acknowledgements: previous.acknowledgements.slice(),
    rejected: previous.rejected.slice(),
  }
  if (action.kind === "request-delete") {
    model.deletionRequested = true
    if (mutation === "delete") model.slots[0] = null
    return model
  }
  if (action.kind === "publish" || action.kind === "publish-lost") {
    const request = model.requests[action.actor]!
    request.pending = false
    const draft = request.draft
    const created = model.slots[draft.slot] == null || mutation === "overwrite"
    if (created) {
      while (model.slots.length <= draft.slot) model.slots.push(null)
      model.slots[draft.slot] = draft
      // Audit evidence is never removed, even by the deletion mutant.
      model.accepted.push(draft)
    }
    const writer = model.writers[request.writer]!
    if (writer.at === request.at && writer.draft?.token === draft.token && writer.phase === "waiting") {
      if (action.kind === "publish-lost") writer.phase = "unknown"
      else if (created) {
        writer.phase = "confirmed"
        writer.evidence = draft
      } else writer.phase = "retry"
    }
    return model
  }
  const writer = model.writers[action.actor]!
  const command = program[action.actor]![writer.at]!
  switch (action.kind) {
    case "decide": {
      const existing = model.slots.find((slot) => slot?.command.id === command.id)
      if (existing != null) {
        if (inputDigest(existing.command) !== inputDigest(command) && mutation !== "identity-only") {
          model.rejected.push({ command, reason: "input-conflict" })
          finish(writer)
        } else {
          writer.phase = "confirmed"
          writer.evidence = existing
          writer.draft = existing
        }
        break
      }
      let next = 0
      while (model.slots[next] != null) next += 1
      const head = next === 0 ? null : model.slots[next - 1]!
      const generation = head?.receipt.generation ?? 0
      const total = head?.receipt.total ?? 0
      if (
        command.generation !== generation &&
        mutation !== "ignore-fence" &&
        !(mutation === "stale-rebase" && writer.draft !== null)
      ) {
        model.rejected.push({ command, reason: "fenced" })
        finish(writer)
        break
      }
      const slot = next + (mutation === "gap" ? 1 : 0)
      const receipt: Receipt = {
        commandId: command.id,
        inputDigest: mutation === "bad-digest" ? "wrong-input" : inputDigest(command),
        slot,
        generation: command.kind === "takeover" ? generation + 1 : generation,
        total: command.kind === "add" ? total + command.amount : total,
      }
      const stale = mutation === "stale-rebase" ? writer.draft : null
      writer.attempts += 1
      writer.draft = {
        token: `${action.actor}:${writer.at}:${writer.attempts}`,
        command,
        slot,
        parent: next - 1,
        beforeGeneration: stale?.beforeGeneration ?? generation,
        beforeTotal: stale?.beforeTotal ?? total,
        receipt: stale === null ? receipt : { ...stale.receipt, slot },
      }
      writer.phase = "prepared"
      writer.evidence = null
      writer.checkedMissing = false
      break
    }
    case "send":
      model.requests.push({ writer: action.actor, at: writer.at, draft: writer.draft!, pending: true })
      writer.phase = "waiting"
      break
    case "timeout":
    case "cancel":
      // Cancellation only changes client knowledge. The provider request survives.
      writer.phase = "unknown"
      break
    case "reconcile": {
      const found = model.slots[writer.draft!.slot]
      if (found == null) {
        writer.checkedMissing = true
        if (mutation === "premature-ack") writer.phase = "confirmed"
      } else if (found.command.id === command.id && inputDigest(found.command) === inputDigest(command)) {
        writer.phase = "confirmed"
        writer.evidence = found
      } else writer.phase = "retry"
      break
    }
    case "retry":
      writer.phase = "read"
      break
    case "ack":
      model.acknowledgements.push({
        command,
        receipt: (writer.evidence ?? writer.draft)!.receipt,
        evidence: writer.evidence,
      })
      finish(writer)
      break
  }
  return model
}

// Separate oracle: derive expectations solely from accepted command inputs and
// immutable provider/response evidence, not the decision routine's output state.
const violations = (model: Model): Array<string> => {
  const failures = new Set<string>()
  const won = new Set<number>()
  const identities = new Set<string>()
  let generation = 0
  let total = 0
  model.accepted.forEach((record, index) => {
    if (won.has(record.slot)) failures.add("unique-slot-winner")
    won.add(record.slot)
    if (record.slot !== index || record.parent !== index - 1) failures.add("contiguous-prefix")
    if (model.slots[record.slot]?.token !== record.token) failures.add("no-slot-deletion-or-recreation")
    if (identities.has(record.command.id)) failures.add("one-receipt-per-identity")
    identities.add(record.command.id)
    if (record.command.generation !== generation) failures.add("no-old-generation-acceptance")
    if (record.beforeGeneration !== generation || record.beforeTotal !== total)
      failures.add("fresh-deterministic-decision")
    if (record.command.kind === "takeover") generation += 1
    else total += record.command.amount
    const expected: Receipt = {
      commandId: record.command.id,
      inputDigest: inputDigest(record.command),
      slot: index,
      generation,
      total,
    }
    if (JSON.stringify(record.receipt) !== JSON.stringify(expected))
      failures.add("exact-receipt-identity-digest-and-result")
  })
  if (model.slots.length !== model.accepted.length || model.slots.some((slot) => slot === null))
    failures.add("contiguous-prefix")
  for (const acknowledgement of model.acknowledgements) {
    const { command, receipt, evidence } = acknowledgement
    if (evidence === null || !model.accepted.some((record) => record.token === evidence.token))
      failures.add("no-ack-on-unresolved-publication")
    const original = model.accepted.find((record) => record.command.id === command.id)
    if (
      original === undefined ||
      receipt.commandId !== command.id ||
      receipt.inputDigest !== inputDigest(command) ||
      JSON.stringify(receipt) !== JSON.stringify(original.receipt)
    ) {
      failures.add("exact-receipt-identity-digest-and-result")
    }
    if (
      evidence !== null &&
      (evidence.command.id !== command.id || inputDigest(evidence.command) !== inputDigest(command))
    )
      failures.add("exact-receipt-identity-digest-and-result")
  }
  return [...failures]
}

type Node = { readonly state: Model; readonly parent: number; readonly action: Action | null; readonly depth: number }
type Counterexample = { readonly failures: ReadonlyArray<string>; readonly trace: ReadonlyArray<Action> }
const traceTo = (nodes: ReadonlyArray<Node>, index: number): Array<Action> => {
  const trace: Array<Action> = []
  let current = index
  while (current > 0) {
    const node = nodes[current]!
    trace.push(node.action!)
    current = node.parent
  }
  return trace.toReversed()
}
const explore = (program: Program, mutation: Mutation = "none") => {
  const nodes: Array<Node> = [{ state: initial(), parent: -1, action: null, depth: 0 }]
  const visited = new Set([JSON.stringify(nodes[0]!.state)])
  const actions: Partial<Record<ActionKind, number>> = {}
  let transitions = 0
  let frontier = 0
  let terminal = 0
  let unresolved = 0
  let maxDepth = 0
  let counterexample: Counterexample | null = null
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    maxDepth = Math.max(maxDepth, node.depth)
    const nextActions = enabled(node.state, program)
    if (nextActions.length === 0) terminal += 1
    if (node.state.writers.some((writer) => writer.phase === "unknown")) unresolved += 1
    if (node.depth === bounds.depth) {
      if (nextActions.length > 0) frontier += 1
      continue
    }
    for (const action of nextActions) {
      transitions += 1
      actions[action.kind] = (actions[action.kind] ?? 0) + 1
      const state = step(node.state, program, action, mutation)
      const failures = violations(state)
      if (failures.length > 0) {
        counterexample = { failures, trace: [...traceTo(nodes, index), action] }
        return { states: nodes.length, transitions, frontier, terminal, unresolved, maxDepth, actions, counterexample }
      }
      const key = JSON.stringify(state)
      if (visited.has(key)) continue
      if (visited.size >= bounds.states) {
        throw new Error(
          `Model state guard exhausted; NOT an exhaustive result: ${JSON.stringify({ program, mutation, bounds, transitions, trace: [...traceTo(nodes, index), action] })}`,
        )
      }
      visited.add(key)
      nodes.push({ state, parent: index, action, depth: node.depth + 1 })
    }
  }
  return { states: nodes.length, transitions, frontier, terminal, unresolved, maxDepth, actions, counterexample }
}
const replay = (program: Program, trace: ReadonlyArray<Action>, mutation: Mutation = "none") => {
  let state = initial()
  for (const action of trace) {
    if (
      !enabled(state, program).some((candidate) => candidate.kind === action.kind && candidate.actor === action.actor)
    ) {
      throw new Error(`Disabled model action: ${JSON.stringify({ program, action, trace })}`)
    }
    state = step(state, program, action, mutation)
  }
  return state
}
// oxlint-disable-next-line anti-slop/no-unknown-parameters, effecttsgo/global-console -- This finite-model oracle emits arbitrary diagnostic evidence only when a test fails.
const evidence = (name: string, value: unknown) => console.info(`[protocol-model] ${name} ${JSON.stringify(value)}`)
const cases: ReadonlyArray<{ readonly name: string; readonly program: Program }> = [
  { name: "distinct-adds", program: [[add("a", 1)], [add("b", 2)]] },
  { name: "takeover-versus-old-owner", program: [[add("old", 1)], [takeover("new-owner")]] },
  { name: "exact-identity-retry", program: [[add("same")], [add("same")]] },
  { name: "identity-input-conflict", program: [[add("same", 1)], [add("same", 2)]] },
]
const random = (seed: number) => {
  let state = seed >>> 0
  return (limit: number) => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
}
const seededProgram = (next: (limit: number) => number): Program => {
  const commands = Array.from({ length: 4 }, () => {
    const id = `command-${next(3)}`
    const generation = next(3)
    return next(3) === 0 ? takeover(id, generation) : add(id, next(2) + 1, generation)
  })
  return [commands.slice(0, 2), commands.slice(2)]
}

describe("independent bounded numbered-slot protocol model", () => {
  for (const scenario of cases) {
    it(`enumerates every enabled interleaving: ${scenario.name}`, () => {
      const result = explore(scenario.program)
      evidence(scenario.name, {
        assumptions: "atomic-create, strong-read/list, immutable-payloads, retained-slots, no-fairness",
        bounds,
        program: scenario.program,
        ...result,
      })
      if (result.counterexample !== null)
        throw new Error(JSON.stringify({ program: scenario.program, ...result.counterexample }))
      // Coverage is about modeled transitions, not incidental implementation calls.
      for (const kind of [
        "publish",
        "publish-lost",
        "timeout",
        "cancel",
        "reconcile",
        "retry",
        "ack",
        "request-delete",
      ] as const) {
        expect(result.actions[kind], `${scenario.name}: missing ${kind}`).toBeGreaterThan(0)
      }
      expect(result.terminal).toBeGreaterThan(0)
      expect(result.unresolved).toBeGreaterThan(0)
    }, 30_000)
  }

  const mutants: ReadonlyArray<{ readonly mutation: Mutation; readonly scenario: number; readonly detects: string }> = [
    { mutation: "overwrite", scenario: 0, detects: "unique-slot-winner" },
    { mutation: "gap", scenario: 0, detects: "contiguous-prefix" },
    { mutation: "stale-rebase", scenario: 0, detects: "fresh-deterministic-decision" },
    { mutation: "ignore-fence", scenario: 1, detects: "no-old-generation-acceptance" },
    { mutation: "identity-only", scenario: 3, detects: "exact-receipt-identity-digest-and-result" },
    { mutation: "bad-digest", scenario: 0, detects: "exact-receipt-identity-digest-and-result" },
    { mutation: "premature-ack", scenario: 0, detects: "no-ack-on-unresolved-publication" },
    { mutation: "delete", scenario: 0, detects: "no-slot-deletion-or-recreation" },
  ]
  for (const mutant of mutants) {
    it(`rejects the ${mutant.mutation} negative control with a reproducible trace`, () => {
      const program = cases[mutant.scenario]!.program
      const result = explore(program, mutant.mutation)
      const counterexample = result.counterexample
      evidence(`negative-control:${mutant.mutation}`, { bounds, program, ...result })
      expect(counterexample, `No counterexample for ${mutant.mutation}`).not.toBeNull()
      expect(counterexample!.failures).toContain(mutant.detects)
      expect(violations(replay(program, counterexample!.trace, mutant.mutation))).toContain(mutant.detects)
    })
  }

  it("retains slots against a cancelled delayed writer; deletion permits recreation", () => {
    const program = cases[0]!.program
    const trace: Array<Action> = [
      { kind: "decide", actor: 0 },
      { kind: "send", actor: 0 },
      { kind: "cancel", actor: 0 },
      { kind: "decide", actor: 1 },
      { kind: "send", actor: 1 },
      { kind: "publish", actor: 1 },
      { kind: "ack", actor: 1 },
      { kind: "request-delete", actor: 0 },
      { kind: "publish-lost", actor: 0 },
    ]
    const retained = replay(program, trace)
    expect(violations(retained)).toEqual([])
    expect(retained.accepted.map((record) => record.command.id)).toEqual(["b"])
    expect(retained.writers[0]!.phase).toBe("unknown")
    expect(retained.acknowledgements.map((ack) => ack.command.id)).toEqual(["b"])
    // Deliberately continue AFTER the first invalid deletion to expose the ABA
    // recreation hazard; the invariant checker ordinarily stops at deletion.
    const recreated = replay(program, trace, "delete")
    expect(violations(recreated)).toContain("unique-slot-winner")
    expect(violations(recreated)).toContain("no-slot-deletion-or-recreation")
    expect(recreated.accepted.map((record) => [record.slot, record.command.id])).toEqual([
      [0, "b"],
      [0, "a"],
    ])
    evidence("cancelled-delayed-create-versus-deletion", { program, trace, failures: violations(recreated) })
  })

  it("reconciles a fresh same-ID retry without cancelling the original provider request", () => {
    const program = cases[0]!.program
    const prefix: Array<Action> = [
      { kind: "decide", actor: 0 },
      { kind: "send", actor: 0 },
      { kind: "timeout", actor: 0 },
      { kind: "reconcile", actor: 0 },
      { kind: "retry", actor: 0 },
      { kind: "decide", actor: 0 },
      { kind: "send", actor: 0 },
    ]
    const unresolved = replay(program, prefix)
    expect(unresolved.requests.map((request) => request.pending)).toEqual([true, true])
    expect(unresolved.acknowledgements).toEqual([])
    for (const winner of [0, 1]) {
      const trace: Array<Action> = [
        ...prefix,
        { kind: "publish-lost", actor: winner },
        ...(winner === 0 ? [{ kind: "cancel" as const, actor: 0 }] : []),
        { kind: "reconcile", actor: 0 },
        { kind: "ack", actor: 0 },
        { kind: "publish", actor: 1 - winner },
      ]
      const settled = replay(program, trace)
      expect(violations(settled)).toEqual([])
      expect(settled.accepted.map((record) => record.command.id)).toEqual(["a"])
      expect(settled.acknowledgements.map((ack) => ack.receipt)).toEqual([
        {
          commandId: "a",
          inputDigest: '["add",0,1]',
          slot: 0,
          generation: 0,
          total: 1,
        },
      ])
      evidence("fresh-retry-with-old-request-pending", { winner, program, trace })
    }
  })

  it("generates only modeled command and transport lifecycles from reproducible seeds", () => {
    const seeds = [
      1, 7, 19, 42, 99, 257, 1024, 4093, 65537, 0x12345678, 0x5eed, 0x7fffffff, 0x80000001, 0xabcdef01, 0xfffffffe,
      0xffffffff,
    ]
    const results = seeds.map((seed) => {
      const next = random(seed)
      const program = seededProgram(next)
      const trace: Array<Action> = []
      let state = initial()
      for (let index = 0; index < 64; index += 1) {
        const actions = enabled(state, program)
        if (actions.length === 0) break
        const action = actions[next(actions.length)]!
        trace.push(action)
        state = step(state, program, action)
        const failures = violations(state)
        if (failures.length > 0) throw new Error(JSON.stringify({ seed, program, failures, trace }))
      }
      expect(replay(program, trace)).toEqual(state)
      return {
        seed,
        actions: trace.length,
        accepted: state.accepted.length,
        pending: state.requests.filter((request) => request.pending).length,
        enabledAtEnd: enabled(state, program).length,
      }
    })
    evidence("seeded-model-only-lifecycles", {
      commandsPerWriter: 2,
      maxActions: 64,
      maxAttempts: bounds.attempts,
      results,
    })
  })
})

// Public make/read/commit bridge. No production record decoding, apply function,
// digest helper, or implementation-generated state hash is an expected value.
const identity = { environment: "protocol-model", tenant: "tenant", partition: "partition" }
const open = (client: Client) => makeJournal(identity).pipe(Effect.provideService(ObjectStore, client.store))
const realInput = (command: Command) => ({ kind: command.kind, generation: command.generation, amount: command.amount })
const numberFromState = (value: Json | undefined) =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Finite)(value), () => 0)
const submit = (journal: Journal, command: Command) =>
  journal.commit({ id: command.id, input: realInput(command) }, (state: State) => {
    const generation = numberFromState(state.generation)
    const total = numberFromState(state.total)
    if (command.generation !== generation) return Effect.fail("stale-generation" as const)
    const nextGeneration = generation + (command.kind === "takeover" ? 1 : 0)
    const nextTotal = total + (command.kind === "add" ? command.amount : 0)
    return Effect.succeed({
      patches: [
        { op: "set" as const, path: ["generation"], value: nextGeneration },
        { op: "set" as const, path: ["total"], value: nextTotal },
      ],
      receipt: { commandId: command.id, input: realInput(command), generation: nextGeneration, total: nextTotal },
    })
  })
const expectedOutcome = (accepted: ReadonlyArray<Command>) => {
  // Whole-history arithmetic oracle, intentionally not the live reducer above.
  const receipts = accepted.map((command, index) => ({
    commandId: command.id,
    input: realInput(command),
    generation: accepted.slice(0, index + 1).filter((item) => item.kind === "takeover").length,
    total: accepted.slice(0, index + 1).reduce((sum, item) => sum + (item.kind === "add" ? item.amount : 0), 0),
  }))
  const last = receipts[receipts.length - 1]
  return {
    receipts,
    state: { generation: last?.generation ?? 0, total: last?.total ?? 0 },
    sequence: String(accepted.length - 1),
  }
}
const firstSlot = "environments/protocol-model/v1/tenants/tenant/partitions/partition/commits/00000000000000000000.json"

describe("numbered-slot model / real JournalEngine boundary", () => {
  it.effect("matches independent serial arithmetic after a delayed writer loses and redecides", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* open(bucket)
      const second = yield* open(yield* bucket.connect)
      const a = add("a", 1)
      const b = add("b", 2)
      const pause = yield* bucket.faults.pauseNextCreate(firstSlot)
      const pending = yield* submit(first, a).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      const expected = expectedOutcome([b, a])
      expect(yield* submit(second, b)).toEqual(expected.receipts[0])
      yield* pause.release
      expect(yield* Fiber.join(pending)).toEqual(expected.receipts[1])
      const recovered = yield* open(yield* bucket.connect)
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
      expect(yield* submit(recovered, a)).toEqual(expected.receipts[1])
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("keeps a cancelled provider create alive without overwriting an independent winner", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const oldWriter = yield* open(bucket)
      const winnerWriter = yield* open(yield* bucket.connect)
      const old = add("cancelled-old", 5)
      const winner = add("independent-winner", 3)
      const expected = expectedOutcome([winner, old])
      const afterWinner = expectedOutcome([winner])
      const dispatch = yield* bucket.faults.dispatchNextCreate(firstSlot)
      const cancelled = yield* submit(oldWriter, old).pipe(Effect.forkChild({ startImmediately: true }))
      yield* dispatch.entered
      yield* Fiber.interrupt(cancelled)
      expect(yield* submit(winnerWriter, winner)).toEqual(expected.receipts[0])
      yield* dispatch.release
      expect(yield* dispatch.completed).toBe("conflict")
      const recovered = yield* open(yield* bucket.connect)
      const beforeRetry = yield* recovered.read
      expect(beforeRetry.sequence).toBe(afterWinner.sequence)
      expect(beforeRetry.state).toEqual(afterWinner.state)
      expect(yield* submit(recovered, winner)).toEqual(expected.receipts[0])
      expect(yield* submit(recovered, old)).toEqual(expected.receipts[1])
      const head = yield* recovered.read
      expect(head.sequence).toBe(expected.sequence)
      expect(head.state).toEqual(expected.state)
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("keeps a cancelled provider create when it wins before a later takeover", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const oldWriter = yield* open(bucket)
      const nextWriter = yield* open(yield* bucket.connect)
      const old = add("cancelled-old-first", 4)
      const takeoverCommand = takeover("new-owner")
      const expected = expectedOutcome([old, takeoverCommand])
      const dispatch = yield* bucket.faults.dispatchNextCreate(firstSlot)
      const cancelled = yield* submit(oldWriter, old).pipe(Effect.forkChild({ startImmediately: true }))
      yield* dispatch.entered
      yield* Fiber.interrupt(cancelled)
      yield* dispatch.release
      expect(yield* dispatch.completed).toBe("created")
      expect(yield* submit(nextWriter, takeoverCommand)).toEqual(expected.receipts[1])
      const recovered = yield* open(yield* bucket.connect)
      const head = yield* recovered.read
      expect(head.sequence).toBe(expected.sequence)
      expect(head.state).toEqual(expected.state)
      expect(yield* submit(recovered, old)).toEqual(expected.receipts[0])
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("rejects a delayed old-generation decision after takeover before accepting new-generation work", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const old = yield* open(bucket)
      const current = yield* open(yield* bucket.connect)
      const changeOwner = takeover("takeover")
      const work = add("new-work", 3, 1)
      const pause = yield* bucket.faults.pauseNextCreate(firstSlot)
      const pending = yield* submit(old, add("stale", 100)).pipe(
        Effect.flip,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* pause.entered
      const expected = expectedOutcome([changeOwner, work])
      expect(yield* submit(current, changeOwner)).toEqual(expected.receipts[0])
      yield* pause.release
      expect(yield* Fiber.join(pending)).toBe("stale-generation")
      expect(yield* submit(current, work)).toEqual(expected.receipts[1])
      const recovered = yield* open(yield* bucket.connect)
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
      expect(yield* submit(recovered, add("stale", 100)).pipe(Effect.flip)).toBe("stale-generation")
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("resolves a successful lost acknowledgement to the exact original input and receipt", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      const command = add("lost", 7)
      const expected = expectedOutcome([command])
      yield* bucket.faults.failNextCreate({ key: firstSlot, phase: "after" })
      expect(yield* submit(journal, command)).toEqual(expected.receipts[0])
      const recovered = yield* open(yield* bucket.connect)
      expect(yield* submit(recovered, command)).toEqual(expected.receipts[0])
      const conflict = yield* submit(recovered, add("lost", 8)).pipe(Effect.flip)
      expect(conflict).toMatchObject({ reason: "input-conflict" })
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("returns indeterminate rather than an acknowledgement when publication cannot be resolved", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      const command = add("unknown", 4)
      const expected = expectedOutcome([command])
      yield* bucket.faults.failNextCreate({ key: firstSlot, phase: "after" })
      yield* bucket.faults.failNextRead({ key: firstSlot })
      const unresolved = yield* submit(journal, command).pipe(Effect.flip)
      expect(unresolved).toMatchObject({ reason: "indeterminate", commandId: command.id })
      const recovered = yield* open(yield* bucket.connect)
      expect(yield* submit(recovered, command)).toEqual(expected.receipts[0])
      expect(yield* recovered.read).toMatchObject({ state: expected.state, sequence: expected.sequence })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )
})
