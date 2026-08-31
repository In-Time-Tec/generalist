# Rivet actors

One Rivet Actor owns one durable Runtime partition in actor-local SQLite.
Rivet schedules and cron wake the actor; SQLite remains the execution authority.

## Usage

```ts
import { Layer } from "effect"
import { createClient, setup } from "rivetkit"
import { Agent } from "generalist"
import { ExecutableResolver } from "generalist/runtime"
import { makeRuntimeActor } from "generalist/rivet/actors"

const runtimePartition = makeRuntimeActor({
  addresses: [{ address, executable, registrations }],
  resolver: ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, agentServices) }]).pipe(
    Layer.orDie,
  ),
})
const registry = setup({ use: { runtimePartition } })
const client = createClient<typeof registry>()
const partition = client.runtimePartition.getOrCreate(["tenant-7"])

const receipt = await partition.runtime.send({
  to: address,
  sessionId: "session:review-42",
  idempotencyKey: "send:review-42",
  prompt: "Review pull request 42",
})
await partition.runtime.drain()
const run = await partition.runtime.inspect(receipt.runId)
```

## What runs

```text
getOrCreate(["tenant-7"])
└── actor wake
    ├── open actor-local SQLite
    ├── allocate owner "actor-id:3"
    ├── recover stale claims, pages of 100
    └── drain authoritative activations, fuel 64

runtime.send({ idempotencyKey: "send:review-42", ... })
├── validate action input
├── SQLite transaction: admit Run "run_01J..."
└── arm lossy runtime.drain doorbell after commit

runtime.drain()
└── claim due activation from SQLite
    ├── resolve executable and run the agent
    └── commit Run { status: "succeeded", durability: "durable" }
```

If admission commits but its doorbell is lost, the next actor wake or periodic
cron drains the activation. If a wake replaces an interrupted owner, startup
increments the incarnation and recovers stale claims; never-replay work becomes
`needs-resolution` and is not dispatched again.

## Invariants

- One actor instance owns one Runtime partition and one actor-local SQLite handle.
- SQLite owns Runs, Sessions, events, operations, claims, and activation rows.
- Actions expose `send`, `signal`, `respond`, `cancel`, `resolveOperation`, `inspect`, and `drain` directly, without an RPC envelope.
- A successful mutating action arms a one-shot drain only after its Runtime transaction commits.
- Wake and cron are lossy doorbells; startup and periodic drains read authoritative activation rows.
- Drain fuel defaults to 64 and is clamped to at least 1.
- Recovery page size defaults to 100 and is clamped to 1–1000.
- The recovery interval defaults to 5 seconds and cannot be configured below 5 seconds.
- Every wake increments the persisted host incarnation; the owner ID is `<actorId>:<incarnation>`.
- Startup recovers stale Run and Session-writer claims before draining activations.
- Repeated drains converge through claim predicates and do not redispatch completed work.
- Sleep and destroy dispose the scoped `ManagedRuntime`; the adapter never closes Rivet's actor-owned SQL handle.
- Raw statements and transactions serialize; nested transactions fail with `SqlError`.
- SQL interruption waits for an in-flight statement or rollback to settle.
- The published `generalist/rivet/actors` subpath is ESM-only.

## Related

- Source: `packages/generalist/src/rivet/actors/`
- Site: `/docs/start/installation`, `/docs/reference/runtime/versioning`
- Decisions/tradeoffs: [Rivet actors Runtime host](../decisions/rivet-actors-runtime-host.md)
