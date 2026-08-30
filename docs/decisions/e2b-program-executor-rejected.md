# E2B Program executor rejected

TenetKit does not provide `@tenetkit/e2b/program` because E2B cannot currently enforce the strict
`CodeExecutor` CPU contract. This decision was checked against `e2b@2.46.1` (npm integrity
`sha512-OqYovS2oFrt4mk737CgfW/RoMadBYK84l5qjKpvbEoOB9KKxaZIXm7YUwOKSRTlijrrwDRX7oZlyPoVXiCpyTw==`).

The pinned SDK exposes template CPU core count, post-hoc sandbox CPU utilization metrics, sandbox wall-clock timeout,
and command connection timeout. It exposes no cumulative per-invocation CPU-time budget. Sandbox timeout is rounded
up from milliseconds to whole seconds, command timeout is a ConnectRPC stream deadline, and command kill sends
`SIGKILL` to one PID rather than a process tree. Killing the fresh microVM on every exit would contain descendants, but
it would not turn wall time or delayed metrics into exact CPU-time enforcement.

Other required mechanisms exist: a sandbox can start from a specific immutable template build, creation can deny all
outbound traffic, and the control plane can kill and list running and paused sandboxes. Those mechanisms do not make it
honest to declare `Identity.limits.cpuMillis` as enforced, so `CodeExecutor.admit` would have to reject every E2B
execution. Shipping an unusable adapter or substituting a wall-clock timer for CPU accounting was rejected.

Reconsider this decision only when a pinned E2B provider or guest mechanism can enforce cumulative CPU milliseconds
for the complete hostile execution tree and pass the credentialed provider conformance suite, including observed
resource deletion. E2B's [internet controls](https://docs.e2b.dev/network/internet-access) and
[immutable build references](https://docs.e2b.dev/template/tags) remain documentation evidence only until those
behaviors are also exercised against the hosted service.
