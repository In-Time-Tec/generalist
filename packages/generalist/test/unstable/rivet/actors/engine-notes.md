# Native Rivet lifecycle tests

`engine.ts` starts the Engine binary installed with the workspace Rivet SDK. Its
process, temporary configuration and storage, and loopback listeners are owned by
an Effect scope. Recovery registries share that Engine and explicitly target the
same test pool. Clients wait for `registry.startAndWait()` before making calls.

The Engine normally sheds workflow admission based on CPU usage in its cgroup.
In this fixture, that cgroup also contains the Vitest workers. Other suites can
therefore cause a healthy Engine to reject actor-creation workflows. The pinned
allocator hashes each workflow's unchanged wake timestamp, so rejected workflows
can remain unleased across polls until an actor-query deadline expires.

These tests qualify native lifecycle behavior, not overload admission policy. The
fixture configures `worker_load_shedding_curve` as `[[0, 1000], [1000, 999]]` in its
temporary Engine configuration. The Engine requires a strictly descending curve;
its candidate hashes range from 0 through 999 and it rejects only hashes above
the curve, so this setting keeps every workflow eligible. CPU measurements, the
native backend, and all actor-query and test deadlines remain unchanged.
