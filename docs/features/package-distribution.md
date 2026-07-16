# Package distribution

Public packages ship compiled ESM and declarations under `dist/`. Export maps point only to built files and list types before imports. Baton and third-party dependencies remain external, tarballs use an allowlist, and all Baton packages in one release use one exact version.

`bun run package` packs every public package, rejects workspace-only manifest values and unexpected files, installs the tarballs in clean Bun and Node consumers, imports public exports, typechecks consumer imports, and enforces package-size bounds. The publish workflow uses those verified tarballs.
