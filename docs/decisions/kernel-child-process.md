# Run the cell kernel in a child process

`tenetkit/repl/bun` spawns each kernel as a child process rather than a `Worker` thread.

`@effect/platform-bun`'s `BunWorker` is thread-backed. Terminating a thread while a `vm` script is spinning takes the host process down with it: on Bun 1.3.14, `while (true) {}` inside a `BunWorker` followed by `terminate()` exits the **host** with `SIGTRAP`, code 133, in five runs out of five. Killing a wedged kernel is a required operation — a synchronous busy loop that escapes the `vm` watchdog is exactly what the last tier of the escalation ladder exists for — so a transport that cannot survive it is not a lifecycle boundary.

Over a child process the same case is survivable. `SIGKILL` on a spinning child leaves the host alive, the pool starts a new epoch, and the restart account names what the namespace lost. `bun-kill-restart.test.ts` asserts that property directly: it forks `while (true) {}`, restarts the Session, and checks that `process.pid` is unchanged and that the next cell still evaluates.

The escalation ladder is therefore three tiers:

1. `AbortSignal` — aborts async work inside the cell.
2. `vm` `timeout` and `breakOnSigint` — terminates a synchronous loop in place, leaving the context, its variables, and the worker alive.
3. child `SIGKILL` — new epoch plus best-effort snapshot restore.

Only the last tier loses state, and it reports exactly what was lost. Do not reintroduce a thread-based transport; process isolation is what makes the kill tier survivable.
