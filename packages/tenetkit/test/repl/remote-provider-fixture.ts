import { Deferred, Effect, Exit, Ref, Stream, SynchronizedRef } from "effect"
import type { ConnectionLoss, RemoteHarness } from "../../src/test/repl/kernel-provider.js"
import {
  CellExecutionFailed,
  CellOutcomeUnknown,
  type CellEvent,
  type CellFailure,
  type CellResult,
  KernelUnavailable,
  type RestartReason,
} from "../../src/repl/cell.js"
import type {
  Binding,
  Execution,
  Service as KernelPool,
  Inspection,
  Interruption,
  Restart,
} from "../../src/repl/kernel-pool.js"
import {
  bindingsDigest,
  type CheckpointKind,
  digest,
  type KernelProfile as Profile,
  make as makeKernelProfile,
} from "../../src/repl/kernel-profile.js"
import type { Claim, CommandClaim, Service as ResourceStore, Lease } from "../../src/repl/kernel-resource-store.js"
import { TestKernel } from "../../src/repl/index.js"

interface NamespaceValue {
  readonly value: string
  readonly type: string
  readonly snapshotable: boolean
}

interface ProviderResource {
  readonly resourceId: string
  readonly profileDigest: string
  readonly epoch: number
  readonly state: "live" | "paused"
  readonly recovery: CheckpointKind
  readonly namespace: ReadonlyMap<string, NamespaceValue>
}

interface ActiveCell {
  readonly command: CommandClaim
  readonly result: Deferred.Deferred<CellResult, CellFailure>
}

interface ProviderState {
  readonly nextResource: number
  readonly resources: ReadonlyMap<string, ProviderResource>
  readonly active: ReadonlyMap<string, ActiveCell>
  readonly executions: ReadonlyMap<string, number>
  readonly failDeletion: boolean
  readonly connectionLoss: ConnectionLoss | undefined
}

const initialProviderState: ProviderState = {
  nextResource: 0,
  resources: new Map(),
  active: new Map(),
  executions: new Map(),
  failDeletion: false,
  connectionLoss: undefined,
}

interface HostState {
  readonly claims: ReadonlyMap<string, Claim>
  readonly controls: number
}

const initialHostState: HostState = { claims: new Map(), controls: 0 }

interface RecoveryPrelude {
  readonly reason: RestartReason
  readonly recovery: "live-process" | "filesystem" | "namespace" | "restart-only"
  readonly restored: ReadonlyArray<string>
  readonly dropped: ReadonlyArray<string>
}

interface ReadyResource {
  readonly lease: Lease
  readonly resource: ProviderResource
  readonly prelude?: RecoveryPrelude
}

const unavailable = (sessionId: string, reason: KernelUnavailable["reason"], message: string): KernelUnavailable =>
  KernelUnavailable.make({ sessionId, reason, message })

const mapAuthorityFailure = (sessionId: string, message = "the kernel resource claim is stale") =>
  Effect.mapError(() => unavailable(sessionId, "lease-lost", message))

const commandClaim = (claim: Claim, resource: ProviderResource, cellId: string): CommandClaim => ({
  ...claim,
  epoch: resource.epoch,
  profileDigest: resource.profileDigest,
  cellId,
})

const executionKey = (sessionId: string, cellId: string): string => `${sessionId}\u0000${cellId}`

const bindingsOf = (resource: ProviderResource): ReadonlyArray<Binding> =>
  Array.from(resource.namespace, ([name, binding]) => ({
    name,
    type: binding.type,
    snapshotable: binding.snapshotable,
  })).toSorted((left, right) => left.name.localeCompare(right.name))

const account = (resource: ProviderResource) => ({
  restored: Array.from(resource.namespace)
    .filter(([, value]) => value.snapshotable)
    .map(([name]) => name)
    .toSorted(),
  dropped: Array.from(resource.namespace)
    .filter(([, value]) => !value.snapshotable)
    .map(([name]) => name)
    .toSorted(),
})

const restoredNamespace = (resource: ProviderResource): ReadonlyMap<string, NamespaceValue> =>
  new Map(Array.from(resource.namespace).filter(([, value]) => value.snapshotable))

const declareBindings = (
  code: string,
  namespace: ReadonlyMap<string, NamespaceValue>,
): ReadonlyMap<string, NamespaceValue> => {
  const next = new Map(namespace)
  for (const match of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)/g)) {
    next.set(match[1]!, { value: match[2]!, type: "Number", snapshotable: true })
  }
  for (const match of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+AbortController\(\)/g)) {
    next.set(match[1]!, { value: "AbortController", type: "AbortController", snapshotable: false })
  }
  const globalAssignment = /globalThis\.([A-Za-z_$][\w$]*)\s*=\s*(\d+)/.exec(code)
  if (globalAssignment !== null) {
    next.set(globalAssignment[1]!, { value: globalAssignment[2]!, type: "Number", snapshotable: true })
  }
  return next
}

const evaluateValue = (code: string, namespace: ReadonlyMap<string, NamespaceValue>): string => {
  const trimmed = code.trim()
  if (trimmed.includes("console.log") && trimmed.includes("6 * 7")) return "42"
  const multiplication = /^(\d+)\s*\*\s*(\d+)$/.exec(trimmed)
  if (multiplication !== null) return String(Number(multiplication[1]) * Number(multiplication[2]))
  const addition = /^([A-Za-z_$][\w$]*)\s*\+\s*(\d+)$/.exec(trimmed)
  if (addition !== null) return String(Number(namespace.get(addition[1]!)?.value ?? 0) + Number(addition[2]))
  if (/^\d+$/.test(trimmed)) return trimmed
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return namespace.get(trimmed)?.value ?? "undefined"
  return "undefined"
}

const preludeEvents = (
  sessionId: string,
  cellId: string,
  epoch: number,
  prelude: RecoveryPrelude | undefined,
): Array<CellEvent> => {
  if (prelude === undefined) return []
  const events: Array<CellEvent> = [
    { _tag: "KernelRestarted", cellId, sequence: 0, sessionId, epoch, reason: prelude.reason },
  ]
  if (prelude.restored.length > 0) {
    events.push({
      _tag: "StateRestored",
      cellId,
      sequence: events.length,
      epoch,
      names: prelude.restored,
      restoredBySource: [],
    })
  }
  if (prelude.dropped.length > 0) {
    events.push({
      _tag: "StateLost",
      cellId,
      sequence: events.length,
      epoch,
      droppedNames: prelude.dropped,
      reason: "live-handle",
    })
  }
  return events
}

const makeProfile = (imageDigest: string): Profile =>
  makeKernelProfile({
    provider: "hosted-fixture",
    runtime: { name: "bun", version: "1.4.0", digest: "runtime-fixture" },
    image: { kind: "template", reference: `fixture:${imageDigest}`, digest: imageDigest },
    isolation: "microvm",
    checkpoints: { liveProcess: true, filesystem: true, namespace: true },
    bindingsDigest: bindingsDigest([]),
    workspace: { root: "/workspace", dataRoot: "/data" },
    limits: { sourceBytes: 65_536, cellDeadlineMillis: 5_000 },
  })

const makeRemotePool = (input: {
  readonly ownerId: string
  readonly profile: Profile
  readonly authority: ResourceStore
  readonly state: SynchronizedRef.SynchronizedRef<ProviderState>
}): Effect.Effect<KernelPool> =>
  Effect.gen(function* () {
    const host = yield* Ref.make(initialHostState)
    const profileDigest = digest(input.profile)

    const cachedClaim = (sessionId: string): Effect.Effect<Claim | undefined> =>
      Ref.get(host).pipe(Effect.map((state) => state.claims.get(sessionId)))

    const remember = (claim: Claim): Effect.Effect<void> =>
      Ref.update(host, (state) => ({ ...state, claims: new Map(state.claims).set(claim.sessionId, claim) }))

    const nextControlId = (sessionId: string): Effect.Effect<string> =>
      Ref.modify(host, (state) => {
        const controls = state.controls + 1
        return [`control:${input.ownerId}:${sessionId}:${controls}`, { ...state, controls }]
      })

    const providerResource = (resourceId: string): Effect.Effect<ProviderResource | undefined> =>
      SynchronizedRef.get(input.state).pipe(Effect.map((state) => state.resources.get(resourceId)))

    const addResource = (resource: Omit<ProviderResource, "resourceId">): Effect.Effect<ProviderResource> =>
      SynchronizedRef.modify(input.state, (state) => {
        const nextResource = state.nextResource + 1
        const created: ProviderResource = { ...resource, resourceId: `provider-resource-${nextResource}` }
        return [
          created,
          { ...state, nextResource, resources: new Map(state.resources).set(created.resourceId, created) },
        ]
      })

    const putResource = (resource: ProviderResource): Effect.Effect<void> =>
      SynchronizedRef.update(input.state, (state) => ({
        ...state,
        resources: new Map(state.resources).set(resource.resourceId, resource),
      }))

    const removeResource = (resourceId: string): Effect.Effect<void> =>
      SynchronizedRef.update(input.state, (state) => {
        const resources = new Map(state.resources)
        resources.delete(resourceId)
        return { ...state, resources }
      })

    const bind = (lease: Lease, resource: ProviderResource) =>
      input.authority
        .bind({
          claim: lease.claim,
          resource: {
            provider: input.profile.provider,
            resourceId: resource.resourceId,
            profileDigest: resource.profileDigest,
            epoch: resource.epoch,
            state: resource.state,
            checkpoint: resource.recovery,
          },
        })
        .pipe(mapAuthorityFailure(lease.claim.sessionId))

    const create = (
      lease: Lease,
      epoch: number,
      namespace: ReadonlyMap<string, NamespaceValue>,
      recovery: ProviderResource["recovery"],
    ): Effect.Effect<ProviderResource, KernelUnavailable> =>
      Effect.gen(function* () {
        const resource = yield* addResource({
          profileDigest,
          epoch,
          state: "live",
          recovery,
          namespace,
        })
        yield* bind(lease, resource)
        return resource
      })

    const ensure = (sessionId: string): Effect.Effect<ReadyResource, KernelUnavailable> =>
      Effect.gen(function* () {
        const cached = yield* cachedClaim(sessionId)
        const lease =
          cached === undefined
            ? yield* input.authority
                .acquire({
                  sessionId,
                  ownerId: input.ownerId,
                  provider: input.profile.provider,
                  profileDigest,
                  leaseMillis: 60_000,
                })
                .pipe(mapAuthorityFailure(sessionId))
            : yield* input.authority.renew(cached, 60_000).pipe(mapAuthorityFailure(sessionId))
        if (cached === undefined) yield* remember(lease.claim)
        if (lease.resource === undefined) {
          const resource = yield* create(lease, 0, new Map(), "restart-only")
          return { lease, resource }
        }
        const current = yield* providerResource(lease.resource.resourceId)
        if (current === undefined) {
          if (lease.resource.activeCell !== undefined) {
            yield* input.authority
              .finish({ claim: lease.claim, expectedCell: lease.resource.activeCell })
              .pipe(mapAuthorityFailure(sessionId))
          }
          const deletion = yield* input.authority.revoke(lease.claim).pipe(mapAuthorityFailure(sessionId))
          if (deletion === undefined)
            return yield* unavailable(sessionId, "start-failed", "missing-resource reconciliation lost its binding")
          yield* input.authority
            .confirmDeletion({ claim: lease.claim, expectedResource: deletion })
            .pipe(mapAuthorityFailure(sessionId))
          const unbound = yield* input.authority
            .inspect(sessionId)
            .pipe(
              Effect.mapError(() => unavailable(sessionId, "start-failed", "the resource authority is unavailable")),
            )
          if (unbound === undefined)
            return yield* unavailable(sessionId, "start-failed", "missing-resource reconciliation lost its lease")
          const resource = yield* create(unbound, lease.resource.epoch + 1, new Map(), "restart-only")
          return {
            lease: unbound,
            resource,
            prelude: { reason: "crashed", recovery: "restart-only", restored: [], dropped: [] },
          }
        }
        if (lease.resource.profileDigest !== profileDigest) {
          const previous = account(current)
          const deletion = yield* input.authority.revoke(lease.claim).pipe(mapAuthorityFailure(sessionId))
          if (deletion === undefined)
            return yield* unavailable(sessionId, "start-failed", "replacement lost its resource")
          yield* removeResource(current.resourceId)
          yield* input.authority
            .confirmDeletion({ claim: lease.claim, expectedResource: deletion })
            .pipe(mapAuthorityFailure(sessionId))
          const unbound = yield* input.authority
            .inspect(sessionId)
            .pipe(
              Effect.mapError(() => unavailable(sessionId, "start-failed", "the resource authority is unavailable")),
            )
          if (unbound === undefined) return yield* unavailable(sessionId, "start-failed", "replacement lost its lease")
          const resource = yield* create(unbound, current.epoch + 1, restoredNamespace(current), "namespace")
          return {
            lease: unbound,
            resource,
            prelude: { reason: "profile-changed", recovery: "namespace", ...previous },
          }
        }
        if (current.state === "paused") {
          const resumed: ProviderResource = { ...current, state: "live", recovery: "live-process" }
          yield* putResource(resumed)
          yield* bind(lease, resumed)
          return { lease, resource: resumed }
        }
        return { lease, resource: current }
      })

    const control = (
      sessionId: string,
      expectedCell?: CommandClaim,
    ): Effect.Effect<{ readonly ready: ReadyResource; readonly command: CommandClaim }, KernelUnavailable> =>
      Effect.gen(function* () {
        const ready = yield* ensure(sessionId)
        const command = commandClaim(ready.lease.claim, ready.resource, yield* nextControlId(sessionId))
        const admission =
          expectedCell === undefined
            ? { command, kind: "control" as const }
            : { command, kind: "control" as const, expectedCell }
        yield* input.authority.admit(admission).pipe(mapAuthorityFailure(sessionId))
        return { ready, command }
      })

    const finish = (claim: Claim, expectedCell: CommandClaim): Effect.Effect<void, KernelUnavailable> =>
      input.authority.finish({ claim, expectedCell }).pipe(mapAuthorityFailure(claim.sessionId))

    const completeExecution = (
      ready: ReadyResource,
      command: CommandClaim,
      code: string,
    ): Effect.Effect<Execution, KernelUnavailable> =>
      Effect.gen(function* () {
        const before = ready.resource
        const namespace = declareBindings(code, before.namespace)
        const updated = { ...before, namespace }
        yield* putResource(updated)
        yield* SynchronizedRef.update(input.state, (state) => ({
          ...state,
          executions: new Map(state.executions).set(
            executionKey(command.sessionId, command.cellId),
            (state.executions.get(executionKey(command.sessionId, command.cellId)) ?? 0) + 1,
          ),
        }))
        const prelude = preludeEvents(command.sessionId, command.cellId, command.epoch, ready.prelude)
        const events: Array<CellEvent> = [
          ...prelude,
          {
            _tag: "KernelReady",
            cellId: command.cellId,
            sequence: prelude.length,
            sessionId: command.sessionId,
            epoch: command.epoch,
            profileDigest: command.profileDigest,
          },
        ]
        let stdout = ""
        let stderr = ""
        if (code.includes("console.log")) {
          stdout = "alpha\n"
          events.push({ _tag: "Stdout", cellId: command.cellId, sequence: events.length, text: stdout })
        }
        if (code.includes("console.error")) {
          stderr = "beta\n"
          events.push({ _tag: "Stderr", cellId: command.cellId, sequence: events.length, text: stderr })
        }
        const value = evaluateValue(code, namespace)
        events.push({
          _tag: "Result",
          cellId: command.cellId,
          sequence: events.length,
          value,
          durationMillis: 0,
        })
        const result: CellResult = {
          cellId: command.cellId,
          epoch: command.epoch,
          sequence: events.length - 1,
          value,
          stdout,
          stderr,
          durationMillis: 0,
        }
        yield* finish(ready.lease.claim, command)
        return { events: Stream.fromIterable(events), result: Effect.succeed(result) }
      })

    return {
      execute: (request) =>
        Effect.gen(function* () {
          const loss = yield* SynchronizedRef.modify(input.state, (state) => [
            state.connectionLoss,
            { ...state, connectionLoss: undefined },
          ])
          if (loss === "before-admission") {
            return yield* unavailable(request.sessionId, "closed", "the transport closed before command admission")
          }
          const ready = yield* ensure(request.sessionId)
          const command = commandClaim(ready.lease.claim, ready.resource, request.cellId)
          yield* input.authority.admit({ command, kind: "cell" }).pipe(mapAuthorityFailure(request.sessionId))
          if (request.code.includes("new Promise(() => {})")) {
            const result = yield* Deferred.make<CellResult, CellFailure>()
            yield* SynchronizedRef.update(input.state, (state) => ({
              ...state,
              active: new Map(state.active).set(request.sessionId, { command, result }),
              executions: new Map(state.executions).set(
                executionKey(request.sessionId, request.cellId),
                (state.executions.get(executionKey(request.sessionId, request.cellId)) ?? 0) + 1,
              ),
            }))
            const events: ReadonlyArray<CellEvent> = [
              {
                _tag: "KernelReady",
                cellId: request.cellId,
                sequence: 0,
                sessionId: request.sessionId,
                epoch: command.epoch,
                profileDigest: command.profileDigest,
              },
            ]
            return { events: Stream.fromIterable(events), result: Deferred.await(result) }
          }
          if (loss === "after-admission") {
            yield* SynchronizedRef.update(input.state, (state) => ({
              ...state,
              executions: new Map(state.executions).set(
                executionKey(request.sessionId, request.cellId),
                (state.executions.get(executionKey(request.sessionId, request.cellId)) ?? 0) + 1,
              ),
            }))
            yield* finish(ready.lease.claim, command)
            const failure = CellOutcomeUnknown.make({
              sessionId: request.sessionId,
              cellId: request.cellId,
              epoch: command.epoch,
              reason: "transport-lost",
              message: "the command was admitted but no terminal response was proven",
            })
            return { events: Stream.empty, result: Effect.fail(failure) }
          }
          return yield* completeExecution(ready, command, request.code)
        }),
      inspect: (request) =>
        Effect.gen(function* () {
          const { ready } = yield* control(request.sessionId)
          const selected = bindingsOf(ready.resource)
          const inspection: Inspection = {
            sessionId: request.sessionId,
            epoch: ready.resource.epoch,
            profile: input.profile,
            recovery: ready.resource.recovery,
            bindings:
              request.name === undefined ? selected : selected.filter((binding) => binding.name === request.name),
          }
          return inspection
        }),
      interrupt: (sessionId, cellId) =>
        Effect.gen(function* () {
          const active = (yield* SynchronizedRef.get(input.state)).active.get(sessionId)
          const { ready } = yield* control(sessionId, active?.command)
          if (active === undefined || active.command.cellId !== cellId) {
            return { sessionId, cellId, _tag: "NotRunning" } satisfies Interruption
          }
          yield* Deferred.fail(
            active.result,
            CellExecutionFailed.make({
              cellId,
              epoch: active.command.epoch,
              sequence: 1,
              name: "AbortError",
              message: "the cell was interrupted",
              stdout: "",
              stderr: "",
              durationMillis: 0,
            }),
          )
          yield* finish(ready.lease.claim, active.command)
          yield* SynchronizedRef.update(input.state, (state) => {
            const running = new Map(state.active)
            running.delete(sessionId)
            return { ...state, active: running }
          })
          return { sessionId, cellId, _tag: "Interrupted" } satisfies Interruption
        }),
      restart: (sessionId, reason) =>
        Effect.gen(function* () {
          const { ready } = yield* control(sessionId)
          const previous = account(ready.resource)
          const deletion = yield* input.authority.revoke(ready.lease.claim).pipe(mapAuthorityFailure(sessionId))
          if (deletion === undefined) return yield* unavailable(sessionId, "closed", "the resource disappeared")
          yield* removeResource(ready.resource.resourceId)
          yield* input.authority
            .confirmDeletion({ claim: ready.lease.claim, expectedResource: deletion })
            .pipe(mapAuthorityFailure(sessionId))
          const unbound = yield* input.authority
            .inspect(sessionId)
            .pipe(
              Effect.mapError(() => unavailable(sessionId, "start-failed", "the resource authority is unavailable")),
            )
          if (unbound === undefined) return yield* unavailable(sessionId, "closed", "the lease disappeared")
          yield* create(unbound, ready.resource.epoch + 1, restoredNamespace(ready.resource), "namespace")
          const restart: Restart = {
            sessionId,
            epoch: ready.resource.epoch + 1,
            reason,
            recovery: "namespace",
            restoredNames: previous.restored,
            droppedNames: previous.dropped,
          }
          return restart
        }),
      close: (sessionId) =>
        Effect.gen(function* () {
          const { ready } = yield* control(sessionId)
          const deletion = yield* input.authority.revoke(ready.lease.claim).pipe(mapAuthorityFailure(sessionId))
          if (deletion === undefined) return
          const shouldFail = yield* SynchronizedRef.modify(input.state, (state) => [
            state.failDeletion,
            { ...state, failDeletion: false },
          ])
          if (shouldFail) {
            yield* input.authority
              .failDeletion({ claim: ready.lease.claim, expectedResource: deletion }, "fixture deletion failed")
              .pipe(mapAuthorityFailure(sessionId))
            return yield* unavailable(sessionId, "closed", "provider deletion failed and remains pending")
          }
          yield* removeResource(ready.resource.resourceId)
          yield* input.authority
            .confirmDeletion({ claim: ready.lease.claim, expectedResource: deletion })
            .pipe(mapAuthorityFailure(sessionId))
        }),
    }
  })

/** A deterministic hosted provider with two competing hosts and provider/storage fault controls. */
export const makeRemoteHarness: Effect.Effect<RemoteHarness> = Effect.gen(function* () {
  const authority: TestKernel.MemoryResourceStore = yield* TestKernel.makeMemoryResourceStore
  const state = yield* SynchronizedRef.make(initialProviderState)
  const profile = makeProfile("template-v1")
  const changedProfile = makeProfile("template-v2")
  const pool = yield* makeRemotePool({ ownerId: "host-a", profile, authority, state })
  const hostB = yield* makeRemotePool({ ownerId: "host-b", profile, authority, state })
  const changedProfileHost = yield* makeRemotePool({ ownerId: "host-c", profile: changedProfile, authority, state })

  const pause = (sessionId: string): Effect.Effect<boolean, CellFailure> =>
    Effect.gen(function* () {
      const lease = yield* authority
        .inspect(sessionId)
        .pipe(Effect.mapError(() => unavailable(sessionId, "closed", "the resource authority is unavailable")))
      const resource = lease?.resource
      if (lease === undefined || resource === undefined) return false
      const provider = (yield* SynchronizedRef.get(state)).resources.get(resource.resourceId)
      if (provider === undefined) return false
      const paused = { ...provider, state: "paused" as const, recovery: "live-process" as const }
      const result = yield* authority
        .bind({
          claim: lease.claim,
          resource: {
            provider: resource.provider,
            resourceId: resource.resourceId,
            profileDigest: resource.profileDigest,
            epoch: resource.epoch,
            state: "paused",
            checkpoint: "live-process",
          },
        })
        .pipe(Effect.exit)
      if (Exit.isFailure(result)) return false
      yield* SynchronizedRef.update(state, (current) => ({
        ...current,
        resources: new Map(current.resources).set(paused.resourceId, paused),
      }))
      return true
    })

  const retryCleanup: Effect.Effect<void, CellFailure> = Effect.gen(function* () {
    const pending = yield* authority.pendingDeletion.pipe(
      Effect.mapError(() => unavailable("cleanup", "closed", "the resource authority is unavailable")),
    )
    for (const lease of pending) {
      const resource = lease.resource
      if (resource === undefined) continue
      yield* SynchronizedRef.update(state, (current) => {
        const resources = new Map(current.resources)
        resources.delete(resource.resourceId)
        return { ...current, resources }
      })
      yield* authority
        .confirmDeletion({ claim: lease.claim, expectedResource: resource })
        .pipe(
          Effect.mapError(() => unavailable(lease.claim.sessionId, "closed", "cleanup retry lost resource authority")),
        )
    }
  })

  return {
    pool,
    hostB,
    changedProfileHost,
    profile,
    changedProfile,
    authority,
    resourceCount: SynchronizedRef.get(state).pipe(Effect.map((current) => current.resources.size)),
    expire: authority.expire,
    pause,
    loseNextConnection: (loss) => SynchronizedRef.update(state, (current) => ({ ...current, connectionLoss: loss })),
    executionCount: (sessionId, cellId) =>
      SynchronizedRef.get(state).pipe(
        Effect.map((current) => current.executions.get(executionKey(sessionId, cellId)) ?? 0),
      ),
    failNextDeletion: SynchronizedRef.update(state, (current) => ({ ...current, failDeletion: true })),
    retryCleanup,
    forbiddenModelText: ["provider-resource-", "fixture-control-secret"],
  }
})
