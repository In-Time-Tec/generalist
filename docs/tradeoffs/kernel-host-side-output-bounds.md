# Meter cell output in the host, not in the worker

A cell's bytes arrive by several routes: the kernel's own `console`, a direct `writeSync(1, ...)`, a native addon, and a subprocess that inherited the descriptor. Only the host sees all of them, so `limits.channelBytes` is enforced where they converge rather than inside the worker.

The gain is that one budget covers every writer. `bun-output-bounds.test.ts` asserts that a direct stdout write and a `Bun.spawnSync(..., { stdout: "inherit" })` subprocess both reach the model and are both charged against the same bound. Running project commands with inherited descriptors is the ordinary case for this kernel, so metering that could see only `console` would let the common path past the bound entirely.

The cost is one more hop for every byte: output crosses the process boundary before it is bounded, so a flooding cell writes more than the bound before the bound stops it from reaching the model. Truncation is reported rather than silent — each channel accounts for the bytes and events it dropped, an `OutputTruncated` event is streamed, and the cell's result carries the same account — so the flood is visible.

Worker-side metering was rejected on that coverage argument, not on cost. A bound that the profile advertises and the kernel cannot actually enforce is worse than a slightly later one.
