# Separate the kernel frame channel from cell output, and authenticate it

The kernel's control plane runs on file descriptors 3 and 4. The worker writes frames to descriptor 3 and reads commands from descriptor 4; stdin, stdout, and stderr belong entirely to cell code. Every frame additionally carries a boot-time secret sent once over descriptor 4 and held in the worker's module scope.

Both halves are required, and neither is sufficient alone.

The descriptor alone settles output but not authorship. Cell code runs in the worker's own process, so it can call `writeSync(3, ...)` and put a well-formed line on the frame channel. Without the secret that line is indistinguishable from a real frame.

The secret alone does not settle output. A cell writes to stdout directly, through a native addon, or from a subprocess that inherited the descriptor, and those bytes must reach the model as ordinary output rather than being scanned for frames. Splitting the channel is what makes "everything on stdout is output" true.

`bun-frame-integrity.test.ts` covers each forgery a shared, unauthenticated channel admitted:

- a terminal frame attributed to another cell,
- a cell fabricating **its own** terminal result, which would replace the outcome every downstream certainty guarantee rests on,
- a forged control reply settling the host's own `Inspect` request,
- a frame written straight to descriptor 3,
- a cell reading stdin to consume the kernel's own commands.

The same file asserts that the secret is not reachable from `process.argv`, `Bun.argv`, `process.env`, `Object.keys(globalThis)`, or the process table. It travels on the private descriptor for that reason: argv and the environment are both readable by the cell, and the process table exposes argv to anything on the machine.

A forged frame is not discarded silently. It is delivered to the model as ordinary cell output, so the attempt is visible in the transcript.
