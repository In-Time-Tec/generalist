# E2B KernelPool adapter rejected

TenetKit does not provide `@tenetkit/e2b/repl` because E2B cannot currently enforce the remote
`KernelPool` ownership contract. This decision was checked against the current release, `e2b@2.46.1`
(npm integrity `sha512-OqYovS2oFrt4mk737CgfW/RoMadBYK84l5qjKpvbEoOB9KKxaZIXm7YUwOKSRTlijrrwDRX7oZlyPoVXiCpyTw==`,
tarball SHA-256 `3e9f1184b391e37ba5026d56b4dd6637c5456b52373843e941adf50c7009a922`, release commit
`de2a57f7370b120cce0e3ad1b8086e33377e7c91`).

The SDK can create from an exact template build reference, reconnect a stored sandbox ID, preserve memory or only the
filesystem when pausing, reconnect a running command by PID, list running and paused sandboxes, and permanently kill
either state. Those primitives are useful, but they do not provide a provider-side ownership fence. Sandbox metadata
is create-only, and neither the sandbox nor process APIs expose a generation, conditional update, compare-and-set, or
fencing token. A delayed old host command can therefore reach the guest after `KernelResourceAuthority` has granted a new
generation but before the guest learns that generation. A host-side `admit` followed by E2B `sendStdin` is the unfenced
provider call the Core contract rejects; a guest-maintained maximum generation merely makes arrival order authoritative.
Giving the guest credentials for the host resource authority would violate the credential boundary rather than fix it.

Creation has a second structural gap. `Sandbox.create` accepts no idempotency key or conditional-create identity. If a
host loses the response or stops after E2B creates the sandbox but before `KernelResourceAuthority.bind` stores its opaque
ID, retrying can create a duplicate. Listing by create-time metadata has no documented uniqueness or consistency
guarantee, so it cannot prove create-before-bind recovery.

Command reconnect also has no replay cursor, event sequence, or completed-result lookup. A TenetKit guest journal could
resolve that ambiguity and distinguish an exact terminal frame from `CellOutcomeUnknown`, but it cannot repair either
ownership gap. A deterministic E2B-shaped fixture would therefore prove the fixture, not the published provider
contract, and no adapter or simulated conformance is shipped. No credentialed lifecycle acceptance was run: no exact
immutable template build was supplied, and the structural contract already fails before hosted execution.

Reconsider this decision only when the pinned E2B service can atomically fence every guest command with the current
external generation and can recover one create operation without duplicate or forgotten resources. The resulting
adapter must then pass the shared remote conformance plus credentialed two-host, pause-mode, disconnect, deletion-retry,
and final provider-list leak checks against an exact immutable template build.

Evidence: E2B's [2.46.1 SDK source](https://github.com/e2b-dev/E2B/tree/de2a57f7370b120cce0e3ad1b8086e33377e7c91/packages/js-sdk/src),
[sandbox persistence contract](https://e2b.dev/docs/sandbox/persistence),
[template build references](https://e2b.dev/docs/template/tags), and
[create API](https://e2b.dev/docs/api-reference/sandboxes/create-sandbox).
