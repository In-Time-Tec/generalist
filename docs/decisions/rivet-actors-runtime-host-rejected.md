# Rivet Actors Runtime host rejected at the Effect SDK gate

TenetKit does not provide `@tenetkit/rivet/actors` because the current published Rivet Effect SDK cannot satisfy the
mandatory one-runtime, typed Action/Schema/Effect/Layer contract. This decision was checked on 2026-08-30 against npm
`latest`, `rivetkit@2.3.10` and `@rivetkit/effect@2.3.10`, both from Rivet tag `v2.3.10` / commit
`957d4e482f404913ca1955d8ecc357533f6fd081`.

The `rivetkit` artifact has npm integrity
`sha512-E+H0lBc3O8dK9Pj7W2XW3VwrCnfpwYYm5LlsZyHrmk5bCrJIBdnEFdZXn5nsYMz0waCfP1ieyP6d1tdvBG76Dg==` and tarball SHA-256
`756c1f97b07536a6a36496207f6095da701e9fac9d5e15a5ae6bf5bc0d58856c`. The Effect SDK has npm integrity
`sha512-L+edS3WctQAHvM5DF9GbIvnceOgPAAhtGafRtoXp4Qm3orOPj8GR2Rq5WbTbJyZXD5H/4Eix6yPOQirBfAEAqg==` and tarball SHA-256
`e946b1a904cca58d1017ebd1f7a2dc3489c1232d76120bf551eb2d7fbe7b6222`. Its peers admit TenetKit's exact
`effect@4.0.0-rc.112` and one clean install contained only that Effect runtime, but its public export is `./src/mod.ts`.
That source calls `Schema.TaggedErrorClass`, which rc.112 does not export. Strict TypeScript with `skipLibCheck: false`
failed with TS2551 and dependent class errors; Bun 1.4.0 threw `TypeError: Schema.TaggedErrorClass is not a function`
while importing the module; Node 22.23.2 rejected the exported TypeScript under `node_modules` with
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. All three failures occur before actor construction.

Using raw `rivetkit` would bypass rather than pass the gate: issue #259 requires the SDK's typed Effect actions and
honest Effect error and requirement channels. A local wrapper, deep import of the SDK's unexported compiled files,
source patch, loader, cast, or second Effect would test a TenetKit workaround instead of the published contract, so no
adapter or facade is shipped.

The pinned source shows promising mechanisms but does not overturn the failed gate. Effect Actions are explicitly
[non-durable request-response calls](https://github.com/rivet-dev/actors/blob/v2.3.10/rivetkit-typescript/packages/effect/src/Action.ts#L8-L16).
Actor-local [`RawAccess.transaction`](https://github.com/rivet-dev/actors/blob/v2.3.10/rivetkit-typescript/packages/rivetkit/src/common/database/config.ts#L153-L181)
commits or rolls back unrestricted SQLite statements together, while
[`db`, `schedule`, and `cron`](https://github.com/rivet-dev/actors/blob/v2.3.10/rivetkit-typescript/packages/rivetkit/src/actor/config.ts#L376-L405)
are separate context mechanisms with no public transaction-enlistment API. Managed storage carries
[internal generation and SQLite-head expectations](https://github.com/rivet-dev/actors/blob/v2.3.10/engine/sdks/schemas/envoy-protocol/v3.bare#L120-L146),
but the public Actor context and `RawAccess` expose no incarnation, generation, CAS, or fencing token. These are
source/API findings, not hosted physical, delivery, or stale-incarnation proofs. No live actor was started.

Re-evaluate only after Rivet publishes a mutually compatible SDK that uses the current Effect API, exports Node-runnable
JavaScript plus declarations, strictly compiles public actions and Layers without erased channels, and imports under Bun
and Node in one exact Effect graph. Compatibility would reopen, not complete, the proof. The remaining live gates are:
one actor-local transaction through TenetKit's shared SQL lifecycle kernel; rollback of Run, Operation, Session, event,
and activation facts; fresh-incarnation stale-write rejection; #185 unknown/never-replay behavior across reset;
lost/duplicate schedule hints recovered from durable activation rows; hibernation, cancellation, child settlement,
replay, and schema mismatch; and final hosted-resource leak inspection. Rivet state, Workflow, queues, or schedules must
not become a second lifecycle authority to compensate for any failure.
