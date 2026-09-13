# Runtime hosts

One object-native durability engine serves application-owned hosts through local-directory or S3-compatible storage. An entrypoint existing is not provider qualification: this report does not claim live AWS S3 or R2 S3 API support without accepted remote evidence. SQL drivers and an alternate memory Runtime are not supported.

| Host / transport                     | Entrypoint                                                | Evidence / gate                                                                                                                                                                                                                                                                                                                               | Notes                                                                                                 |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node/Bun, test-only object simulator | `generalist/durability` + `generalist/testing/durability` | admission, approval-suspend, artifacts, atomicCommits, await-event, child-runs, fork-rewind, host-sessions, idempotent-start, multiWorkerClaims, notificationRecovery, operator-explain, operator-resolve-unknown, operator-retry, operator-scan, runTree, runtime, schedules, start-by-agent, steering, tool-runs, unknown-agent-on-recovery | Local runtime evidence only; not a production backend or provider qualification.                      |
| Node/Bun, local directory            | `generalist/durability/fs`                                | local object conformance and journal recovery                                                                                                                                                                                                                                                                                                 | Single-host canonical state; a replacement host cannot reach the directory. Not remote qualification. |
| Node/Bun + AWS S3                    | `generalist/durability/s3`                                | unmet                                                                                                                                                                                                                                                                                                                                         | No authorized remote AWS S3 qualification evidence has been accepted.                                 |
| Node/Bun + R2 S3 API                 | `generalist/durability/s3`                                | unmet                                                                                                                                                                                                                                                                                                                                         | No authorized remote R2 S3 API qualification evidence has been accepted.                              |

## Local evidence

The shared object-native runtime suite records its advertised capability names only when the complete suite passes. The test-only simulator is not restart-safe production storage. Transport unit tests and signed local HTTP fixtures provide local evidence, not remote-provider certification.

```sh
bun --bun vitest run packages/generalist/test/testing/runtime-driver/index.test.ts --no-file-parallelism
```

Test: [`testing/runtime-driver/index.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/testing/runtime-driver/index.test.ts)

## Remote qualification

All remote gates above remain unmet. Remote provider qualification requires explicit authorization, scoped identities, credentials, and bucket configuration before making requests. Passing one provider's S3 API checks does not establish another provider's behavior. Packaging does not qualify a remote provider.

## Report lifecycle

The committed [`hosts-report.json`](./hosts-report.json) uses schema version 1 for the current object-native contract. It records retained local evidence for its source revision; it does not promote remote gates. Remote evidence must be reviewed and integrated explicitly.
