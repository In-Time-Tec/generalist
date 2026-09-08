# Generalist Product

Generalist turns agents from disposable chat sessions into durable workers. Start with an Effect-native agent in a TypeScript application. Add the durable Runtime when its work needs to survive a restart, wait for a person, or continue on a replacement host.

## The problem

Calling a model is easy. Keeping its work correct across tool calls, approvals, retries, and process failures is harder. An answer on screen does not establish whether a tool finished. Restarting a process does not tell you whether an external action is safe to repeat. Teams need execution infrastructure around the model loop before an agent can own work that matters.

Generalist makes that infrastructure part of the framework. Accepted commands, execution ownership, recorded outcomes, and conversation history have explicit authority. Recovery uses that evidence rather than starting the conversation over or blindly repeating a side effect.

## Who we serve

Generalist is for TypeScript teams building agents inside their own applications. The strongest fit is work that crosses turns, tools, human decisions, or host lifetimes: research, coding, approval-driven operations, and delegated tasks.

Developers compose typed behavior through Effect services and Layers. They choose their models, tools, storage configuration, interfaces, and deployment. A short-lived agent should remain a normal function call; durable execution should be an explicit next step, not a prerequisite for trying the framework.

## The architectural bet

Keep durable work independent of the machine executing it. `generalist` provides the process-local loop; `generalist/runtime` defines Runs, waits, replay, and typed recovery. `generalist/durability` implements that contract through one object-storage engine with S3 and native R2 transports. Local processes, servers, Cloudflare Durable Objects, and Rivet actors are compute hosts, not competing storage authorities.

Independent partitions provide a route to scaling across workloads. A waiting Run does not require its original execution process to remain alive. A replacement host can reconstruct accepted state when it has the required code, configuration, and resource access. Caches, wake notifications, and client views help execute and observe work; they do not decide what committed.

Object storage is a design choice, not a performance result. Commands within a partition serialize, partition materialization is bounded, and object requests carry latency and cost. Host capacity, reconciliation, and workload placement still need engineering. We do not promise automatic sharding, unlimited hot-partition throughput, or lower total cost without measured evidence.

## What users should gain

- **Continue accepted work after failure.** Stable command identities and immutable receipts distinguish a retry from a new action. Recorded outcomes guide recovery; uncertain external outcomes remain explicit rather than being reported as exactly-once execution.
- **Change direction without erasing consequences.** Forks and rewinds can change the active conversation while retaining incurred costs and external receipts. Reconsidering an answer must not pretend an external action never happened.
- **Observe progress without confusing it with completion.** Bounded, attempt-scoped previews stay separate from committed history. Reconnecting clients rebuild from committed snapshots and cursors.
- **Keep control of the application.** Effect-native composition makes service requirements, typed failures, scopes, and interruption visible. Applications retain responsibility for identity, authorization, executable registration, and deployment.

## What we are not building

Generalist is not a hosted service, general workflow engine, identity system, deployment platform, or turnkey product UI. Demo interfaces show how to integrate the framework; they are not a managed agent product. We do not replace model providers, search databases, or application-owned security policy.

Core remains usable without Runtime or storage. Durable execution has one current object-native contract, not a collection of SQL, memory, filesystem, or compatibility backends.

## How we earn the claim

Lead with the user problem, explain the mechanism, and demonstrate the outcome. A useful demo shows a concrete task and makes its scripted behavior, credentials, persistence, and failure boundaries visible. A useful architecture guide starts with system ownership and then explains the protocol that makes recovery possible.

All public exports remain `@experimental`. The object durability contract is the intended long-term storage boundary, not an API stability promise. Local simulator and emulator tests establish only their stated scope. Provider conformance, deployed recovery, scalability, and release readiness require evidence for the exact configuration being claimed; another system's results cannot establish ours.
