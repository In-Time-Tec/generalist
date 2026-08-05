# Baton, Rika, And Relay Execution Waves

## Authority

`PLAN.md` remains the sole implementation and acceptance authority. This file is an operational schedule for executing that plan quickly with bounded parallel subagents. If this file conflicts with `PLAN.md`, follow `PLAN.md` and correct this file.

## Execution Rules

- The main session owns integration and Git operations.
- Only the main session commits, pushes, tags, releases, merges, or archives.
- Editing agents receive exclusive file ownership.
- Read-only agents can inspect overlapping areas.
- Each editing agent runs focused tests before returning.
- The main session integrates each wave before the next dependent wave starts.
- No wave uses more than six concurrent subagents.
- Release stop conditions in `PLAN.md` remain mandatory.
- Agents must not reset, clean, stash, discard, or modify unrelated worktree changes.

## Execution Status

| Wave | State       | Evidence                                                                                                                                                                                                     |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Complete    | All six reports returned. The missing-root-row diagnosis was false. Rika truncated replay on a descendant terminal event. Baton now provides page-draining `RunTree.watch`; all ten Rika adapter tests pass. |
| 1    | Complete    | Cancellation admission, shutdown recovery, tree watching, response races, scheduler fairness, and resolution projection are closed.                                                                          |
| 2    | Complete    | Exact Rika Program admission, QuickJS capability isolation, registration and credential payload proofs, restart, and cancellation pass.                                                                      |
| 3    | Complete    | Production review admission uses atomic root `initialFanOuts`: correctness, security, and quality; concurrency 3; `AllSettled`; `await`; no Rika ledger. Projection closure passes.                          |
| 4    | Complete    | Central boundaries are typed, Server composition passes, unreachable cross-Thread coordination is deleted, and policy and graph checks pass.                                                                |
| 5-7  | Complete    | Baton local gates, publication workflow `31014573121`, 13 public assets, and all 11 npm packages at `0.15.0` are verified.                                                                                    |
| 8    | Complete    | Rika pins published Baton `0.15.0`; frozen install, 20 canonical check tasks, 1,787 unit tests, the process gate, and 19 bounded TUI tests pass.                                                              |
| 9    | Complete    | Darwin local packaging and 22 release contract tests pass. Publish workflow `31031284335` packages and smokes all three native targets.                                                                      |
| 10   | Complete    | Rika `0.2.0` is public with five verified assets and four npm packages. A clean registry install reports `rika v0.2.0`.                                                                                      |
| 11   | In progress | Relay has zero open pull requests. Archive commit `5b1a1868` is ready to merge, then the repository can become read-only.                                                                                    |

Wave 0F confirmed these additional release gaps:

- PostgreSQL and MySQL need active model-call, active tool-call, and worker finalizer-order evidence.
- Registration tests need API-key, token, and credential-value fixtures across all persisted payloads.
- Nested root-tree projection needs an explicit root-completion retention assertion.
- Rika unknown-operation projection must expose a resolution-required state rather than label every unknown operation as a Program failure.
- `.pi-subagents/` and `release/` are execution artifacts and must not enter a commit.

## Wave 0: Baseline And Ownership

Subagents: six read-only agents.

| Agent | Type      | Assignment                                             | Required output                                                        |
| ----- | --------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| 0A    | `explore` | Trace root cancellation from Rika through Baton SQLite | Exact call path, database operations, likely owner, and relevant tests |
| 0B    | `oracle`  | Independently analyze the missing root Run claim       | Ranked hypotheses and the smallest correct fix                         |
| 0C    | `explore` | Map QuickJS Program admission and recovery             | Files, interfaces, missing registrations, and test seams               |
| 0D    | `explore` | Map review fan-out and root-tree projection            | Production gaps, obsolete paths, and file ownership                    |
| 0E    | `explore` | Reproduce Server Layer and central `any` debt          | Exact type errors grouped by owning boundary                           |
| 0F    | `explore` | Audit both repositories against `PLAN.md`              | Deletion list, evidence gaps, and release-gate commands                |

Main-session work:

- Capture Git status without modifying unrelated changes.
- Reproduce the current focused failures.
- Merge the six reports into a file ownership matrix.
- Freeze the contracts for Waves 1 through 4.
- Update `PLAN.md` only when source evidence disproves its current account.

Exit:

- Every unfinished requirement has one owner.
- No two editing agents will modify the same file.
- Root cancellation has a ranked, testable diagnosis.

## Wave 1: Baton Cancellation Closure

Subagents: four.

| Agent | Type             | Assignment                                                 | File ownership                                                                 |
| ----- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1A    | `sol`            | Fix root and child cancellation settlement                 | Baton cancellation, scheduler, active-execution, and settlement implementation |
| 1B    | `executor-terra` | Add PostgreSQL active model and tool cancellation evidence | PostgreSQL runtime tests only                                                  |
| 1C    | `executor-terra` | Add MySQL active model and tool cancellation evidence      | MySQL runtime tests only                                                       |
| 1D    | `oracle`         | Review the cancellation invariant and race behavior        | Read-only                                                                      |

Agent 1A must prove:

- The root Run remains stored throughout cancellation.
- A cancelling child interrupts locally.
- Every owned child settles before the root becomes terminal.
- Root cancellation emits one terminal event.
- Repeated scheduler ticks cannot reclaim an active local Run.
- Restart can reconcile a cancelling tree.
- No quiescence rule is weakened.

Agents 1B and 1C must prove:

- Cancellation during an active model call.
- Cancellation during an active tool call.
- Finalizer order.
- Stale workers cannot commit after cancellation.
- Fresh database execution does not depend on suite order.

Main-session work:

- Review all changes against the cancellation contract.
- Add the Rika source-aliased root cancellation regression if needed.
- Run Baton runtime tests.
- Run the complete Rika `baton-execution` suite.
- Run fresh PostgreSQL and MySQL suites.
- Commit the coherent cancellation change after all focused tests pass.

Exit:

- All ten Rika `baton-execution` tests pass.
- Baton main, PostgreSQL, and MySQL cancellation tests pass.
- The `PLAN.md` cancellation acceptance is closed.

## Wave 2: Durable Program And QuickJS

State: Complete.

Evidence: Exact Rika Program registration and admission, QuickJS capability isolation, restart reconstruction,
cancellation, and credential-payload proofs pass. The all-store Program contract passes.

This wave starts after Wave 1 stabilizes the Runtime.

Subagents: six.

| Agent | Type             | Assignment                                              | File ownership                                    |
| ----- | ---------------- | ------------------------------------------------------- | ------------------------------------------------- |
| 2A    | `opus-5`         | Implement exact Rika Program construction and admission | Rika Program executable and configuration modules |
| 2B    | `deepseek-flash` | Connect QuickJS to Baton `SandboxExecutor`              | QuickJS sandbox package and composition files     |
| 2C    | `executor-terra` | Implement persisted Program registration codecs         | Registration codec modules and codec tests        |
| 2D    | `executor-terra` | Add Rika Program admission and restart tests            | Rika Program tests only                           |
| 2E    | `sol`            | Extend cross-store Program evidence where missing       | Baton Program tests only                          |
| 2F    | `oracle`         | Review Program security and durability                  | Read-only                                         |

Required implementation and proof:

- Pin Program source, input, output, sandbox, tools, steps, Agents, services, and budget.
- Admit through `Runtime.start` and the canonical executable resolver.
- Reconstruct after restart without Rika Turn rows.
- Persist credential references only.
- Validate registration codecs, versions, payloads, and digests.
- Expose no ambient host, environment, credential, filesystem, database, or network authority.
- Enforce memory, stack, wall-time, output, cancellation, and budget limits.
- Prove direct execution, approval resume, restart replay, child and fan-out wake-up, replay divergence, unknown outcomes, cancellation, budget exhaustion, finalizer order, and sandbox escape rejection.

Main-session work:

- Integrate Program construction before dependent tests.
- Resolve shared executable configuration edits personally.
- Run direct, memory, SQLite, PostgreSQL, and MySQL Program suites.
- Walk one Rika Code Mode request through real Server composition.
- Commit only after restart evidence passes.

Exit:

- Rika admits and resumes an exact Program executable.
- All stores pass the required Program contract.
- QuickJS exposes only the pinned capability protocol.

## Wave 3: Review Fan-Out And Tree Projection

State: Complete.

Evidence: Production review admission is atomic with `Runtime.start.initialFanOuts`. It uses the immutable correctness,
security, and quality lanes, concurrency `3`, `AllSettled`, and `await`. Rika keeps no fan-out ledger. Projection closure,
including root completion retention, passes.

Subagents: five.

| Agent | Type             | Assignment                                    | File ownership                                   |
| ----- | ---------------- | --------------------------------------------- | ------------------------------------------------ |
| 3A    | `sol`            | Implement production review fan-out admission | Rika review admission and product policy modules |
| 3B    | `deepseek-flash` | Complete root-tree event projection           | Projection and execution-event adapter modules   |
| 3C    | `executor-terra` | Add review fan-out integration tests          | Review tests only                                |
| 3D    | `executor-terra` | Add root-tree cursor and terminal tests       | Projection tests only                            |
| 3E    | `oracle`         | Review fan-out and projection ownership       | Read-only                                        |

Required implementation and proof:

- Use immutable review lanes, stable member keys, explicit concurrency, a join mode, and a remainder policy.
- Use parent-relative child selections and restart-safe admission.
- Keep no Rika-owned fan-out ledger.
- Keep one opaque Baton tree cursor.
- Preserve explicit root, parent, invocation, call, and attempt identities.
- Retain root completion after nested traversal.
- Project child-attributed cancellation, Program logs, and unknown operations.
- Do not parse child identity or recursively discover children.
- Prove result ordering, concurrency, restart idempotency, cancellation, joins, remainder policy, root terminal visibility, and cursor replay.

Main-session work:

- Resolve overlap in the Baton execution adapter.
- Run focused review and projection suites.
- Run the complete Rika execution suite.
- Commit review and projection as separate units when boundaries permit.

Exit:

- Reviews use real Baton fan-out.
- Projection-only tests are not the sole evidence.
- Root-tree streaming satisfies release acceptance.

## Wave 4: Server Composition, Typing, And Deletion

State: In progress.

Evidence: Central executable, resolver, service Layer, and operation-admission boundaries are typed without `any`.
Repository policy and graph checks pass. The plan retains the Server composition and cross-Thread deletion requirements until
source and test evidence closes them.

Subagents: six.

| Agent | Type             | Assignment                                           | File ownership                        |
| ----- | ---------------- | ---------------------------------------------------- | ------------------------------------- |
| 4A    | `executor-terra` | Fix Server Layer composition                         | Server launch and product Layer files |
| 4B    | `deepseek-flash` | Remove `any` from executable and resolver boundaries | Executable and resolver modules       |
| 4C    | `executor-terra` | Remove `any` from operation admission boundaries     | Product operation modules             |
| 4D    | `executor-luna`  | Delete obsolete workflow and debug paths             | Confirmed obsolete files only         |
| 4E    | `executor-luna`  | Delete Relay, fallback, and cross-Thread remnants    | Confirmed obsolete files only         |
| 4F    | `oracle`         | Review the final dependency topology                 | Read-only                             |

Required implementation and deletion:

- Build product repositories before product operations.
- Give product operations only `ExecutionGateway.Service`.
- Keep parsing and queries from initializing Baton.
- Gate start, cancellation, and steering during Server replacement.
- Keep watch and inspection available during replacement.
- Resolve workspace capabilities from admitted metadata.
- Remove central `any` and unsafe schema-bypassing casts.
- Remove the debug child-request test, predefined workflows, Relay imports, broad Runtime mirrors, duplicate protocols, Rika recovery authority, stop intent, recursive child following, direct Baton table access, production fallbacks, Resident aliases, hardcoded paths, and unreachable cross-Thread coordination.

Main-session work:

- Verify every deletion has a canonical replacement.
- Run repository graph and policy checks.
- Run full typecheck and focused Server process tests.
- Commit composition, typing, and deletion in reviewable units.

Exit:

- Server composition typechecks.
- Central boundaries contain no `any`.
- No forbidden clean-break path remains.

## Wave 5: Documentation And Acceptance Audit

Subagents: four read-only agents.

| Agent | Type        | Assignment                                                     |
| ----- | ----------- | -------------------------------------------------------------- |
| 5A    | `general`   | Audit Baton behavior against `PLAN.md`                         |
| 5B    | `general`   | Audit Rika behavior against `PLAN.md`                          |
| 5C    | `librarian` | Verify package and framework claims against installed versions |
| 5D    | `oracle`    | Perform the final architecture and durability review           |

Main-session work:

- Correct stale Baton and Rika documentation.
- Update `CONTEXT.md`, package docs, and `PLAN.md` from executable evidence.
- Search for obsolete Relay, workflow, Resident, fallback, local-link, and table-access vocabulary.
- Reject documentation claims without executable proof.

Exit:

- Docs describe only implemented behavior.
- The acceptance checklist matches tests and source.
- No obsolete vocabulary remains.

## Wave 6: Baton Release Gates

Subagents: six verification agents.

| Agent | Type             | Assignment                                                     |
| ----- | ---------------- | -------------------------------------------------------------- |
| 6A    | `executor-terra` | Run `bun run check` and the full deterministic suite           |
| 6B    | `executor-terra` | Run fresh PostgreSQL contracts and crash takeover tests        |
| 6C    | `executor-terra` | Run fresh MySQL contracts and restart tests                    |
| 6D    | `executor-terra` | Build and pack every Baton package                             |
| 6E    | `executor-terra` | Test packed declarations and exports under Node and Bun        |
| 6F    | `general`        | Audit tarballs, checksums, exports, docs, and package metadata |

Isolation:

- PostgreSQL and MySQL use separate databases.
- Package verification uses temporary consumer projects.
- Verification agents do not edit source.
- Any failure returns to the owning implementation wave.

Main-session work:

- Review the complete evidence matrix.
- Verify the 500-line source limit.
- Verify no diagnostic or release artifact is included.
- Create final Baton commits and push the release branch.

Exit:

- Every Baton release criterion passes.
- The Baton worktree contains only intended changes.
- Baton `0.15.0` is ready for publication.

## Wave 7: Baton Publication

Subagents: three after workflow dispatch.

| Agent | Type             | Assignment                                                     |
| ----- | ---------------- | -------------------------------------------------------------- |
| 7A    | `executor-terra` | Monitor the GitHub release workflow and report failures        |
| 7B    | `executor-terra` | Verify GitHub assets and checksums                             |
| 7C    | `executor-terra` | Install and test every published npm package from the registry |

Main-session work:

- Create the required tag or release through the canonical workflow.
- Dispatch the GitHub release workflow.
- Correct workflow failures through the owning source path.
- Verify public version `0.15.0`.

Exit:

- GitHub release succeeds.
- Assets and checksums verify.
- Published packages import under Node and Bun.

## Wave 8: Rika Pin And Normal Verification

Subagents: five.

| Agent | Type             | Assignment                                                     |
| ----- | ---------------- | -------------------------------------------------------------- |
| 8A    | `executor-terra` | Pin published Baton packages and remove source aliases         |
| 8B    | `executor-terra` | Run normal Rika typecheck, lint, and unit tests                |
| 8C    | `executor-terra` | Run process, Server replacement, and recovery suites           |
| 8D    | `executor-terra` | Run TUI and deterministic provider suites                      |
| 8E    | `general`        | Audit the package graph for local links and Relay dependencies |

Main-session work:

- Integrate the dependency pin first.
- Remove `vitest.baton-source.config.ts`.
- Regenerate lockfiles through canonical package commands.
- Verify all tests use published Baton.
- Fix version-sensitive defects without compatibility code.

Exit:

- Rika uses published Baton `0.15.0` only.
- Normal checks pass without source aliases.
- No local link or Relay dependency remains.

## Wave 9: Rika Packaging And Smoke Tests

Subagents: six.

| Agent | Type             | Assignment                                             |
| ----- | ---------------- | ------------------------------------------------------ |
| 9A    | `executor-terra` | Package and smoke-test `darwin-arm64`                  |
| 9B    | `executor-terra` | Package and inspect `linux-arm64`                      |
| 9C    | `executor-terra` | Package and inspect `linux-x64`                        |
| 9D    | `executor-terra` | Verify the fresh product migration fingerprint         |
| 9E    | `executor-terra` | Run Code Mode and review acceptance flows              |
| 9F    | `general`        | Audit release artifacts, checksums, docs, and evidence |

Main-session work:

- Run final repository policy and graph checks.
- Review platform-specific package contents.
- Verify artifacts contain no developer path or local dependency.
- Create final Rika commits and push the release branch.

Exit:

- All three targets package.
- Release smoke passes.
- Migration and execution acceptance pass.
- Rika `0.2.0` is ready for publication.

## Wave 10: Rika Publication

Subagents: three after workflow dispatch.

| Agent | Type             | Assignment                                           |
| ----- | ---------------- | ---------------------------------------------------- |
| 10A   | `executor-terra` | Monitor the Rika release workflow                    |
| 10B   | `executor-terra` | Verify release assets and checksums                  |
| 10C   | `executor-terra` | Verify public npm packages and application artifacts |

Main-session work:

- Publish through the canonical GitHub workflow.
- Verify public version `0.2.0`.
- Test a clean installation against published Baton.
- Record final release evidence.

Exit:

- Rika `0.2.0` is public.
- Assets, checksums, packages, and smoke tests verify.

## Wave 11: Relay Archive

Subagents: three.

| Agent | Type            | Assignment                                                   |
| ----- | --------------- | ------------------------------------------------------------ |
| 11A   | `executor-luna` | Confirm Relay has no open pull requests                      |
| 11B   | `general`       | Review the archive notice and removed automation             |
| 11C   | `oracle`        | Confirm all archive prerequisites and repository cleanliness |

Main-session work:

- Verify Rika `0.2.0` remains public and functional.
- Create or finalize the archive commit.
- Push and merge the archive change.
- Run `gh repo archive In-Time-Tec/relayfx --yes`.
- Verify `isArchived: true`.

Exit:

- Relay has no open pull request.
- The archive commit contains no unrelated change.
- Relay is read-only and reports `isArchived: true`.

## Concurrency Summary

| Wave | Subagents | Purpose                        |
| ---- | --------: | ------------------------------ |
| 0    |         6 | Diagnosis and ownership        |
| 1    |         4 | Cancellation closure           |
| 2    |         6 | Program and QuickJS            |
| 3    |         5 | Review and projection          |
| 4    |         6 | Server, typing, and deletion   |
| 5    |         4 | Documentation audit            |
| 6    |         6 | Baton release gates            |
| 7    |         3 | Baton publication verification |
| 8    |         5 | Published Baton integration    |
| 9    |         6 | Rika packaging and smoke       |
| 10   |         3 | Rika publication verification  |
| 11   |         3 | Relay archive                  |

The schedule contains 54 bounded subagent assignments. The critical path is root cancellation, Program and review integration, Baton release, Rika release, and Relay archive.
