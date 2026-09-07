# Runtime hosts

One object-native durability engine serves every host. Public transport entrypoints exist, but availability is not qualification: this report does not claim AWS S3, R2, or native/S3 interoperability support without accepted remote evidence. SQL drivers and the alternate memory Runtime are not supported.

| Host / transport | Entrypoint | Evidence / gate | Notes |
| --- | --- | --- | --- |
| Node/Bun, test-only object simulator | `generalist/durability` + `generalist/testing/durability` | unmet: no passing object-native shared suite | Local runtime evidence only; not a production backend or provider qualification. |
| Node/Bun + AWS S3 | `generalist/durability/s3` | unmet | No authorized remote AWS S3 qualification evidence has been accepted. |
| Node/Bun + R2 S3 API | `generalist/durability/s3` | unmet | No authorized remote R2 S3 API qualification evidence has been accepted. |
| Cloudflare native R2 + S3 API | `generalist/durability/r2` | unmet | Native R2 and S3 API cross-transport qualification requires an authorized native endpoint contract and remote evidence. |
| Cloudflare Worker / Durable Object | `generalist/unstable/cloudflare/*` | unmet: host shared suite not registered | Native R2 transport and host-specific local checks do not certify remote recovery. |
| Rivet actor | `generalist/unstable/rivet` | unmet: host shared suite not registered | Host placement does not introduce a different durability engine. |

## Local evidence

The shared object-native runtime suite records its advertised capability names only when the complete suite passes. The test-only simulator is not restart-safe production storage. Transport unit tests, signed local HTTP fixtures, Worker bundles, and workerd tests provide local evidence, not remote-provider certification.

```sh
bun --bun vitest run packages/generalist/test/testing/runtime-driver/index.test.ts --no-file-parallelism
bun scripts/render-hosts.ts
```

Test: [`testing/runtime-driver/index.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/testing/runtime-driver/index.test.ts)

## Remote qualification

All remote gates above remain unmet. The remote provider runner requires explicit authorization, scoped identities, credentials, and bucket configuration before making requests. Passing its S3 API checks does not establish native R2/S3 interoperability, which requires separate native endpoint and cross-transport evidence. No remote qualification runs as part of package smoke.

## Report lifecycle

The committed [`hosts-report.json`](./hosts-report.json) uses schema version 1 for the current object-native contract, with no legacy report reader or migration path. Its producer accepts only the object-native shared suite. A registered suite that fails clears its local passing evidence. Runs that do not include the registered object-native suite leave the report unchanged.

The reporter cannot promote remote gates from local tests. Remote evidence must be reviewed and integrated explicitly. After the shared suite runs, regenerate this page with `bun scripts/render-hosts.ts`; `bun scripts/render-hosts.ts --check` rejects drift.
