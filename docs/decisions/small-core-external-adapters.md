# Keep the core small and integrations external

Generalist ships the process-local Agent loop, optional durable Runtime, generic server, protocol interoperability,
and the minimum implementations needed to develop and operate those contracts. Vendor services remain outside the
package behind focused Effect service contracts.

The package retains local-directory and S3 durability, provider-neutral model registration and routing, sandbox and
compute contracts, and MCP, A2A, and AG-UI adapters. It does not ship native vendor storage, vendor compute hosts,
hosted sandbox or workspace implementations, vendor model or embedding wrappers, account authentication, hosted
memory, realtime provider implementations, or product-specific client state.

Applications and ecosystem packages own those adapters, their SDK dependencies, credentials, deployment policy,
and qualification. There is no universal adapter interface: each public boundary carries only the authority and
invariants needed by its domain.

Foldkit remains an implementation detail of the code-first documentation renderer. It is not a Generalist product
integration or public package dependency.

Historical changelog entries and superseded decisions remain evidence of what earlier releases shipped. Current
feature documentation and generated reports describe only the retained package surface and executed evidence.
