# Make Generalist the first choice for Effect teams

Assessment date: 2026-09-05. The owner subsequently approved the repository implementation and a push to main. This does not authorize an npm release, new infrastructure deployment, or fabricated user-study results.

## Implementation status

- **Implemented:** corrected tutorial versions and search claims; shortened entry guides; added production ownership/recovery guidance; reorganized Mintlify into four task-oriented sections with collapsible Reference groups; installed the pinned Mintlify and Generalist writing skills.
- **Implemented:** extracted tutorial code is now typechecked, credential-free tutorial output is executed and compared, and public Generalist version drift fails the existing check. Research scaffold is typechecked, not a proven end-to-end browser application.
- **Implemented:** MySQL now registers all six identified missing capabilities. They passed against MySQL 8.4; no backend implementation change was necessary.
- **Fixed:** successful model completion could lose its replay cursor at interruption and redispatch after SQLite reopen. The durable checkpoint now retains the completed model operation until the loop consumes it; replay restores already charged tokens transiently. Tests include repeated interruption, budget extension, preserved capability state, and no model/tool redispatch.
- **Proven, not changed:** cancellation settlement storage failures retain recoverable state. Fresh SQLite tests distinguish retry-safe operations from never-replay unknown outcomes and exercise operator resolution.
- **Added public HTTP proof:** duplicate admission executes once, cancelling an SSE response leaves the Run alive, replay observes completion, unauthorized operator resolution is rejected, and separate tenant-owned Hosts/stores/credentials isolate Session, Run, blob, and event access. This is not shared-Host tenant authorization.
- **Still open:** broader rewrite beyond the entry-page pilot; live-provider and physical Cloudflare/Rivet checks; deployed search; three-person usability testing; design-partner recruitment and ongoing adoption measurement. These require credentials or actual participants and are not replaced by automated tests.

### Root PLAN.md reconciliation

Generalist's compact Session payload, atomic response commit, cursor recovery, and bounded/linear storage work already has executable coverage. The SQL Session tests passed during this implementation, including the 1/5/10/20-turn growth bound and fresh-layer response hydration. The full PostgreSQL/MySQL suites also passed at baseline. The new interruption regression shows why an existing test suite was not proof of every boundary.

Root PLAN.md's exact-release and Rika integration/product-release steps remain separate acceptance work. This push changes main only; it neither publishes a package nor verifies Rika. Do not delete those outstanding steps or redo already implemented storage work merely because the old plan lacks checkboxes.

### Implementation verification

- `bun run check`: passed, including build, documentation validation, formatting, repository rules, lint, and typecheck.
- `bun run test` with PostgreSQL and MySQL: **2,924 tests passed, 16 skipped**. Skips are credentialed Cloudflare, Daytona, and E2B paths, not database conformance. Scripted surfaces: **57 passed, 9 skipped, 0 failed**.
- After placing the new recovery cases under the existing RunExecutor suite to satisfy repository mirroring rules: **176 focused tests passed**, including RunExecutor, exclusive recovery, PostgreSQL/MySQL driver conformance, and Server.
- `bun run readme:check`: **17 extracted TypeScript blocks typechecked; 5 executed with matching output**. Public install versions match 0.61.0.
- Package smoke passed for the current implementation with fresh Bun/npm consumers and Worker entrypoint checks. A separate fresh directory installed the local tarball and Effect only, then ran the extracted offline quickstart: `Boise is sunny and 72°F; no jacket needed.` This is local artifact compatibility evidence, not a published release claim.
- Mintlify validation and broken-link checks passed. Desktop/mobile light/dark rendering, mobile navigation, expandable Reference groups, code-copy payload, and code overflow containment were inspected. Local development badges overlap a small lower-left area; deployed search and physical clipboard reads were not verified.

## Recommendation

Make the existing framework easier to learn, prove, and operate before adding more capabilities. The strongest promise is: **write an ordinary Effect-native agent, test it without credentials, and add durable execution when the application needs it.**

The repository already has tools, structured output, approvals, memory, compaction, multi-agent execution, MCP, budgets, tracing, evals, and multiple Runtime adapters. Another feature checklist will not establish leadership. A short path to working software, credible failure guarantees, and teams succeeding without maintainer intervention will.

Keep core independent of Runtime. Keep application identity, deployment, and production sandbox ownership with the application, as PRODUCT.md specifies. Do not turn adoption work into building a hosted platform.

## Evidence and findings

### Confirmed documentation defects

1. **Stale installation commands.** `docs/start/research-agent.md:19,414` and `docs/start/cell-agent.md:22` pin Generalist 0.45.0 while the manifests and installation page describe 0.61.0. This proves documentation drift, not that every old-version example fails.
2. **Misleading search description.** The research tutorial advertises a real `web_search` tool, but its shown handler returns canned results (`docs/start/research-agent.md:47-63`). Its body correctly says one environment variable activates a real model; the title/description should distinguish that from live search. The finished application's Exa integration is separate (`examples/deep-research-agent/server/src/web-search.ts:187-199`).
3. **Checks miss those defects.** `scripts/readme-check.ts` checks four entry documents, not the full tutorial set. Mintlify validation and link checks pass despite the stale versions. Executable snippet files do not, by themselves, prove that Markdown matches them.

### Confirmed adoption and certification gaps

- `docs/docs.json` puts seven start pages, eight learning pages, and 22 guides in the first tab. Advanced research/UI and kernel tutorials compete with basic onboarding. Reference, features, and API material overlap without a clear reader-facing distinction.
- `docs/deployment.md` means deploying the documentation site, not deploying an agent application. A connected production journey is missing from the onboarding path; scattered server and host references are not a replacement.
- `examples/five-minutes` already demonstrates local execution and SQLite recovery but is absent from the examples table. Reuse it rather than building another starter framework.
- MySQL advertises multi-worker support but registers fewer shared conformance capabilities than PostgreSQL. Audit admission, approvals, run trees, claims, notifications, and transaction coverage before interpreting missing registrations as missing implementation. MySQL also has separate transaction and model-response fault suites.
- Cloudflare and Rivet have host-specific tests but do not register the shared Runtime driver suite. The host documentation already labels this honestly; these are certification gaps, not newly discovered failures.
- Existing budget, telemetry, evaluation, and tool authorization implementations mean these should be audited and taught, not proposed as new subsystems. Application tenant authorization needs an explicit integration example; do not infer that tool permissions provide application-level tenant isolation.

### Runtime bug candidates: reproduce before changing

| Candidate                                            | Evidence                                                                                                                                           | Decisive test                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cancellation settlement encounters a storage failure | `packages/generalist/src/runtime/execution/interruption.ts:72-98` performs several settlement mutations and converts remaining failures to defects | Fail each store mutation, close/reopen, reclaim, and prove an authoritative terminal or operator-resolvable state without duplicate side effects |
| Interruption during successful stream commit         | `packages/generalist/src/core/durable/driver/interpreter.ts:332-340` commits after output exhaustion in an interruptible region                    | Pause inside commit, interrupt, reopen, and verify retry-safe recovery and never-replay unknown-outcome handling                                 |

Neither candidate is a confirmed framework bug. Existing recovery may already make these sequences correct. Inspect the whole claim/recovery path and add the smallest missing test; change code only after demonstrating a violated contract. Do not add blanket retries or make every commit uninterruptible as a precaution.

A suspected Effect-canary credential mismatch was rejected: a local equality check confirmed that service credentials match client configuration. Redacted tool output was not reliable evidence of a mismatch.

### Roadmap reconciliation

The root PLAN.md is a Generalist/Rika linear-history migration plan, not an adoption roadmap. Compact payload and linear-growth tests already exist in `test/runtime/sql/session/payload-codec.test.ts` and `store.test.ts`. Reconcile each Generalist item against implementation, passing tests, and release evidence before calling it unfinished. Keep Rika-owned work in Rika; do not overwrite the root plan or assume its release steps have completed.

## Delivery order

Each numbered item is an independently shippable task/thread. Documentation work can proceed alongside reliability testing; avoid concurrent edits to the same files.

### 1. Repair onboarding accuracy

**Owner:** documentation maintainer. **Priority:** first.

- Correct stale install commands and distinguish scripted tools, live models, and live search.
- Make tutorial code and its linked finished example agree, or state the intentional differences.
- Extend existing documentation checks to catch package-version drift and validate the actual tutorial snippets. Avoid a second version authority or a new documentation toolchain.
- Surface the existing five-minute example with exact commands, prerequisites, and expected output.

**Done when:** a fresh consumer can copy the offline quickstart successfully; the real-provider installation typechecks; all install commands match their intended compatibility cohort; model and search credentials are explained independently. Live-provider behavior requires a separate credentialed check, not a scripted substitute.

### 2. Establish a trustworthy reliability baseline

**Owner:** Runtime maintainer. **Priority:** first, parallel with task 1.

- Run `bun run check`, `bun run test` with PostgreSQL and MySQL available, and existing package smoke checks from an identified revision.
- Reconcile the root migration plan with current implementation and release evidence.
- Record failures, skips, tested capabilities, and environment. Do not treat a preserved historical host report as evidence that an adapter ran today.

**Done when:** there is a reproducible baseline with no unexplained failures and an explicit list of untested hosts. This assessment's partial tests are not that baseline.

### 3. Resolve the two interruption candidates

**Owner:** Runtime maintainer. **Dependency:** baseline sufficient to attribute failures.

Test each candidate separately using deterministic pause/fault boundaries and a fresh Layer or reopened database. Assert caller-visible error, persisted state, provider/tool invocation count, and operator recovery. Include claim loss and cancellation ordering where they affect the specific sequence.

**Done when:** each candidate is either a demonstrated bug with a regression test and small fix, or a documented correct sequence backed by a test. Preserve typed failures, visible scope ownership, and strict replay.

### 4. Close advertised adapter proof gaps

**Owner:** adapter maintainer.

Start with MySQL: compare its actual guarantees with the shared capability contract, register supported capabilities, and fix demonstrated failures. Keep unsupported guarantees explicit. Follow with Cloudflare/Rivet harnesses only if teams need those hosts; do not delay core adoption for experimental-host parity.

**Done when:** every advertised guarantee has current execution evidence on its host, and experimental status cannot be mistaken for certification. Physical hosted-runtime checks remain distinct from local emulation.

### 5. Rewrite the front door and simplify Mintlify

**Owner:** documentation maintainer. **Dependency:** task 1; use one pilot before a broad rewrite.

Use four primary sections rather than expanding the current sidebar:

- **Start:** what Generalist does, installation, one quickstart, connect a model.
- **Build:** tools and typed output first; then context, approvals, testing, integrations, and complete application tutorials in small task groups.
- **Operate:** choose local or durable execution, choose storage, serve an agent, deploy, inspect, cancel, and recover.
- **Reference:** generated API, precise contracts, compatibility and limits. Keep design rationale available but secondary.

Keep existing URLs where possible and add redirects for moved pages. Preserve feature documents as the authority for behavior without making every invariant part of onboarding. Do not rewrite generated API pages by hand.

Pilot the new style on the landing page, quickstart, and tools guide. Each guide should have one reader goal, prerequisites, a working example, expected output, the likely failure, and a next step. Explain Layers and error requirements only as needed. Remove repeated introductions, summaries, and internal terms such as “seam” when an ordinary word works.

Use Mintlify configuration and built-in components first: clear hierarchy, a few next-step cards, tabs only for actual choices, and expandable optional detail. Do not hide required code or safety warnings. No custom theme or CSS layer without a demonstrated need.

**Done when:** three Effect developers unfamiliar with Generalist can run an agent within ten minutes, add a tool, and find restart guidance without coaching. Inspect desktop/mobile and light/dark rendering, keyboard navigation, code copying, search on the deployed site, and redirects. Record an inspected preview and run `bun run docs:build`.

### 6. Teach the production path using existing primitives

**Owner:** framework maintainer with a documentation reviewer.

Build on existing examples to show: request identity and host-owned authentication; tenant isolation at every exposed resource; bounded tools, budgets and deadlines; secrets and redaction; tracing a failed run; graceful shutdown; approval/resume; unknown outcomes; and storage upgrade/recovery expectations. Explain allow-all/auto-approve defaults prominently before write-capable tools. Distinguish trusted-local code execution from a production security sandbox.

Pair a short operator guide with executable flows. Verify two-tenant denied access, disconnect without cancellation, duplicate admission, restart after tool completion, and manual resolution of an uncertain side effect. Do not add an identity platform, dashboard, or new sandbox implementation to satisfy the guide.

**Done when:** a team can operate the supported deployment path and identify who owns each failure without reading framework internals. Missing framework behavior exposed by these flows becomes a separate, reproduced issue.

### 7. Prove the value with real teams

**Owner:** product/maintainer lead. **Dependency:** a reliable core path and rewritten onboarding.

Recruit three Effect-native design partners with different workloads: a tool-using assistant, a durable approval workflow, and a background research task. Measure time to first useful agent, maintainer interventions, repeated type errors, recovery success, and weekly continued use. Prioritize repeated friction over hypothetical integrations.

Publish an honest comparison with using Effect AI directly: what Generalist adds, what it costs, and when not to use Runtime. Establish a compatibility/update policy around the pinned Effect prerelease and a clear issue-response path. Build migration guidance from actual releases rather than promising API stability the project does not yet provide.

**Done when:** teams independently build and operate real workloads and the next roadmap comes from repeated evidence. Downloads and breadth of exports alone do not establish “de facto” status.

## Documentation skills to bring in

Use at most two complementary skills, installed in `.agents/skills/` as a separate documentation-enablement task:

1. **Mintlify maintenance:** the official MIT-licensed [Mintlify skill](https://github.com/mintlify/docs/blob/main/skill.md), reviewed for navigation, components, styling, and validation guidance. Import a pinned revision with its license. Adapt its automatic `mint index` installation and global CLI-install instructions to the repository's existing tools; no additional MCP server is needed for this task. Do not blindly inherit the current verbose voice simply because the upstream skill says to match surrounding pages.
2. **Writing Generalist documentation:** a short repository-specific skill for the reader-first page pattern in task 5, verified examples, plain language, progressive detail, and correct separation of tutorials, explanations, how-to guides, and reference. Include one before/after example from the pilot, not a large generic writing manual.

Both skills are now installed in the repository and loaded. The upstream Mintlify revision and license are recorded beside its adapted skill. Review the pilot to decide whether both skills earn their maintenance cost; remove redundant instructions rather than stacking more skills.

## Original assessment verification and limits

- Focused durable/recovery/driver tests: **126 passed, 100 skipped**. PostgreSQL's 38 and MySQL's 62 selected tests skipped because their databases were unavailable. Not adapter conformance evidence.
- `bun run --cwd examples/five-minutes start`: printed the local answer and the recovered durable answer successfully.
- `bun scripts/readme-check.ts`: **README and quickstart TypeScript blocks: 4 passed**.
- Documentation audit: `bun run docs:build` passed validation and link checks; local Mintlify rendering was inspected. Local search required Mintlify login, so search quality was not verified.
- No full check/test/package run, live-provider calls, production-host test, published-package verification, external-team study, or exhaustive security audit was performed. No runtime bug is claimed confirmed by this assessment.
- The assessment originally added only this plan. The implementation status above supersedes that scope. Existing untracked `apps/` content remains untouched.
