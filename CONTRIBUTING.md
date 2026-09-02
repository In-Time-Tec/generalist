# Contributing

Generalist accepts changes from authorized repository collaborators. The repository is private, so an external contributor must first request repository access through [In Time Tec's contact form](https://www.intimetec.com/contact-us) and identify the Generalist project and proposed contribution. If access is granted, discuss substantial contract changes in a GitHub issue before opening a pull request.

Keep pull requests focused, update the current contract and every affected caller, and include tests and user-facing documentation when behavior changes. Run `bun run check` and `bun run test` before requesting review. At least one Generalist maintainer must approve a pull request, required checks must pass, and review comments must be resolved before merge.

Generalist does not currently require a contributor license agreement. By submitting a contribution, you agree that it is your original work, that you have the right to submit it, and that it is licensed under the repository's [MIT License](LICENSE).

## Public API tiers

Imports under `generalist/*` are stable and follow semantic versioning. Imports under `generalist/unstable/*` may change in a minor release. Generalist does not re-export `effect/unstable/ai`; import `Prompt`, `Response`, `Tool`, `Toolkit`, and the other Effect AI types directly from that module.

| Stable                                                                                     | Unstable                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `generalist`                                                                               | `generalist/unstable/a2a`                            |
| `generalist/approvals`                                                                     | `generalist/unstable/ag-ui`                          |
| `generalist/compaction`                                                                    | `generalist/unstable/cloudflare/*`                   |
| `generalist/instructions` and `generalist/instructions/skills`                             | `generalist/unstable/foldkit`                        |
| `generalist/memory`                                                                        | `generalist/unstable/mcp/*`                          |
| `generalist/mysql` and `generalist/pg`                                                     | `generalist/unstable/providers/model-route`          |
| `generalist/permissions`                                                                   | `generalist/unstable/providers/openai-account-auth*` |
| `generalist/providers/*` except the unstable leaves at right                               | `generalist/unstable/rivet`                          |
| `generalist/repl` and `generalist/repl/bun`                                                | `generalist/unstable/runtime/external-child-*`       |
| `generalist/runtime`, `generalist/runtime/sql-driver`, and `generalist/runtime/sqlite-bun` | `generalist/unstable/sandbox/*`                      |
| `generalist/sandbox`                                                                       | `generalist/unstable/transport/*`                    |
| `generalist/testing` and `generalist/testing/runtime-driver`                               |                                                      |

Stable modules must not import modules under `src/unstable`. A service can move to the stable tier only when it provides its production `layer`, a deterministic `layerTest`, and a reusable conformance suite exported from `generalist/testing`. Promotion also requires complete public documentation and a maintainer review of the resulting semver commitment.

The tested Effect cohort is exactly `effect@4.0.0-rc.112`, matching the package peer dependency, workspace catalog, and frozen `bun.lock`. CI intentionally tests that one locked cohort. A minimum/current two-version matrix is deferred until the repository can represent both installations reproducibly with committed lockfile evidence; checks must not replace `bun install --frozen-lockfile` with an unfrozen install.
